# Desconto no PIX (global + por cliente) — Design

**Data:** 2026-07-11
**Branch:** `Teste` (banco `db_pedidos_teste`). Nada vai para `main`/produção sem pedido explícito.

## Objetivo

Dar desconto a quem paga por **PIX**. Um percentual **global** (padrão para todos) com **exceção por
cliente** (o % do cliente vence o global). Vale **na loja** (cliente paga sozinha, via Mercado Pago) e
**no painel** (pedido presencial marcado como PIX). O desconto incide **só sobre os produtos**
(não sobre o frete), **por cima** dos descontos que já existem (promoção do produto, desconto global/
franquia). A cliente vê o preço com desconto e a economia no checkout.

## Contexto (o que já existe e será reaproveitado)

- **Desconto global** dos produtos: `store_settings` (`desconto_global_ativo`, `desconto_global_percent`);
  `utils/pricing.js` → `getDescontoGlobal()` e `precoEfetivo(saleValue, promotionPrice, global)`
  (promoção do produto vence; senão global; senão `sale_value`).
- **Loja/checkout:** `src/public/loja/checkout.html` escolhe forma de pagamento e mostra o total;
  PIX é gerado em `paymentController.criarPix` (POST `/api/loja/pagamentos/pix`), que calcula
  `subtotal` (soma dos `lineTotal`) + `fee`, cria a `payment_intent`, gera o PIX no MP com `total`,
  guarda o QR. O **webhook** confere que `transaction_amount === intent.total` (`paymentController`),
  e cria o pedido com `storeOrderController.criarPedidoPago(conn, { lines, fee, total, ... })` a partir
  do snapshot (`items_json`) da intenção. Cartão é outro caminho (`criarPreferencia`) — **sem** desconto.
- **Painel:** `orderController.createOrder` (POST `/api/orders`) recebe `productArray` (com `salePrice`)
  + `paymentMethod`; grava `orders` + `order_products` + baixa de estoque. UI em `src/public/pedidos.html`.
- **Descontos (config):** `descontosController.get/put` (+ `descontos.html`) editam o desconto global.
- **Clientes:** `clientController` (getById/update) + `clientes.html` (form de edição).
- **Relatórios/dashboard** calculam lucro/receita a partir de `order_products.sale_price` — por isso o
  desconto do PIX precisa incidir **por item** (não só no total), pra o lucro continuar exato.

## Decisões (confirmadas com o usuário)

1. Global **+** exceção por cliente; o % do cliente **vence** o global.
2. Vale na **loja e no painel**.
3. Incide **só nos produtos** (não no frete), **empilha** sobre os outros descontos, aplicado **por item**.
4. A cliente **vê** o preço do PIX com desconto e a economia no checkout.

## Modelo de dados

- **Global (store_settings, padrão do desconto global):**
  - `desconto_pix_ativo` — `'0'`/`'1'`.
  - `desconto_pix_percent` — número `0`–`99.99`.
- **Por cliente (migração aditiva, idempotente em `connection.js`):**
  - `ALTER TABLE clients ADD COLUMN pix_discount_percent DECIMAL(5,2) NULL` (dentro de `try/catch`).
  - `NULL` = herda o global; valor `0`–`99.99` = usa esse (inclusive `0` = sem desconto no PIX para
    esse cliente, sobrepondo o global).

## Regra de resolução (helper puro em `utils/pricing.js`)

```
getDescontoPix()  -> { ativo, percent }   // lê desconto_pix_ativo/percent de store_settings
resolvePixPercent(clientePixPercent, globalPix) -> number
  se clientePixPercent != null            -> Number(clientePixPercent)   // cliente vence (0 vale)
  senão se globalPix.ativo && percent > 0  -> globalPix.percent
  senão                                    -> 0
aplicaPix(valor, percent) -> round2(valor * (1 - percent/100))
```

`resolvePixPercent` e `aplicaPix` são funções puras (testáveis isoladamente). `getDescontoPix` espelha
`getDescontoGlobal` (mesma tabela, mesmas chaves nomeadas).

## Aplicação

Sempre: pct = `resolvePixPercent(cliente.pix_discount_percent, getDescontoPix())`. Se `pct <= 0`, nada
muda (comportamento idêntico ao atual). O frete **nunca** é descontado.

### Loja (PIX) — `paymentController.criarPix`
- Já conhece o cliente logado (`client.id`) e monta as linhas (`lineTotal` por item). Buscar
  `pix_discount_percent` do cliente + `getDescontoPix()` → `pct`.
