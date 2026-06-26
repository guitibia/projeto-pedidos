# Loja — Sub-projeto 4: Pagamento (Mercado Pago) — Design

**Data:** 2026-06-25
**Loja:** Beleza Multi Marcas (sobre o dashboard Node/Express + MySQL)
**Depende de:** sub-1 (catálogo), sub-2 (contas/`customerAuth`), sub-3 (checkout, carrinho, pedido)
**Fora de escopo:** estorno/reembolso automático, assinatura recorrente, antifraude além do que o MP já faz.

## Objetivo

Cobrança real via **Mercado Pago / Checkout Pro** (PIX + cartão). O cliente paga na página do Mercado Pago; o **pedido só é criado depois do pagamento aprovado**. A confirmação chega por **webhook** (servidor↔servidor) e/ou pela **página de retorno** consultando o status — ambas caem na mesma rotina idempotente de "confirmar pagamento e criar o pedido".

## Decisões (travadas na conversa)

- Gateway: **Mercado Pago**, integração **Checkout Pro** (preferência + redirect; MP cuida do PCI/dados de cartão).
- Métodos: **PIX + cartão de crédito**.
- Timing: **pedido criado só após pagamento aprovado** (não no "Finalizar").
- Construção em **modo teste (sandbox)** primeiro; credenciais de produção entram depois via `.env`.
- "Pago mas sem estoque" (raro): cria o pedido mesmo assim (dinheiro entrou) e **sinaliza no painel** para tratamento manual; nunca descarta pedido pago.

## Fluxo

1. **Checkout → Finalizar e pagar:** `POST /api/loja/pagamentos` (customerAuth). O servidor revalida o carrinho (preço autoritativo `COALESCE(promotion_price, sale_value)` + estoque, como o `resumo` do sub-3), calcula o frete (geo), grava uma **intenção de pagamento** (snapshot de itens + endereço + valores) e cria uma **preferência** no MP. Retorna `init_point`.
2. **Redirect ao Mercado Pago:** o cliente paga (PIX/cartão) na página do MP.
3. **Confirmação (dois gatilhos, mesma rotina):**
   - **Webhook** `POST /api/loja/pagamentos/webhook` (público) — recebe a notificação, **consulta o pagamento na API do MP** (não confia no corpo) e confirma.
   - **Retorno** `pagamento-retorno.html` (back_url) → `GET /api/loja/pagamentos/:ref` consulta o status (e, se aprovado, confirma) para mostrar o resultado e funcionar mesmo sem webhook em ambiente local.
4. **confirmarPagamento(externalReference)** — idempotente: consulta o pagamento no MP; se `status === 'approved'` e o valor bate com a intenção, numa **transação** revalida estoque, cria o pedido (reuso da lógica do sub-3), baixa estoque/registra movimentação, marca a intenção `paid` e liga ao `order_id`. Se já houver `order_id`, retorna o pedido existente (sem duplicar).

## Banco de dados (migrações no padrão `try/catch` do `connection.js`)

```sql
CREATE TABLE IF NOT EXISTS payment_intents (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  external_reference VARCHAR(64) NOT NULL UNIQUE,
  items_json JSON NOT NULL,
  address VARCHAR(255), house_number VARCHAR(30), neighborhood VARCHAR(120),
  cep VARCHAR(8), city VARCHAR(120),
  subtotal DECIMAL(10,2) NOT NULL,
  delivery_fee DECIMAL(6,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  mp_preference_id VARCHAR(64),
  mp_payment_id VARCHAR(64),
  status VARCHAR(20) NOT NULL DEFAULT 'pendente',  -- pendente|pago|falhou|expirado
  order_id INT DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT NULL;  -- 'pago' p/ pedidos da loja pagos
ALTER TABLE orders ADD COLUMN mp_payment_id VARCHAR(64) DEFAULT NULL;
```

- `external_reference` = `crypto.randomBytes(32).hex`; liga a preferência/pagamento do MP à intenção. `UNIQUE` garante idempotência na criação do pedido (mais o check de `order_id`).
- O pedido da loja nasce já **pago**: `payment_status='pago'`, `payment_method` = método real (PIX→`'PIX'`, cartão→`'CARTÃO DE CRÉDITO'`), `origin='loja'`, status de entrega `Pendente`, `delivery_fee`/`total_cost` vindos da intenção.

## Backend

- Dependência: pacote oficial `mercadopago` (SDK v2). `.env`: `MP_ACCESS_TOKEN` (token de teste primeiro). Sem o token → endpoints de pagamento respondem `503 "Pagamento indisponível"` (nada é processado de mentira). `APP_URL` (já existe) compõe `notification_url` e `back_urls`.
- `src/services/mercadopago.js` — encapsula o SDK: `criarPreferencia({ externalReference, total, descricao })` (com `back_urls` = `APP_URL + '/loja/pagamento-retorno.html'`, `auto_return:'approved'`, `notification_url = APP_URL + '/api/loja/pagamentos/webhook'`, métodos PIX+cartão) → retorna `{ id, init_point }`; `buscarPagamento(paymentId)` → retorna `{ status, transaction_amount, external_reference, payment_type_id }`. Se `MP_ACCESS_TOKEN` ausente → lança erro tratável (503).
- `src/controllers/paymentController.js`:
  - `POST /api/loja/pagamentos` (customerAuth) — valida carrinho/estoque/preço, calcula frete, grava `payment_intents` (status `pendente`), cria preferência MP (`mp_preference_id`), retorna `{ init_point, external_reference }`.
  - `POST /api/loja/pagamentos/webhook` (público) — extrai o `payment.id` da notificação (`type=payment`), chama `confirmarPagamento` via lookup pelo pagamento; responde `200` rápido sempre (MP reentrega em erro).
  - `GET /api/loja/pagamentos/:ref` (customerAuth, **só a própria intenção**) — se a intenção ainda está `pendente`, tenta `confirmarPagamento` (consulta MP) antes de responder; retorna `{ status, orderId? }`.
