# Conferir a NF de dentro do pedido (fluxo mais simples) — Design

**Data:** 2026-07-16
**Branch:** `Teste` (banco `db_pedidos_teste`). Feature-mãe "Pedidos das Clientes + conciliação com a NF" ainda NÃO publicada.

## Problema (feedback do usuário)

O fluxo está confuso porque a conciliação vive numa **aba separada** ("Conciliação / Relatório"),
longe de onde o pedido é criado. O usuário quer o fluxo linear que tem na cabeça:
1. Cliente pede no WhatsApp → cria o **resumo do pedido** da cliente.
2. Importa a **NF** em Notas (pro estoque).
3. **Volta no pedido** e clica um botão que **puxa da NF**, marca o que veio e avisa o que faltou.
4. Segue como já é (gerar venda do que veio, avisar no WhatsApp).

Dúvida do usuário resolvida: a ordem é **pedido primeiro, NF depois**; não precisa criar a NF antes.

## Decisão (confirmada com o usuário)

- Trazer a conferência **para dentro do pedido**: um botão **"Conferir com a NF"** no modal do pedido.
- **Simplificar** a aba: deixar só o **relatório geral**; remover o "conferir/ligar" de lá (some a
  duplicidade de lugares que fazia a mesma coisa).

## Escopo

**Só front-end** (`src/public/demanda.html`) — reaproveita os endpoints existentes:
`GET /api/nf` (lista NFs importadas), `GET /api/demanda/:id` (pedido + itens com status),
`GET /api/demanda/nf/:nfId/conferir` (itens da NF), `POST /api/demanda/conciliar-manual`
(liga cProd↔código e reconcilia). Sem mudança de backend.

## Como fica (UI)

### No modal do pedido (`abrirPedido`)
- Botão **"Conferir com a NF"** (no topo do modal).
- Ao clicar, abre a **conferência do pedido**:
  - **Seletor de NF**: lista as NFs importadas (recentes primeiro: `#id — emitente (nota nº)`).
  - Ao escolher a NF, mostra:
    - **Resumo**: "✅ Vieram: X · 🟡 Parcial: Y · ❌ Faltaram: Z" (contando os itens **deste** pedido
      pelos seus status `veio`/`parcial`/`pendente|faltou`).
    - **Os itens do pedido**: cada um com código, produto, qtd pedida, qtd recebida e status. Para os que
      ainda **não vieram** (`pendente`/`parcial`), um seletor com os **itens da NF** (cProd + descrição)
      para **ligar** ("esse item do meu pedido = esse produto da NF") + botão "Ligar".
  - **Ligar** chama `POST /api/demanda/conciliar-manual` `{ nf_id, cprod, codigo_pedido: <código do item> }`;
    ao voltar ok, recarrega a conferência (o item passa a "veio/parcial" e o resumo atualiza). O vínculo
    fica gravado → na próxima NF daquele fornecedor casa sozinho.
- Ao fechar a conferência, o modal do pedido reflete os novos status (recarrega o pedido).

### Na aba "Conciliação / Relatório"
- Remover o bloco "Conferir NF importada" (seletor + tabela de itens da NF + ligar) — ele foi **movido**
  para dentro do pedido.
- Manter só o **relatório** (`#conteudo-relatorio`, `carregarRelatorio()`).
- Renomear a aba para **"Relatório"** (era "Conciliação / Relatório").

## Tratamento de erros
- Sem NF escolhida → não faz nada. `conciliar-manual` com erro → SweetAlert com a mensagem.
- Dado vindo do backend interpolado no DOM via `esc()`; `encode` onde precisar.

## Testes
- Sem testes automatizados de UI (padrão do projeto). Verificação manual (smoke): criar pedido, importar
  NF, abrir o pedido → "Conferir com a NF" → escolher a NF → ligar um item que não casou → ver virar
  "veio" e o resumo atualizar; conferir que a aba passou a mostrar só o relatório.
- Os endpoints reusados já têm testes (features anteriores) — não mudam.

## Fora de escopo
- Mudar a lógica de conciliação/casamento (já funciona; só muda a apresentação).
- Filtro automático da NF por fornecedor do pedido (mostra as NFs recentes; o usuário escolhe).
