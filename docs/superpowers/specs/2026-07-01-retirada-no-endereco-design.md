# Retirada no endereço do vendedor (pickup) — Design

**Data:** 2026-07-01
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

No checkout da loja online, além de "Entrega no meu endereço", o cliente pode escolher **Retirada** (buscar com o vendedor). Retirada: **frete R$ 0**, sem endereço de entrega, disponível para **qualquer** cliente (sem restrição de cidade). O endereço de retirada é **configurável no painel** e aparece para o cliente (checkout + pedido).

## Decisões (aprovadas)

- Endereço de retirada **configurável no painel** (store_settings `endereco_retirada`).
- Retirada **liberada para todos** (sem checagem de cidade), frete **0**.
- Só afeta a **loja online** (o pedido manual do painel é presencial, sem frete).
- Servidor **autoritativo**: o frete 0 e o método são decididos/validados no backend, não confiando no front.

## Modelo de dados (migrações idempotentes em `connection.js`)

- `ALTER TABLE orders ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'` — valores `'entrega'` | `'retirada'`.
- `ALTER TABLE payment_intents ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'`.
- `INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('endereco_retirada', '')`.

## Componentes

### `src/utils/delivery.js`
- `getEnderecoRetirada()` → `getSetting('endereco_retirada', '')` (string). Export.

### Normalização do método (helper compartilhado)
- Regra única para interpretar o body: `metodo = (String(body.deliveryMethod||'').toLowerCase() === 'retirada') ? 'retirada' : 'entrega'`. Qualquer valor diferente de `retirada` cai em `entrega` (seguro por padrão).

### `resumo` (storeOrderController, POST `/api/loja/checkout/resumo`)
- Determina `metodo`. Se **retirada**: `fee = 0`, **pula** `cidadeAtende` e `freteDoBairro`; `total = subtotal`. Retorna também `deliveryMethod: 'retirada'` e `enderecoRetirada` (de `getEnderecoRetirada()`).
- Se **entrega**: fluxo atual (cidade + bairro + frete). Retorna `deliveryMethod: 'entrega'`.

### Pagamentos (paymentController — fluxo cartão E fluxo PIX)
Ambos os endpoints hoje: calculam `fee = freteDoBairro(...)`, validam cidade, gravam `payment_intents`. Passam a:
- Ler `metodo`. Se **retirada**: `fee = 0`, **pula** a validação de cidade e o cálculo por bairro; não exige endereço (mantém o que houver do cadastro, sem obrigar). Grava `delivery_method='retirada'` no `payment_intents`.
- Se **entrega**: fluxo atual inalterado; grava `delivery_method='entrega'`.
- O `INSERT INTO payment_intents` passa a incluir a coluna `delivery_method`.

### `criarPedidoPago` (storeOrderController)
- Passa a receber `deliveryMethod` e grava em `orders.delivery_method` no INSERT.

### Confirmação do pagamento (paymentController)
- Ao chamar `criarPedidoPago`, passa `deliveryMethod: intent.delivery_method`.

### Painel — página Entrega
- `deliveryZonesController.salvarSettings` (POST) passa a também gravar `endereco_retirada` (do body) em store_settings.
- `deliveryZonesController.listar` (ou o GET usado pela página) passa a retornar `enderecoRetirada`.
- `entrega.html`: novo campo **"Endereço de retirada"** (textarea) na seção de configurações, carregado do GET e enviado no salvar.

### Config da loja (`storeController.entregaConfig`, GET `/api/loja/entrega/config`)
- Passa a retornar `enderecoRetirada` (para o checkout exibir).

### Checkout (`src/public/loja/checkout.html`)
- Novo seletor no topo da seção de entrega: **"Receber no meu endereço"** (entrega) vs **"Retirar com o vendedor — grátis"** (retirada).
- **Retirada:** esconde o bloco de endereço inteiro (radios cadastro/outro, CEP, rua, número, bairro, cidade); mostra um card com o **endereço de retirada** (de `enderecoRetirada`) + "Frete: Grátis". Envia `deliveryMethod: 'retirada'` no `/resumo` e no pagamento; o resumo mostra "Retirada — Grátis".
- **Entrega:** fluxo atual (inclui a correção do `/me` já feita e os radios). Envia `deliveryMethod: 'entrega'`.
- Fica atento: o `foraDeArea`/erro de cidade não deve bloquear o botão quando for retirada.

### Telas de pedido
- **Endpoints de detalhe** (painel `detalhePedido` da loja e o do painel admin que a `pedidos.html` usa; conta do cliente `pedido.html`/`meus-pedidos.html`) passam a retornar `delivery_method`.
- **Exibição:** quando `delivery_method='retirada'`, mostrar **"Retirada"** + o endereço de retirada, no lugar do endereço de entrega. Frete exibido como "Grátis".

## Erros / bordas

- `deliveryMethod` ausente/qualquer valor → tratado como `entrega` (padrão seguro).
- Retirada com `endereco_retirada` vazio: o checkout ainda funciona (mostra "Combinar com o vendedor" como fallback); recomendável configurar no painel.
- Pedidos antigos: `delivery_method` default 'entrega' (migração), então continuam exibindo como entrega — correto.

## Testes (`node:test`, `db_pedidos_teste`)

- `getEnderecoRetirada()` lê o setting (grava um valor, lê de volta).
- `resumo` com `deliveryMethod='retirada'` e cliente de cidade fora → **200**, `deliveryFee=0`, `total=subtotal`, sem erro de cidade.
- `resumo` com `deliveryMethod='entrega'` → comportamento atual (frete por bairro / erro de cidade).
- `criarPedidoPago` com `deliveryMethod='retirada'` grava `orders.delivery_method='retirada'` e `delivery_fee=0`.
- Normalização: valores inesperados (`''`, `'x'`, `'ENTREGA'`) → `entrega`; `'retirada'`/`'RETIRADA'` → `retirada`.