- `confirmarPagamento` (interno, idempotente): recebe a intenção (por `external_reference` ou `mp_payment_id`); se `status==='pago'` retorna o `order_id` existente; consulta o pagamento no MP; se `approved` e `transaction_amount ≈ intent.total` (tolerância 0,01), cria o pedido em transação e marca `paid`; se `rejected/cancelled` marca `falhou`; senão mantém `pendente`.
- **Reuso:** a transação de criação de pedido do sub-3 (`storeOrderController.criarPedido`) é extraída para uma função compartilhada `criarPedidoPago(conn, { clientId, items, addr, fee, paymentMethod, mpPaymentId })` (baixa estoque + `order_products` + `estoque_movimentacoes` + `orders` com `payment_status='pago'`). O endpoint antigo `POST /api/loja/pedidos` (criação direta sem pagamento) é **removido** — toda venda da loja passa pelo pagamento. `resumo`, `listarPedidos`, `detalhePedido` permanecem.

## Frontend (`src/public/loja/`, mesmo Clean Boutique)

- `checkout.html`: o botão passa a ser **"Finalizar e pagar"** → `POST /api/loja/pagamentos` → `window.location = init_point` (vai pro MP). (O resumo de itens/endereço/frete continua igual.)
- `pagamento-retorno.html` (back_url do MP; protegida): lê `?external_reference=` (e os params do MP) e consulta `GET /api/loja/pagamentos/:ref` (faz polling curto enquanto `pendente`):
  - `pago` → `Cart.clear()` e redireciona para `pedido-confirmado.html?id=<orderId>` (página existente do sub-3, reusada).
  - `pendente/processando` → "Estamos confirmando seu pagamento…" com auto-refresh.
  - `falhou` → "Pagamento não aprovado" + botão para voltar ao carrinho/tentar de novo.
- `pedido-confirmado.html` (sub-3) continua sendo a tela de pedido confirmado, agora alcançada via `pagamento-retorno.html`. `meus-pedidos.html` / `pedido.html` / `pedido-confirmado.html` passam a exibir **Pago** (badge/linha) quando `payment_status='pago'`.

## Erros e estados

- `MP_ACCESS_TOKEN` ausente → `503` no `POST /pagamentos` e botão mostra "pagamento indisponível no momento".
- Carrinho vazio/ inválido / estoque insuficiente no `POST /pagamentos` → `400` (antes de ir ao MP).
- Pagamento `rejected` → intenção `falhou`; retorno mostra "não aprovado".
- Webhook duplicado / corrida → `confirmarPagamento` idempotente (checa `order_id`/`status='pago'` + `UNIQUE external_reference`); cria o pedido **uma vez**.
- **Pago sem estoque** → cria o pedido assim mesmo, marca `payment_status='pago'` e registra observação/sinal para o painel; estoque pode ficar negativo (sinaliza), nunca perde a venda paga.
- `GET /pagamentos/:ref` de intenção de outro cliente → `404` (ownership, sem vazar).

## Segurança / LGPD

- Dados de cartão **nunca** passam pelo nosso servidor (Checkout Pro hospedado no MP).
- Webhook não é confiável por si: sempre **consultamos o pagamento na API do MP** com nosso `MP_ACCESS_TOKEN` e conferimos `status` + `transaction_amount` contra a intenção. (Opcional: validar também o header `x-signature` do MP.)
- `MP_ACCESS_TOKEN` só no `.env` (gitignored), nunca no front. Tudo sob `customerAuth` exceto o webhook; intenções/pedidos sempre filtrados por `req.customer.id`.
- Preço e total sempre do servidor (a preferência é criada com o total que NÓS calculamos, não o que o cliente envia).

## Testes (sem suíte automatizada — curl + navegador + sandbox do MP)

1. Sem `MP_ACCESS_TOKEN` → `POST /pagamentos` retorna 503.
2. Com token de teste: login → `POST /pagamentos` cria intenção (`pendente`) + retorna `init_point`; conferir `payment_intents`.
3. Pagar com **usuário de teste** do MP (cartão de teste aprovado / PIX sandbox) → retorno em `pagamento-retorno.html`; `GET /pagamentos/:ref` confirma → pedido criado uma vez, `payment_status='pago'`, estoque baixado, `mp_payment_id` gravado.
4. Reenviar o webhook (simulador do MP) → **não** cria pedido duplicado.
5. Pagamento recusado (cartão de teste reprovado) → intenção `falhou`, sem pedido.
6. `GET /pagamentos/:ref` de outra intenção → 404.
7. Navegador: checkout → MP (sandbox) → retorno → Meus pedidos mostra **Pago**.

## Decomposição prevista (para o plano)

T1 migrações (`payment_intents`, `orders.payment_status/mp_payment_id`) + instalar `mercadopago` + `.env` `MP_ACCESS_TOKEN` · T2 `services/mercadopago.js` (criarPreferencia/buscarPagamento + guarda de token) · T3 refatorar criação de pedido para `criarPedidoPago` compartilhado + remover `POST /pedidos` · T4 `paymentController` criar intenção/preferência + rota · T5 `confirmarPagamento` + webhook + status (idempotente, ownership) · T6 `checkout.html` "Finalizar e pagar" → MP · T7 `pagamento-retorno.html` (polling de status) · T8 exibir "Pago" em meus-pedidos/detalhe/confirmação.
