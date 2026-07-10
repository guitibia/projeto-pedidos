# Pedidos das Clientes + Conciliação com a NF — Design

**Data:** 2026-07-10
**Branch:** `Teste` (banco `db_pedidos_teste`). Nada vai para `main`/produção sem pedido explícito.

## Objetivo

Registrar o que cada cliente pede (por cliente), agrupar automaticamente por fornecedor para
comprar e, quando a NF de entrada chegar, **conciliar automaticamente** pelo código do fornecedor:
marcar o que veio, o que veio parcial e o que faltou, gerar relatório por cliente e por
fornecedor, e permitir gerar a venda do que chegou (com baixa de estoque) e avisar a cliente no
WhatsApp.

## Contexto (o que já existe e será reaproveitado)

- **Venda** = `orders` + `order_products` + baixa de estoque (`Saída`) — `orderController.js:52-75`.
- **NF de entrada** já resolve `código do fornecedor (cProd) → produto` e **soma a entrada no
  estoque** — `nfController.js:84-105`. Guarda `nf_entradas(emitente_cnpj, ...)`,
  `nf_entrada_itens(cprod, ean, quantidade, product_id, ...)` e o vínculo
  `nf_item_vinculos(emitente_cnpj, cprod → product_id)`.
- **products**: `id, name, code, ean, franchise, cost, sale_value, estoque`.
- **clients**: `id, name, phone, ...` (telefone da cliente na coluna `phone`).
- Padrões do painel: Bootstrap 5 + SweetAlert2, `Auth.apiFetch`, `esc()`, middleware `authMiddleware`.

## Decisões (confirmadas com o usuário)

1. O pedido guarda **qual cliente** pediu cada item (vínculo item ↔ cliente). — versão completa.
2. A conciliação casa pelo **código do fornecedor** (o mesmo que o usuário digita no app do
   fornecedor e que vem na NF como `cProd`). Match sempre **escopo por fornecedor** (`fornecedor_cnpj`),
   nunca por código solto.
3. Entrada **por cliente**; a lista de compra por fornecedor é uma **consulta agregada** (não há
   tabela de "pedido de compra").
4. Escopo alvo: **B** (núcleo de conciliação + gerar venda + baixa de estoque + aviso WhatsApp),
   implementado em duas ondas.
5. Gerar venda = **abre um rascunho** na tela de "novo pedido" pré-preenchida; o usuário ajusta
   preço/pagamento e confirma. Não cria a venda direto.

## Modelo de dados (migração idempotente em `connection.js`, só `CREATE TABLE IF NOT EXISTS`)

```sql
CREATE TABLE IF NOT EXISTS demanda_pedidos (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  client_id  INT NOT NULL,
  observacao VARCHAR(255) NULL,
  status     VARCHAR(12) NOT NULL DEFAULT 'aberto',   -- aberto | parcial | concluido
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (client_id)
);

CREATE TABLE IF NOT EXISTS demanda_itens (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  pedido_id      INT NOT NULL,
  fornecedor_cnpj VARCHAR(14) NULL,      -- casa com nf_entradas.emitente_cnpj
  fornecedor_nome VARCHAR(160) NULL,     -- rótulo amigável (ex.: "Natura")
  codigo         VARCHAR(60) NOT NULL,   -- código do fornecedor (= cProd da NF)
  nome           VARCHAR(200) NULL,
  qtd_pedida     INT NOT NULL,
  qtd_recebida   INT NOT NULL DEFAULT 0,
  preco_venda    DECIMAL(10,2) NULL,     -- quanto cobrar da cliente (opcional)
  product_id     INT NULL,               -- preenchido quando casa/cria o produto (via NF)
  status         VARCHAR(12) NOT NULL DEFAULT 'pendente', -- pendente | veio | parcial | faltou
  order_id       INT NULL,               -- venda gerada (onda 2)
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX (pedido_id),
  INDEX (fornecedor_cnpj, codigo)
);

CREATE TABLE IF NOT EXISTS demanda_conciliacoes (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  nf_id        INT NOT NULL,
  demanda_item_id INT NOT NULL,
  qtd          INT NOT NULL,             -- quanto essa NF alocou nessa linha
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_nf_item (nf_id, demanda_item_id)
);
```

`demanda_conciliacoes` é o registro que garante **idempotência**: reprocessar a mesma NF não
soma `qtd_recebida` em dobro (o `UNIQUE(nf_id, demanda_item_id)` + verificação impedem duplicação).

