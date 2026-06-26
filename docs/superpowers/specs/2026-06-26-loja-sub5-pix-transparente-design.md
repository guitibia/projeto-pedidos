# Loja — Sub-projeto 5: PIX transparente (QR na loja) — Design

**Data:** 2026-06-26
**Loja:** Beleza Multi Marcas (Node/Express + MySQL)
**Depende de:** sub-1 (catálogo), sub-2 (contas/`customerAuth`), sub-3 (checkout/pedido), sub-4 (pagamento Mercado Pago — `payment_intents`, `confirmarIntencao`, `criarPedidoPago`, `statusPagamento`).
**Fora de escopo:** cartão transparente (segue no Checkout Pro do sub-4), reembolso automático.

## Objetivo

Gerar o **QR Code do PIX dentro da própria loja** (API de Pagamentos do Mercado Pago / pagamento transparente), em vez de redirecionar para o Checkout Pro. O cliente escolhe **PIX** no checkout, vê o **QR + copia-e-cola** numa tela nossa com contagem regressiva, e a tela confirma o pagamento automaticamente — reusando a confirmação idempotente do sub-4.

## Decisões (travadas na conversa)

- **Métodos no checkout:** seletor **PIX** (na loja, padrão) **+ Cartão** (Checkout Pro do sub-4, inalterado).
- **Validade do QR:** **15 minutos**.
- **Dados do pagador:** vêm da **conta do cliente** (e-mail, nome, CPF) — não do request.
- **QR via GET separado:** a tela busca o QR uma vez por `GET /:ref/pix`; o polling de status segue no `statusPagamento` existente (leve, sem reenviar a imagem).

## Fluxo

1. **Checkout → escolhe PIX → Finalizar e pagar:** `POST /api/loja/pagamentos/pix` (customerAuth). O servidor valida o carrinho (preço/estoque autoritativos, igual ao sub-4), grava a **intenção** (`payment_intents`, status `pendente`), e chama a **API de Pagamentos do MP** criando um pagamento `pix` com o pagador da conta. O MP retorna o **id do pagamento**, o **copia-e-cola** (`qr_code`) e a **imagem** (`qr_code_base64`). Guardamos `mp_payment_id`, `pix_qr_code`, `pix_qr_base64`, `pix_expiration` na intenção. Resposta: `{ external_reference }`.
2. **Tela PIX (`pagamento-pix.html`):** busca o QR por `GET /api/loja/pagamentos/:ref/pix` → mostra a imagem do QR, um botão **"copiar código"** (copia-e-cola), o valor e um **cronômetro de 15 min**. Faz **polling** de `GET /api/loja/pagamentos/:ref` (o `statusPagamento` do sub-4).
3. **Confirmação:** como a intenção PIX já tem `mp_payment_id`, o `statusPagamento` consulta o pagamento no MP e, quando `approved`, chama `confirmarIntencao` → cria o pedido (`criarPedidoPago`), marca `pago` (idempotente). A tela redireciona para `pedido-confirmado.html?id=`.
4. **Expiração/recusa:** PIX não pago em 15 min → o MP marca `cancelled`/expirado → `confirmarIntencao` marca a intenção `falhou`; a tela mostra "PIX expirado" + voltar ao carrinho.

## Banco de dados (migração no padrão `try/catch` do `connection.js`)

```sql
ALTER TABLE payment_intents ADD COLUMN pix_qr_code  TEXT        DEFAULT NULL;
ALTER TABLE payment_intents ADD COLUMN pix_qr_base64 MEDIUMTEXT DEFAULT NULL;
ALTER TABLE payment_intents ADD COLUMN pix_expiration DATETIME  DEFAULT NULL;
```

Reuso integral de `payment_intents` (sub-4) e suas colunas existentes; nenhuma mudança em `orders`/`order_products`.

## Backend

- `services/mercadopago.js` — nova função `criarPagamentoPix({ externalReference, total, descricao, payer, expiracaoMin })`:
  - `new Payment(cfg).create({ body: { transaction_amount: total, description, payment_method_id: 'pix', external_reference, date_of_expiration: <agora + expiracaoMin, ISO com offset>, payer: { email, first_name, last_name, identification: { type: 'CPF', number } } } })`.
  - Retorna `{ id, status, qr_code, qr_code_base64, expiration }` lendo `point_of_interaction.transaction_data.{qr_code,qr_code_base64}`.
