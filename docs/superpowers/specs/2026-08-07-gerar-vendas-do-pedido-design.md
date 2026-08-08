# Gerar venda (com estoque) a partir do pedido + gerar todas de uma vez — Design

**Data:** 2026-08-07
**Branch:** `Teste` (banco `db_pedidos_teste` nos testes; `main`→`db_pedidos` em uso real). Feature-mãe
"Pedidos das Clientes" (roda local; quem usa é a mãe do usuário).

## Problema (uso real)

A mãe montou pedidos, lançou a NF (produtos entraram no estoque) e conferiu tudo com o checklist
(✓ Chegou). Ao clicar **"Gerar venda do que veio"**, o sistema respondeu **"Nada recebido ainda"**.

**Causa raiz (confirmada):** os itens do pedido são texto livre (código do catálogo + nome) e ficam com
`demanda_itens.product_id = NULL`. Marcar "✓ Chegou" grava só a quantidade recebida, **não liga o item a um
produto do cadastro**. E `rascunhoVenda` (o que alimenta o "Gerar venda") exige
`product_id IS NOT NULL` — pra saber qual produto vender e de qual baixar estoque. Sem vínculo, retorna vazio.

Confirmado nos dados: 10 itens com `qtd_recebida > 0` e `product_id NULL`; a NF lançada tem os 12 produtos
ligados com estoque (`nf_entrada_itens.product_id` preenchido).

## Decisão (confirmada com o usuário)

A venda deve **registrar E baixar o estoque** — sem trazer de volta o "casar código" confuso. A ponte é o
**"Puxar da NF"**: ele já acha o item da NF por nome, e o item da NF **já tem um produto** (o que a NF
abasteceu). Então o "Puxar da NF" passa a **guardar esse `product_id` no item do pedido** (invisível pra ela).
A partir daí a venda funciona e baixa o estoque do produto certo (a NF somou, a venda subtrai — fecha).

Três peças:
1. **"Puxar da NF" liga o produto** (além de marcar a quantidade).
2. **"Gerar venda do que veio"** volta a funcionar (itens agora têm `product_id`) e **avisa** quais itens
   recebidos ficaram sem produto (não entram na venda).
3. **"Gerar todas as vendas"** — botão que gera a venda de todos os pedidos elegíveis de uma vez.

## Contexto (como funciona hoje)

- `PUT /api/demanda/itens/:itemId/alocacao` (`remanejarAlocacao`): grava `qtd_recebida` + `status`
  (`veio`/`parcial`/`pendente`), valida (não recebe mais que o pedido), recalcula status do pedido. É o que o
  checklist (✓/✗/qtd) e o "Puxar da NF" chamam.
- `GET /api/demanda/nf/:nfId/conferir` (`conferirNf`): por cProd retorna `descricao`, `quantidade` e
  **`product_id`** (`MAX(i.product_id)`). É o que o "Puxar da NF" consome pra pré-marcar por nome.
- `GET /api/demanda/:id/rascunho-venda` (`rascunhoVenda`): retorna os itens com `qtd_recebida > 0`,
  `product_id NOT NULL` e `order_id IS NULL`, com `preco = COALESCE(di.preco_venda, p.sale_value)`. Alimenta o
  "Gerar venda do que veio" (que abre o rascunho na tela de pedidos pra confirmar/pagar).
- `POST /api/orders` (`createOrder`): numa transação — valida estoque, insere `orders` + `order_products`,
  baixa estoque (+`estoque_movimentacoes` 'Saída'), e **marca `demanda_itens.order_id`** dos `demandaItemIds`
  recebidos (atômico, só quem tem `order_id` NULL). `order_products` tem PK `(order_id, product_id)`.
  `VALID_PAYMENT_METHODS = ['PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO']`. Aplica
  desconto PIX quando o método é PIX (`resolvePixPercent`/`aplicaPix`).

## Escopo e arquitetura

Backend (`demandaController.js`, `orderController.js`, `routes/demanda.js`) + front (`demanda.html`).
Sem migração (as colunas já existem). Refatoração pontual: extrair de `createOrder` um helper transacional
reaproveitável pelo batch (DRY), mantendo o comportamento e os testes atuais.

### Peça 1 — "Puxar da NF" liga o produto

**Backend — `remanejarAlocacao` aceita `product_id` opcional:**
- Além de `qtd_recebida`, lê `req.body.product_id`. Se vier um inteiro válido, inclui `product_id = ?` no
  `UPDATE demanda_itens`. Se não vier (checklist manual ✓/✗/qtd), o UPDATE **não mexe** em `product_id`
  (retrocompatível). Nunca sobrescreve com NULL.
- Sem `preco_venda`: `rascunhoVenda`/venda já usam `COALESCE(di.preco_venda, p.sale_value)`, então o preço do
  produto entra sozinho quando o `product_id` está ligado.

**Front — `renderConferenciaPedido` ("Puxar da NF") em `demanda.html`:**
- Na pré-marcação por nome, quando casa um item do pedido com um item da NF, além de `qtd_recebida` passa a
  enviar `product_id: nfItem.product_id` (quando o item da NF tiver produto ligado) no PUT `/alocacao`.
- Nada muda pra usuária: ela clica "Puxar da NF" como já faz; o vínculo acontece por baixo.

### Peça 2 — "Gerar venda do que veio" volta a funcionar + aviso

- Com o `product_id` ligado, `rascunhoVenda` já acha os itens e o fluxo existente (rascunho → tela de
  pedidos → confirmar) volta a funcionar. **Sem mudança nesse fluxo.**