**Fornecedor:** escolhido de uma lista alimentada pelo histórico (`SELECT DISTINCT emitente_nome,
emitente_cnpj FROM nf_entradas`). Se o usuário digitar um fornecedor sem CNPJ conhecido, a linha
fica com `fornecedor_cnpj = NULL`; na primeira NF cujo `cProd` casar com o código da linha e o
`fornecedor_nome` bater (case-insensitive), o CNPJ é preenchido.

## Arquitetura

- `src/services/conciliacaoNf.js` — **função pura**, sem banco nem HTTP.
  - `conciliar(nfItens, linhasPendentes)` onde:
    - `nfItens`: `[{ codigo, qtd }]` (agregado por código a partir de `nf_entrada_itens`).
    - `linhasPendentes`: `[{ id, codigo, qtd_pedida, qtd_recebida, created_at }]` já filtradas
      pelo fornecedor.
    - Retorna `{ alocacoes: [{ demanda_item_id, qtd }], extras: [{ codigo, qtd }] }`.
  - Regra de alocação: para cada código, distribui a qtd recebida entre as linhas em **ordem de
    `created_at` (mais antiga primeiro)**, respeitando o que cada linha ainda falta
    (`qtd_pedida - qtd_recebida`). Sobra vira `extras`.
- `src/controllers/demandaController.js` — CRUD + lista de compra + relatórios + gancho de venda.
- `src/routes/demanda.js` — rotas REST (todas atrás de `authMiddleware`).
- `src/public/demanda.html` + link no menu do painel (padrão das outras telas).
- **Gancho na importação de NF:** em `nfController.importar`, após gravar `nf_entrada_itens`,
  se `req.body.conciliar === 'true'` (ou `'1'`), chamar um passo `aplicarConciliacao(conn, nfId,
  emitente_cnpj)` **dentro da mesma transação**. Se a conciliação lançar erro, **não** derruba a
  importação da NF: captura, loga e segue (o estoque já somado permanece). Sem a flag, o
  comportamento atual da importação fica idêntico.

### `aplicarConciliacao(conn, nfId, emitenteCnpj)` (no controller, usa o service puro)

1. Lê itens da NF agregados por código:
   `SELECT cprod codigo, SUM(quantidade) qtd FROM nf_entrada_itens WHERE nf_id=? GROUP BY cprod`.
2. Lê linhas pendentes do fornecedor:
   `SELECT id, codigo, qtd_pedida, qtd_recebida, created_at, product_id FROM demanda_itens
    WHERE fornecedor_cnpj=? AND status IN ('pendente','parcial') ORDER BY created_at`.
   (Também tenta amarrar linhas com `fornecedor_cnpj IS NULL` cujo `fornecedor_nome` bate — e nesse
   caso grava o CNPJ na linha.)
3. Chama `conciliar(...)` (service puro) → `alocacoes` + `extras`.
4. Para cada alocação: `INSERT IGNORE demanda_conciliacoes(nf_id, demanda_item_id, qtd)`; se
   inseriu (não era duplicata), `UPDATE demanda_itens SET qtd_recebida = qtd_recebida + ?` e
   recalcula `status` (`veio` se `qtd_recebida >= qtd_pedida`, senão `parcial`; `product_id` é
   copiado do `nf_entrada_itens` correspondente quando ainda nulo).
5. Linhas do fornecedor que continuam com `qtd_recebida = 0` após a NF **não** viram `faltou`
   automaticamente aqui (podem vir em NF futura). O status `faltou` é derivado no relatório /
   marcado manualmente pelo usuário quando ele encerra o pedido.
6. Recalcula `status` do `demanda_pedidos` pai (`concluido` se todas as linhas `veio`; `parcial`
   se alguma recebida; senão `aberto`).

## Endpoints (REST, todos `authMiddleware`)

Onda 1 (núcleo):
- `POST   /api/demanda`                — cria pedido `{ client_id, observacao }`.
- `GET    /api/demanda`                — lista pedidos (filtros: status, client_id).
- `GET    /api/demanda/:id`            — detalhe do pedido + itens.
- `POST   /api/demanda/:id/itens`      — adiciona item `{ fornecedor_cnpj, fornecedor_nome, codigo, nome, qtd_pedida, preco_venda }`.
- `PUT    /api/demanda/itens/:itemId`  — edita item (qtd, preço, etc.).
- `DELETE /api/demanda/itens/:itemId`  — remove item.
- `GET    /api/demanda/compra`         — lista de compra agregada por fornecedor (linhas pendentes,
  com quais clientes e quantidades).
- `GET    /api/demanda/fornecedores`   — `DISTINCT emitente_nome/cnpj` do histórico de NF.
- `GET    /api/demanda/relatorio`      — relatório veio×faltou (por cliente e por fornecedor),
  a partir de `demanda_itens` + `demanda_conciliacoes`.