- `paymentController.criarPix` — `POST /api/loja/pagamentos/pix` (customerAuth): `mp.isConfigured()` senão 503; valida carrinho (reusa `store.parseItems/buildLines/getClient/effectiveAddress/geocodeFee/hasAddress`); grava intenção `pendente`; monta `payer` da conta (nome dividido em first/last, CPF só dígitos); chama `criarPagamentoPix`; salva `mp_payment_id`/`pix_qr_code`/`pix_qr_base64`/`pix_expiration` + `status` retornado; retorna `{ external_reference }`. Em falha do MP → intenção `falhou` + 502.
- `paymentController.pixDados` — `GET /api/loja/pagamentos/:ref/pix` (customerAuth, ownership 404): retorna `{ qr_code, qr_code_base64, total, expiration, status, orderId? }` da intenção do próprio cliente.
- **Sem mudança** em `confirmarIntencao`, `statusPagamento`, `webhook`, `criarPedidoPago`, `mapPaymentMethod` (já mapeia PIX). O Checkout Pro (cartão) do sub-4 segue intacto.

## Frontend (`src/public/loja/`, Clean Boutique)

- `checkout.html`: adicionar um **seletor de método** (rádio/cartões clicáveis): **PIX** (padrão) e **Cartão**. O handler de "Finalizar e pagar":
  - **PIX** → `POST /api/loja/pagamentos/pix` → em `201`, `location = 'pagamento-pix.html?external_reference=' + ref`.
  - **Cartão** → fluxo atual do sub-4 (abre o MP em nova aba + `pagamento-retorno.html`). Inalterado.
- `pagamento-pix.html` (protegida; guard `entrar.html?next=`): lê `?external_reference=` (valida 64-hex); `GET /:ref/pix` para renderizar **imagem do QR** (`<img src="data:image/png;base64,...">`), **copia-e-cola** com botão "copiar", valor, e **contagem regressiva** até `pix_expiration`. Polling de `statusPagamento` (~a cada 4s): `pago` → `Cart.clear()` + `pedido-confirmado.html?id=`; `falhou`/expirado → "PIX expirado/não aprovado" + voltar ao carrinho; `pendente` → continua. Ao zerar o cronômetro, faz uma última checagem e, se não pago, mostra expirado.

## Erros / segurança / LGPD

- Sem `MP_ACCESS_TOKEN` → 503. Carrinho vazio/estoque insuficiente/preço inválido → 400 (antes de gerar o PIX).
- Tudo sob `customerAuth`; intenção/QR sempre filtrados por `req.customer.id` (404 para intenção alheia, sem vazar).
- Valor e total sempre do servidor; o pagador (e-mail/nome/CPF) vem da conta, nunca do request do cliente.
- `qr_code_base64` é só a imagem do PIX (sem dado sensível). Nenhum dado de cartão trafega (PIX não tem cartão).
- Idempotência herdada do sub-4 (UNIQUE `external_reference` + `FOR UPDATE` no `order_id`).

## Testes (sem suíte automatizada — curl + sandbox do MP)

1. Sem token → `POST /pagamentos/pix` 503.
2. Com token de teste: login → `POST /pagamentos/pix` → 201 + `external_reference`; conferir intenção `pendente` com `mp_payment_id` e `pix_qr_*` preenchidos; `GET /:ref/pix` retorna o QR + copia-e-cola.
3. Aprovar o PIX de teste (simulação do sandbox do MP) → `statusPagamento` confirma → pedido criado uma vez, `payment_status='pago'`, `payment_method='PIX'`, estoque baixado.
4. Reconsulta após aprovação → idempotente (mesmo pedido).
5. `GET /:ref/pix` de intenção de outro cliente → 404.
6. Navegador: checkout (PIX) → tela do QR → (aprovação sandbox) → confirmação → Meus pedidos mostra **Pago**.

## Decomposição prevista (para o plano)

T1 migração (`pix_qr_code`, `pix_qr_base64`, `pix_expiration`) · T2 `services/mercadopago.criarPagamentoPix` · T3 `paymentController.criarPix` + `pixDados` + rotas · T4 `checkout.html` seletor de método (PIX/Cartão) · T5 `pagamento-pix.html` (QR + copia-e-cola + cronômetro + polling).
