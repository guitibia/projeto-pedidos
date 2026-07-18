# Conciliação que aprende (código do pedido × cProd da NF) + Excluir pedido — Design

**Data:** 2026-07-16
**Branch:** `Teste` (banco `db_pedidos_teste`). Nada vai para `main`/produção sem pedido explícito.
**Feature-mãe:** "Pedidos das Clientes + conciliação com a NF" (ainda NÃO publicada — está só na `Teste`).

## Problema (encontrado testando na prática)

O usuário monta o "Pedido da Cliente" digitando o **código do catálogo** (ex.: Natura `160380`), mas a NF
traz outro identificador no `cProd` (ex.: SAP `000000000050512547`). São sistemas de código diferentes
para o mesmo produto — o `160380` **não existe na NF** (a NF tem `cProd`, `cEAN` e a descrição `xProd`).
Resultado: a conciliação por código não casa. Não há uma chave automática 100% confiável (só 62 de 185
produtos têm EAN). Decisão do usuário: **conciliação que aprende** — casa uma vez na mão, memoriza o
vínculo, e daí pra frente casa sozinho (mesmo princípio que a importação de NF já usa com produtos via
`nf_item_vinculos`).

## Como funciona hoje (o que será reaproveitado)

- `src/services/conciliacaoNf.js` → `conciliar(nfItens, linhasPendentes)`: função pura que casa por
  `codigo` (normalizado) e aloca por ordem de chegada. **Não muda.**
- `demandaController.aplicarConciliacao(conn, nfId, emitenteCnpj)`: roda dentro da transação da importação
  de NF (atrás da flag `conciliar`, com SAVEPOINT). Hoje monta `nfItens` com `codigo = cProd` e casa contra
  `demanda_itens.codigo`. Também faz backfill de `product_id` na linha via `prodPorCod` (cProd→product_id).
- `demanda_itens` tem `codigo` (texto livre), `fornecedor_cnpj`, `product_id` (preenchido quando casa),
  `qtd_recebida`, `status`, `order_id`.
- `demanda_conciliacoes (nf_id, demanda_item_id, qtd, UNIQUE(nf_id, demanda_item_id))` garante idempotência.
- `nf_entrada_itens` tem `cprod`, `descricao`, `quantidade`, `product_id`, `ean`.
- UI em `src/public/demanda.html` (abas Pedidos / Comprar / Conciliação).

## Decisões (confirmadas com o usuário)

1. Conciliação **que aprende**: memória de vínculos por fornecedor.
2. A conciliação passa a casar **traduzindo o `cProd` da NF para o código do pedido** via a memória; o
   casamento por código igual (`cProd == codigo`) continua como fallback.
3. **Tela de conferência**: os itens da NF que não casaram aparecem para o usuário ligar na mão a uma linha
   de pedido pendente; ao ligar, grava o vínculo e reconcilia.
4. **Excluir pedido** criado por engano (com aviso se já houver venda).

## Modelo de dados

Tabela nova (migração idempotente em `connection.js`):

```sql
CREATE TABLE IF NOT EXISTS demanda_cod_vinculos (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  fornecedor_cnpj VARCHAR(14) NOT NULL,   -- = nf_entradas.emitente_cnpj
  cprod           VARCHAR(60) NOT NULL,   -- código que vem na NF (SAP)
  codigo_pedido   VARCHAR(60) NOT NULL,   -- código que o usuário usa no pedido (catálogo)
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_forn_cprod (fornecedor_cnpj, cprod)
);
```

Um vínculo diz: "para este fornecedor, o `cProd` X corresponde ao meu código de pedido Y".

## Conciliação automática (aplicarConciliacao revisado)

Mudança mínima: **traduzir o `cProd` para o código do pedido antes de chamar `conciliar`** (a função pura
não muda). Passos:

1. Carregar os vínculos do fornecedor:
   `SELECT cprod, codigo_pedido FROM demanda_cod_vinculos WHERE fornecedor_cnpj = ?` → `mapCprod`.
2. Montar `nfItens` com `codigo = mapCprod.get(cprod) || cprod` (traduz se houver vínculo; senão usa o
   próprio cProd — fallback do código igual).
3. `prodPorCod` (para backfill de `product_id`) passa a ser chaveado pelo **código traduzido**, não pelo
   cProd cru, para o `product_id` continuar sendo gravado na linha certa.
4. O resto (`conciliar`, alocação, `demanda_conciliacoes`, status) permanece idêntico.

Efeito: `cProd 50512547` com vínculo → vira `160380` → casa a linha de pedido `160380`. Sem vínculo, casa
só se `cProd == codigo` (comportamento atual).

## Conferência manual (o "aprender")