Onda 2 (venda/aviso):
- `GET  /api/demanda/:id/rascunho-venda` — devolve os itens **recebidos** da cliente prontos para
  pré-preencher a tela de novo pedido (`{ client_id, itens: [{ product_id, nome, qtd, preco }] }`).
- `PUT  /api/demanda/itens/:itemId/venda` — grava o `order_id` na(s) linha(s) após a venda ser
  confirmada na tela de pedido (marca como vendido; não gera duas vezes).
- `PUT  /api/demanda/itens/:itemId/alocacao` — remaneja manualmente `qtd_recebida` entre linhas
  do mesmo fornecedor/código (com validação: soma não excede o recebido pela NF).

## Fluxo de tela (`demanda.html`)

1. **Aba "Pedidos"**: lista de pedidos por cliente; criar pedido (escolhe cliente); dentro do
   pedido, adicionar itens (fornecedor via autocomplete do histórico, código, nome, qtd, preço).
2. **Aba "Comprar"**: linhas pendentes agrupadas por fornecedor (com clientes/quantidades) — é o
   que o usuário digita no app do fornecedor.
3. **Aba "Conciliação/Relatório"**: após importar NFs, mostra por cliente e por fornecedor o que
   veio/parcial/faltou; botão **"Gerar venda do que veio"** (abre rascunho na tela de pedido);
   botão **"Avisar no WhatsApp"** (monta texto e abre `https://wa.me/<clients.phone>?text=<encoded>`);
   opção de **remanejar alocação** manualmente.

A importação de NF (tela `notas.html`) ganha um checkbox **"Conciliar com pedidos das clientes"**
que envia `conciliar=true` no `POST /api/nf/importar`.

## Gerar venda (rascunho — reusa o que existe)

O botão chama `GET /api/demanda/:id/rascunho-venda`, que devolve os itens recebidos com
`product_id` e preço sugerido. A tela de novo pedido é aberta pré-preenchida; ao confirmar, o
pedido é criado pelo fluxo atual (`orderController`, que já dá baixa de estoque). Em seguida a
tela chama `PUT /api/demanda/itens/:itemId/venda` com o `order_id` retornado, marcando as linhas
como vendidas. Nenhuma dupla contagem: NF soma entrada (+recebido), venda dá saída (−entregue).

## Tratamento de erros

- IDs inválidos → 400. Pedido/item inexistente → 404. Cliente inexistente ao criar pedido → 400.
- `qtd_pedida` ≤ 0 ou não inteiro → 400. `preco_venda` < 0 → 400.
- Remanejo de alocação que exceda o recebido → 400 com mensagem clara.
- Conciliação nunca derruba a importação de NF (try/catch isolado, loga e segue).
- Gerar venda de item já vendido (`order_id` preenchido) → 409 "já foi vendido".

## Testes (`test/*.test.js`, banco `db_pedidos_teste`, cleanup dos registros `zz_`/seeds próprios)

Service puro `conciliacaoNf.js`:
- casa exato (recebe tudo), casa parcial (recebe menos), falta total (não veio).
- item extra na NF (ninguém pediu) → vai para `extras`.
- alocação entre 2 clientes por ordem de `created_at` (ex.: pedem 2+1, chega 2 → 2/0).
- acúmulo em 2 NFs (parcial vira completo).
- idempotência: rodar a mesma NF 2× não muda `qtd_recebida`.

Endpoints:
- criar pedido + itens; lista de compra agregada correta por fornecedor.
- relatório veio×faltou (por cliente e por fornecedor).
- rascunho-venda devolve só recebidos com `product_id`; marcar venda grava `order_id` e bloqueia
  segunda venda (409).
- remanejo de alocação válido e inválido (excede recebido → 400).

## Ondas de implementação

- **Onda 1 (núcleo):** migração das 3 tabelas; `conciliacaoNf.js` + testes; `demandaController`
  CRUD + lista de compra + fornecedores + relatório; rotas; gancho `conciliar` na importação de
  NF; tela `demanda.html` (abas Pedidos, Comprar, Conciliação/Relatório sem a parte de venda).
- **Onda 2 (venda/aviso):** rascunho-venda + marcar venda (`order_id`); botão WhatsApp; remanejo
  manual de alocação.

## Fora de escopo (possível fase futura)

- Integração de API do WhatsApp (aqui é só link `wa.me`).
- Importar catálogo do fornecedor automaticamente.
- App/tela para a cliente escolher itens (hoje a escolha chega por WhatsApp e o usuário registra).
