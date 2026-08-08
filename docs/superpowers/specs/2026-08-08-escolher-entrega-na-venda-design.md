# Escolher estilo de entrega ao gerar a venda — Design

**Data:** 2026-08-08
**Branch:** `Teste` (banco `db_pedidos_teste` nos testes; `main`→`db_pedidos` em uso real). Parte da feature
"Pedidos das Clientes / Gerar venda" (roda local; quem usa é a mãe do usuário).

## Problema (uso real)

Ao "Gerar venda do que veio", o pedido é criado **sempre como Entrega com frete R$ 0**, sem deixar
escolher — e como as clientes costumam não ter endereço, isso sai parecendo "retirada/presencial". A usuária
quer **escolher o estilo de entrega** na hora de gerar a venda.

Causa: o formulário de criar pedido (`orderForm` em `pedidos.html`) não tem seletor de entrega, e
`createOrder` não grava `delivery_method`/`delivery_fee` — cai no padrão do banco (`delivery_method='entrega'`,
`delivery_fee=0`).

## Decisão (confirmada com o usuário)

Escolher **Retirada (grátis)** ou **Entrega com a taxa que a usuária digita** (sem cálculo automático por
bairro). Vale no fluxo do painel (criar pedido / "Gerar venda do que veio"). No lote ("Gerar todas as
vendas") fica **Retirada** por padrão (ela ajusta o frete individualmente depois, se precisar).

## Contexto (como é hoje)

- `orders` tem `delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'` e `delivery_fee DECIMAL(6,2) NOT NULL
  DEFAULT 0.00`.
- `createOrder` (`orderController.js`) valida entrada, calcula PIX (`effProducts`/`effTotal`) e chama
  `inserirVendaTx(conn, { clientId, paymentMethod, installments, combinedPaymentValue, effProducts, effTotal,
  demandaItemIds })`, que faz `INSERT INTO orders (client_id, payment_method, installments, total_cost,
  combined_payment_value, delivery_fee) VALUES (...)` com `fee = 0` fixo e **sem** `delivery_method` (→ default
  'entrega'). Retorna `{ orderId, total, fee }`.
- `gerarVendas` (batch) também usa `inserirVendaTx`.
- A tela de pedido já exibe certo por `delivery_method`: "Retirada com o vendedor / Frete: Grátis" quando
  `retirada`; senão o endereço + "Taxa de entrega: R$ X" quando `delivery_fee > 0` (`pedidos.html` ~1044-1047).
- A mensagem de sucesso já soma o frete: `Total ... + fmt(deliveryFee) taxa de entrega` quando `deliveryFee>0`.
- O formulário `orderForm` tem, na área de pagamento, `#paymentMethod` (hidden), `#installmentsDiv`,
  `#combinedPaymentValue` (~linhas 374-388).

## Escopo e arquitetura

Backend (`orderController.js`) + front (`pedidos.html`). **Sem migração** (colunas já existem). O total do
pedido segue a semântica atual do painel: `total_cost` = subtotal dos produtos; o frete fica só em
`delivery_fee` (campo separado, como hoje). Só passam a ser escolhidos/gravados o método e a taxa.

### Backend — `inserirVendaTx` e `createOrder`

- `inserirVendaTx` passa a aceitar `deliveryMethod` e `deliveryFee` no objeto de parâmetros. Normaliza:
  `method = deliveryMethod === 'retirada' ? 'retirada' : 'entrega'`; `fee = method === 'retirada' ? 0 :
  Math.max(0, Number(deliveryFee) || 0)`. O `INSERT INTO orders` passa a incluir `delivery_method` e usar esse
  `fee` no `delivery_fee`. Retorno segue `{ orderId, total, fee }` (agora `fee` reflete o frete escolhido).
- `createOrder` lê `deliveryMethod`/`deliveryFee` do `req.body` e repassa a `inserirVendaTx`. Validação:
  `deliveryMethod`, quando enviado, deve ser `'retirada'` ou `'entrega'` (ausente → `'entrega'`, mantém
  compatibilidade); `deliveryFee` só vale na entrega (retirada zera). Sem outras mudanças (PIX, parcelas,
  marcação de `demanda_itens` seguem iguais).
- `gerarVendas` (batch): passa `deliveryMethod: 'retirada'` (frete 0) ao `inserirVendaTx`. Comportamento em
  lote = retirada.

### Front — `pedidos.html` (formulário de criar pedido)

- Novo bloco de **Entrega** perto do pagamento: um seletor (radio ou `<select>`) com **Retirada (grátis)**
  (padrão) e **Entrega**. Ao escolher Entrega, mostra um campo **"Taxa de entrega (R$)"** (`#deliveryFee`,
  number, ≥ 0); em Retirada esse campo fica oculto/limpo.
- No `submit` do `orderForm`, incluir no payload: `deliveryMethod` (o selecionado) e, quando entrega,
  `deliveryFee` (o valor digitado; vazio = 0).
- Reaproveita a mensagem de sucesso existente (já mostra "+ taxa" quando `deliveryFee>0`).
- O `resetOrderForm` volta o seletor para Retirada e limpa a taxa.
- A pré-carga do rascunho ("Gerar venda do que veio") não precisa de nada novo: a escolha de entrega é feita
  na tela antes de finalizar.

## Tratamento de erros / validação

- `deliveryMethod` inválido (nem retirada nem entrega) → `400` "Método de entrega inválido." (só quando
  enviado; ausente = entrega, como antes).
- `deliveryFee` não numérico ou negativo → tratado como `0`. Em retirada, sempre `0`.
- Nada muda na validação de produtos/pagamento/estoque nem na marcação de `demanda_itens`.

## Testes

Teste de controller com banco de teste (seeds `zz_test_`), padrão do projeto (`node --test <arquivo>` com kill
após ~25s; validar 0 `not ok`):
- `createOrder` com `deliveryMethod:'retirada'` grava `delivery_method='retirada'` e `delivery_fee=0`.
- `createOrder` com `deliveryMethod:'entrega', deliveryFee:12` grava `delivery_method='entrega'` e
  `delivery_fee=12.00`.
- `createOrder` com `deliveryMethod:'entrega'` e taxa negativa/vazia grava `delivery_fee=0`.
- `deliveryMethod` inválido → `400`.
- Regressão: suíte de `orders`/`demanda-venda` e `gerar-vendas` continuam passando (default sem
  `deliveryMethod` = entrega/0, como antes; batch grava retirada).
- UI: verificação manual (o projeto não testa UI) — escolher Retirada/Entrega, digitar taxa, ver o pedido
  criado com o método e o frete certos.

## Fora de escopo

- Cálculo automático de frete por bairro/zona (a usuária pediu pra digitar).
- Escolha de entrega no lote "Gerar todas as vendas" (fica retirada padrão; ajuste individual na tela).
- Fluxo da loja pública (`storeOrderController`/`paymentController`) — não muda.
- Consolidar `total_cost` com o frete (segue a semântica atual do painel: frete só em `delivery_fee`).