- **Aviso de itens sem produto:** no handler do botão "Gerar venda do que veio" (`abrirPedido`), antes de
  seguir, comparar os itens do pedido (de `GET /api/demanda/:id`, que precisa retornar `product_id` por item —
  incluir se ainda não retornar) que têm `qtd_recebida > 0` **sem** `product_id`. Se houver, avisar quais
  ficam de fora (ex.: "2 item(ns) não têm produto ligado e não entram na venda: X, Y — use 'Puxar da NF' pra
  ligar"). Se não houver nenhum item recebido com produto, mantém "Nada recebido" (mensagem já existente),
  mas com a dica de usar "Puxar da NF".

### Peça 3 — "Gerar todas as vendas" (batch)

**Backend — helper reaproveitável (refatoração de `createOrder`):**
- Extrair a parte transacional de `createOrder` num helper
  `inserirVendaTx(conn, { clientId, paymentMethod, installments, combinedPaymentValue, effProducts, effTotal, demandaItemIds })`
  que assume uma transação já aberta na `conn`, faz: valida estoque de cada produto, `INSERT orders`,
  `INSERT order_products`, baixa estoque + `estoque_movimentacoes`, marca `demanda_itens.order_id`; retorna
  `{ orderId, total }`. `createOrder` passa a: validar entrada + calcular PIX (como hoje) → abrir tx →
  `inserirVendaTx` → commit. Comportamento idêntico (testes de orders continuam passando).

**Backend — `POST /api/demanda/gerar-vendas` (`gerarVendas`):**
- Body: `{ payment_method }` — validado contra `VALID_PAYMENT_METHODS`; default `'DINHEIRO'`.
- Busca os itens elegíveis: `qtd_recebida > 0 AND product_id IS NOT NULL AND order_id IS NULL`, com
  `preco = COALESCE(di.preco_venda, p.sale_value)`, `cost_price` do produto, agrupados por `pedido_id`
  (→ `client_id`). **Agrega por `product_id` dentro do mesmo pedido** (soma `qtd_recebida`, mantém 1 preço,
  junta os `demanda_item_id`) — porque `order_products` tem PK `(order_id, product_id)`.
- Para **cada pedido**: abre uma transação própria (uma venda por pedido; falha de um não derruba os outros),
  aplica desconto PIX se `payment_method === 'PIX'` (por cliente, via `resolvePixPercent`/`aplicaPix`), chama
  `inserirVendaTx`, commit. Em erro (ex.: estoque insuficiente), rollback e registra o motivo pra aquele
  pedido.
- Também coleta, à parte, os itens recebidos **sem** `product_id` (ficam de fora) pra informar.
- Resposta: `{ geradas: [{ cliente, order_id, total }], falhas: [{ cliente, erro }], sem_produto: [{ cliente, nome }], total_geral }`.
- Rota em `routes/demanda.js`, **antes** de `/:id` (rota fixa): `router.post('/gerar-vendas', c.gerarVendas)`.

**Front — botão "Gerar todas as vendas" em `demanda.html` (lista de pedidos):**
- Botão perto do topo da lista de pedidos. Ao clicar: `Swal` de confirmação com um `<select>` de forma de
  pagamento (opções **DINHEIRO** (default) e **PIX**) → `POST /api/demanda/gerar-vendas` → mostra o resumo
  (quantas vendas, total geral; lista de falhas e de itens sem produto, se houver) → recarrega a lista.

## Tratamento de erros / validação

- `remanejarAlocacao`: `product_id` inválido/ausente → ignora (não altera a coluna). Validações de quantidade
  seguem iguais.
- `gerarVendas`: `payment_method` fora da lista → 400. Nenhum item elegível → resposta com listas vazias e
  `total_geral: 0` (o front informa "nenhuma venda a gerar"). Erro por pedido é isolado (transação por
  pedido) e reportado; não aborta os demais. Reclique é seguro: itens já vendidos têm `order_id` e saem do
  filtro.
- Estoque: como a NF acabou de abastecer, o normal é ter saldo; se faltar, aquele pedido entra em `falhas`
  com a mensagem de estoque insuficiente (nada é baixado nele).
- Dados no DOM via `esc()` (padrão já usado).

## Testes

Testes de controller com banco de teste (seeds `zz_test_`), rodados com o padrão do projeto
(`node --test <arquivo>` com kill após ~25s; validar 0 `not ok`):
- `remanejarAlocacao` grava `product_id` quando enviado; **não** altera `product_id` quando não enviado
  (envia só `qtd_recebida` e confirma que o vínculo anterior permanece).
- `gerarVendas`: com itens recebidos+ligados, cria a(s) venda(s), baixa estoque, marca `order_id`; itens
  recebidos sem `product_id` entram em `sem_produto` e **não** são vendidos; dois itens do mesmo produto no
  mesmo pedido são agregados numa linha de `order_products`; estoque insuficiente vira `falhas` sem baixar.
- Refatoração: a suíte de `orders` existente continua passando (garante que `inserirVendaTx` preservou o
  comportamento de `createOrder`).
- UI: verificação manual (o projeto não testa UI) — "Puxar da NF" ligar produto; "Gerar venda do que veio"
  funcionar/avisar; "Gerar todas as vendas" gerar as 5 e mostrar o resumo.

## Fora de escopo

- Escolher forma de pagamento por pedido no batch (é uma só pra todos; ela ajusta depois na tela de pedidos).
- Parcelado/pagamento combinado no batch (só DINHEIRO/PIX).
- Ligar produto quando ela marca "✓ Chegou" na mão sem usar "Puxar da NF" (esses itens não geram venda com
  estoque; entram só na separação) — catálogo pessoal fica pra futuro.
- Remover do backend os endpoints antigos de conciliar/vínculos (ficam no código, sem uso na UI da mãe).
