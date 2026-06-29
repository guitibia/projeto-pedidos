# Loja — Descontos: global + por produto (#3) — Design

**Data:** 2026-06-30
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.
**Sensível:** mexe em preço/dinheiro real e em pedidos → o **servidor é autoritativo** no cálculo.

## Decisões (travadas na conversa)
- **Empilhar?** NÃO. Produto com **promoção própria** (`promotion_price`) mantém o preço dele; o **global** só vale para produtos **sem** promoção própria. (Promoção do produto tem prioridade.)
- **Por produto:** atalho de **% ou R$** de desconto que calcula o `promotion_price` (campo que já existe e já é usado no checkout).
- **Global:** guardado em `store_settings` (chave-valor), com **botão de ativar** + percentual; só **%** (R$ global não faz sentido).

## Estado atual (relevante)
- `products`: `sale_value` (preço de venda), `promotion_price` (preço promocional final; se `>0` é o preço efetivo), `cost` (margem admin).
- Preço do cliente **já é autoritativo no servidor**: `storeOrderController.buildLines` faz `unitPrice = promotion_price>0 ? promotion_price : sale_value`.
- `storeController.listProdutos/getProduto` devolvem `sale_value`/`promotion_price`; o front (`loja.js precoHTML`) mostra promo riscando o `sale_value`.
- `franchise_discounts` mexe em `cost` (não no preço do cliente) → **não conflita**.
- `store_settings` já existe (do frete). O editor de produto (list-products) hoje **não expõe** `promotion_price` (guarda num `dataset`).

## Regra de preço — fonte única da verdade

`src/utils/pricing.js` (novo):
- `getDescontoGlobal()` → `{ ativo: bool, percent: number }` (lê `store_settings`: `desconto_global_ativo`, `desconto_global_percent`).
- `precoEfetivo(saleValue, promotionPrice, global)`:
  ```
  base = Number(saleValue) || 0
  if (promotionPrice != null && Number(promotionPrice) > 0) return Number(promotionPrice)   // promo própria vence
  if (global && global.ativo && global.percent > 0) return round2(base * (1 - global.percent/100))  // global nos sem promo
  return base
  ```

Usada por **todos** os caminhos de preço:
- **`storeOrderController.buildLines`** (autoritativo — carrinho/checkout/pedido): substituir o cálculo de `unitPrice` por `precoEfetivo(p.sale_value, p.promotion_price, global)`, buscando `global` uma vez antes do loop. (O `costPrice` segue a promo própria como hoje.)
- **`storeController.listProdutos/getProduto`** (exibição): quando o global está ativo e o produto **não** tem promo própria, devolver um `promotion_price` **calculado** (`= round2(sale_value*(1-percent/100))`) — assim o `precoHTML` que já existe mostra o riscado/promo **sem mexer no front**. (Campo calculado na resposta; o `promotion_price` real no banco continua nulo.)

## #3.1 — Desconto global (novo)

- **Storage:** `store_settings` → `desconto_global_ativo` ('0'/'1'), `desconto_global_percent` (número). Seeds iniciais '0'/'0' (migração idempotente no `connection.js`).
- **API admin (`auth`):** `src/routes/descontos.js` montado em `/api/descontos`:
  - `GET /api/descontos` → `{ ativo, percent }`.
  - `PUT /api/descontos` `{ ativo, percent }` → valida `percent` 0–99,99; grava nos dois settings.
- **Painel:** um card **"Desconto global"** no dashboard (`painel.html`): um toggle/checkbox **Ativar** + campo **%** + botão **Salvar** (via `Auth.apiFetch`). Mostra o estado atual.
- **Público:** `GET /api/loja/desconto-global` → `{ ativo, percent }` (para a faixa na loja).

## #3.2 — Desconto por produto (melhorar o editor)

No modal de editar produto (`list-products.html`), adicionar:
- **Preço de venda** (read-only, de `p.sale_value`).
- **Preço promocional (R$)** — input editável, pré-preenchido com `p.promotion_price` (expõe o campo que hoje fica escondido).
- **Atalho:** um input "Desconto" + seletor **% / R$** → ao preencher, **calcula** o promo: `% → sale_value*(1-x/100)`; `R$ → sale_value - x` (mínimo 0, 2 casas) e preenche o campo "Preço promocional". Limpar o promo = sem desconto (`promotion_price = null`).
- O `submit` envia `promotion_price` (do input) no payload (o `productController.update` já aceita). Não altera `sale_value`.

## #3.3 — Faixa na loja (opcional, marketing)

- Na **home** (`index.html`): quando `GET /api/loja/desconto-global` retorna `ativo`, mostrar uma faixa discreta "🏷️ {percent}% OFF em toda a loja!" no topo do conteúdo. (Só a home, 1 arquivo.)

## Erros / dinheiro / segurança
- Preço **sempre** recalculado no servidor pela `precoEfetivo`; o cliente envia só `{id, qty}`.
- `percent` validado no servidor (0–99,99); `ativo` booleano.
- Exibição e checkout usam a **mesma** `precoEfetivo` → preço mostrado = preço cobrado.
- Arredondamento 2 casas consistente (`round2`).

## Testes
- Unit `precoEfetivo`: (a) sem nada → sale_value; (b) só promo → promo; (c) só global ativo → sale*(1-%); (d) promo + global → promo (vence); (e) global inativo → sale_value.
- API: `PUT /api/descontos` valida % fora de 0–99,99 → 400; `GET` reflete; `GET /api/loja/desconto-global` público.
- Integração: com global 10% ativo, `GET /api/loja/produtos` mostra promo calculada em produto sem promo, e produto com promo própria fica inalterado; `checkout/resumo` cobra o mesmo preço.
- Editor: % e R$ calculam o promo certo; salvar persiste `promotion_price`.

## Decomposição prevista (p/ o plano)
T1 `utils/pricing.js` + seeds em store_settings + aplicar na API de produtos e no `storeOrderController` + endpoint público `/api/loja/desconto-global`. · T2 admin (API `/api/descontos` + card no `painel.html`). · T3 atalho %/R$ no editor de produto (`list-products.html`) + faixa na home (`index.html`).

**Fora de escopo:** cupons/códigos, desconto por categoria, agendar início/fim, desconto global em R$.