- Aplicar `pct` ao **preço unitário de cada linha** ao montar o `snapshot`/`items_json` e recomputar
  `subtotal = soma dos lineTotal descontados`; `total = subtotal + fee`.
- O PIX do MP e `payment_intent.total` saem já com desconto; o webhook continua válido
  (`transaction_amount === intent.total`); `criarPedidoPago` usa o snapshot já descontado, então
  `order_products.sale_price` reflete o desconto (lucro correto).
- **Cartão (`criarPreferencia`) não muda.**

### Painel — `orderController.createOrder`
- Se `paymentMethod === 'PIX'`: buscar `pix_discount_percent` do `clientId` + `getDescontoPix()` → `pct`;
  aplicar `pct` ao `salePrice` de cada item de `productArray` (e recomputar o `totalValue`) antes de
  inserir `order_products`/`orders`. Outros pagamentos: sem alteração.

## Configuração (UI + endpoints)

- **Global:** estender `descontosController.get/put` para também ler/gravar `desconto_pix_ativo` e
  `desconto_pix_percent` (mesma validação: 0–99,99). Em `descontos.html`, adicionar a seção "Desconto no
  PIX" (toggle + campo %), no mesmo padrão visual do desconto global.
- **Por cliente:** `clientController` — incluir `pix_discount_percent` no `getById` (SELECT) e no
  `update` (aceitar valor `0`–`99.99` ou vazio→`NULL`; validar). Em `clientes.html`, adicionar o campo
  "Desconto PIX (%)" no formulário de edição (vazio = usa o global).

## Como a cliente vê (loja) e o admin (painel)

- **Checkout da loja (`checkout.html`):** o endpoint de cotação usado pela tela passa a devolver também
  `pixPercent` e `pixTotal` (total dos produtos com o desconto do PIX + frete). Na seleção de pagamento,
  o PIX mostra o preço com desconto, o selo "X% OFF" e "você economiza R$ Y"; ao selecionar PIX, o total
  exibido é o `pixTotal`. Se `pixPercent <= 0`, mostra o PIX normal, sem selo. (A cotação é autenticada,
  então sabe o cliente logado e aplica a exceção por cliente.)
- **Painel (`pedidos.html`):** ao selecionar pagamento **PIX**, a tela recalcula e mostra o total com
  desconto (usa o `pix_discount_percent` do cliente selecionado, vindo do `getById`, + o global de
  `descontosController.get`). Um aviso tipo "PIX: R$ 190,00 — 5% aplicado". O valor gravado é
  autoritativo no backend (a UI é só preview).

## Tratamento de erros / validação

- `%` global e por cliente: número `0`–`99,99`; fora disso → 400. Vazio no cliente → `NULL`.
- Se `getDescontoPix` falhar (erro de DB), retorna `{ ativo:false, percent:0 }` (degrada sem desconto),
  igual ao `getDescontoGlobal`.
- O desconto nunca torna o total ≤ 0 na prática (pct < 100 e há frete/positivos); a validação de
  `total > 0` já existente permanece.

## Testes

Funções puras (`utils/pricing.js`):
- `resolvePixPercent`: cliente definido vence global; cliente `0` sobrepõe global ativo; cliente `null`
  herda global; global inativo → 0.
- `aplicaPix`: aplica o percentual e arredonda a 2 casas; pct 0 = valor inalterado.

Backend:
- `criarPix`: com desconto (global e por cliente), `intent.total` e o snapshot saem descontados só nos
  produtos (frete intacto); sem desconto (pct 0) o total é idêntico ao atual.
- `orderController.createOrder`: `paymentMethod='PIX'` aplica o desconto por item e no total; outro
  pagamento não altera; cliente com override vence o global.
- `descontosController`: get/put persistem as chaves de PIX; validação de faixa.
- `clientController`: update aceita/valida `pix_discount_percent` (e vazio→NULL); getById retorna o campo.

## Fora de escopo

- Desconto por outras formas de pagamento (só PIX).
- Desconto no frete.
- Histórico/auditoria de qual % foi aplicado por pedido (o efeito já fica em `order_products.sale_price`
  e no `total_cost`).

## Ondas de implementação

- **Onda 1 (núcleo):** migração da coluna; helpers puros em `utils/pricing.js` (+ testes);
  `descontosController` (global PIX) + `clientController` (por cliente); aplicação em `criarPix` (loja) e
  `createOrder` (painel) (+ testes backend).
- **Onda 2 (UI):** seção PIX em `descontos.html`; campo no `clientes.html`; exibição do preço/economia no
  `checkout.html`; preview no `pedidos.html` ao marcar PIX.