Endpoints novos em `demandaController` + rotas:

- `GET /api/demanda/nf/:nfId/conferir` → devolve:
  - `nf`: `{ id, emitente_nome, emitente_cnpj, numero }`.
  - `itens`: itens da NF (`cprod`, `descricao`, `quantidade`, `product_id`, `produto_nome`), com
    `alocado` (soma em `demanda_conciliacoes` p/ aquele cprod) e `casou` (bool: já vinculado ou casado).
  - `pendentes`: linhas de pedido do fornecedor ainda `pendente/parcial`
    (`demanda_item_id`, `codigo`, `nome`, `cliente`, `qtd_pedida`, `qtd_recebida`), para o seletor.
  - Escopo por `fornecedor_cnpj = emitente`.
- `POST /api/demanda/conciliar-manual` body `{ nf_id, cprod, codigo_pedido }`:
  - Valida nf/cprod; confirma que o `cprod` existe naquela NF e pega o `emitente_cnpj`.
  - `INSERT ... ON DUPLICATE KEY UPDATE` em `demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido)`.
  - Se houver linhas de pedido com aquele `codigo_pedido` e `fornecedor_cnpj IS NULL`, seta o
    `fornecedor_cnpj = emitente` nelas (aprende o fornecedor também, pra entrarem no escopo).
  - **Re-roda `aplicarConciliacao(conn, nf_id, emitente_cnpj)`** numa transação — reaproveita toda a lógica
    de alocação; agora o vínculo faz o item casar. Idempotente (UNIQUE em `demanda_conciliacoes`).
  - Retorna `{ ok: true }`.

**UI (`demanda.html`, aba Conciliação):** um seletor "Conferir NF importada" lista as NFs recentes; ao
escolher uma, mostra os itens da NF com o status (casou / não casou, e pra qual produto) e, para cada item
**não casado**, um `<select>` com os **códigos de pedido pendentes** do fornecedor → ao escolher, chama
`conciliar-manual` e recarrega (o item passa a "casou"; o relatório veio×faltou atualiza). Dado no DOM via
`esc()`.

## Excluir pedido

- `DELETE /api/demanda/:id`:
  - 404 se não existe.
  - Se **algum item já virou venda** (`order_id IS NOT NULL`) → **409** com mensagem
    ("Este pedido já gerou venda; não pode ser excluído."). (Não desfaz venda/estoque.)
  - Senão: apaga `demanda_conciliacoes` dos itens do pedido, apaga `demanda_itens`, apaga
    `demanda_pedidos` — tudo numa transação. Não mexe em estoque (a conciliação não movimenta estoque).
  - Retorna `{ ok: true }`.
- **UI:** botão de excluir (lixeira) em cada pedido da lista, com confirmação SweetAlert. Se vier 409,
  mostra o aviso.

## Tratamento de erros / validação

- IDs inválidos → 400; NF/pedido/item inexistente → 404; venda existente no excluir → 409.
- `conciliar-manual`: `cprod` que não está na NF → 400; `codigo_pedido` vazio → 400.
- Conciliação manual roda em transação com rollback no erro; nunca deixa vínculo salvo sem reconciliar.

## Testes

- `conciliacaoNf.js` (pura): **inalterada** — testes atuais continuam válidos.
- `aplicarConciliacao` com vínculo: cria vínculo (fornecedor, cProd→codigo_pedido), importa NF com esse
  cProd → a linha de pedido com o código do catálogo casa (veio/parcial). Sem vínculo e com cProd==codigo →
  casa (fallback). Idempotência mantida ao re-rodar.
- `conciliar-manual`: grava o vínculo, seta fornecedor_cnpj nulo→emitente, reconcilia e a linha casa; 2ª NF
  com o mesmo cProd casa automático (sem manual).
- `GET .../conferir`: devolve itens da NF + pendentes do fornecedor com os campos certos.
- `DELETE /api/demanda/:id`: apaga pedido sem venda (e suas conciliações); 409 se algum item tem `order_id`.

## Ondas de implementação

- **Onda 1 (backend):** tabela `demanda_cod_vinculos`; `aplicarConciliacao` traduz cProd→código; endpoints
  `conferir`, `conciliar-manual`, `DELETE /:id`; rotas; testes.
- **Onda 2 (UI):** tela de conferência (seletor de NF + linkar não-casados) e botão de excluir pedido em
  `demanda.html`.

## Fora de escopo

- Casar por EAN/nome automaticamente (pode virar melhoria futura como sugestão na tela de conferência).
- Editar/desfazer um vínculo já aprendido (ver [[project-pedidos-clientes-conciliacao-nf]] p/ evolução).
