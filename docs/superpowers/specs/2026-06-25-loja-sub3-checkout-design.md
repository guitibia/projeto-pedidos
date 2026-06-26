# Loja — Sub-projeto 3: Checkout — Design

**Data:** 2026-06-25
**Loja:** Beleza Multi Marcas (sobre o dashboard Node/Express + MySQL existente)
**Depende de:** sub-projeto 1 (catálogo) e sub-projeto 2 (contas de cliente / `customerAuth`)
**Fora de escopo (sub-projeto 4):** cobrança/pagamento real (PIX/cartão automatizado) e e-mail de confirmação de pedido.

## Objetivo

Permitir que um cliente **logado** finalize a compra do carrinho: confirma os itens, informa/edita o endereço de entrega (com **busca por CEP**), vê o resumo com frete e cria o pedido no banco. O pedido nasce como **Pendente** com pagamento **A COMBINAR** (o pagamento automatizado fica para o sub-4). O cliente acompanha tudo em **Meus pedidos**.

## Decisões (travadas na conversa)

- **Pagamento:** pedido entra como `Pendente`, `payment_method = 'A COMBINAR'`; pagamento combinado fora do site por enquanto.
- **Meus pedidos:** incluído neste sub-projeto (lista + detalhe).
- **Endereço:** pré-preenchido do cadastro, **editável** no checkout; editar **atualiza o cadastro** do cliente (`clients`) e re-geocodifica. Sem snapshot por pedido.
- **Origem:** nova coluna `orders.origin` para distinguir `'loja'` de `'painel'`.
- **Login:** obrigatório. Sem login → `entrar.html?next=/loja/checkout.html`.
- **Busca por CEP:** formulário de endereço usa a API pública **ViaCEP** (client-side) para autopreencher logradouro, bairro e cidade a partir do CEP.

## Banco de dados (migrações no padrão `try/catch` do `connection.js`)

```sql
ALTER TABLE orders   ADD COLUMN origin VARCHAR(20) NOT NULL DEFAULT 'painel';
ALTER TABLE clients  ADD COLUMN cep  VARCHAR(8)   DEFAULT NULL;
ALTER TABLE clients  ADD COLUMN city VARCHAR(120) DEFAULT NULL;
-- payment_method é um ENUM; adicionar 'A COMBINAR' (aditivo, não quebra valores existentes):
ALTER TABLE orders MODIFY COLUMN payment_method
  ENUM('PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO','A COMBINAR') NOT NULL;
```

- Pedidos existentes ficam `origin='painel'`; a loja grava `'loja'`.
- `orders.status` já tem default `'Pendente'` e `orders.created_at` já existe (`datetime default current_timestamp`) — usados em Meus pedidos.
- `cep` guarda 8 dígitos (sem máscara). `city` guarda a localidade do CEP (ViaCEP `localidade`), usada para geocodificar com precisão (`geocodeClient` já aceita o parâmetro `city`).
- Reuso integral de `orders`, `order_products`, `estoque_movimentacoes`. `order_parcelas` não é usada (método `A COMBINAR` não parcela).

## Backend

Novo controller `src/controllers/storeOrderController.js`; rotas montadas em `/api/loja` (todas protegidas por `customerAuth`, ou seja, exigem JWT `type:'customer'`). **O servidor nunca confia em preço/estoque vindos do cliente** — recalcula tudo do banco; o carrinho envia apenas `{ id, qty }`.

Preço autoritativo de cada item: `COALESCE(promotion_price, sale_value)` (mesma regra do catálogo). Frete: `utils/geo` (`geocodeClient(address, houseNumber, neighborhood, city)` + `deliveryFee(lat, lng)`).

### `POST /api/loja/checkout/resumo` — revisão (não grava nada)
Body: `{ items: [{ id, qty }], cep?, address?, houseNumber?, neighborhood?, city? }`
- Valida cada item: existe? `qty` ≥ 1 inteiro? Estoque suficiente? Itens problemáticos retornam sinalizados (não derruba o resumo inteiro).
- Calcula preço autoritativo por linha, `subtotal`, `deliveryFee` (geocodifica o endereço informado; se não vier endereço no body, usa o do cadastro) e `total = subtotal + deliveryFee`.
- Resposta: `{ items: [{ id, name, image, unitPrice, qty, lineTotal, ok, reason? }], subtotal, deliveryFee, total }`.
- **Não** baixa estoque, **não** persiste endereço.

### `POST /api/loja/pedidos` — finaliza (transação)
Body: `{ items: [{ id, qty }], cep?, address?, houseNumber?, neighborhood?, city? }`
1. Se vier endereço, atualiza `clients` (`address, house_number, neighborhood, cep, city`) e re-geocodifica (`lat/lng`).
2. Em **transação** (mesmo padrão do `orderController`): revalida estoque de cada item; calcula preço autoritativo; insere `orders` (`client_id = req.customer.id`, `origin='loja'`, `payment_method='A COMBINAR'`, `installments=NULL`, `combined_payment_value=NULL`, `total_cost=subtotal+fee`, `delivery_fee=fee`, status default Pendente); insere `order_products` (`sale_price`, `quantity`, `cost_price = COALESCE(promotion?,custo)`); baixa estoque + registra `estoque_movimentacoes` (`Saída`, "Pedido #N (loja)").
3. Resposta `201`: `{ orderId, subtotal, deliveryFee, total }`.
4. Erros (estoque insuficiente, item sumiu, carrinho vazio) → `400` com mensagem; rollback.

### `GET /api/loja/pedidos` — histórico do próprio cliente
- `WHERE o.client_id = req.customer.id`, `ORDER BY o.id DESC`.
- Resposta: `[{ id, created_at, status, total_cost, delivery_fee, item_count }]` (ordena por `id DESC`; `created_at` já existe na tabela).

### `GET /api/loja/pedidos/:id` — detalhe (apenas do dono)
- Carrega o pedido; se `order.client_id !== req.customer.id` → **404** (não vaza existência de pedido alheio).
- Resposta: cabeçalho (`id, status, payment_method, total_cost, delivery_fee, endereço do cliente`) + `products: [{ name, franchise, sale_price, quantity }]`.

## Frontend (`src/public/loja/`, mesmo design Clean Boutique; scripts na ordem `cart.js → loja.js → account.js → script da página`)

- **`checkout.html`** (protegida — sem `loja_token` → `entrar.html?next=/loja/checkout.html`):
  - **Itens:** lê o carrinho do `localStorage` (`Cart`), exibe miniaturas/nome/qtd.
  - **Endereço de entrega:** campos CEP, logradouro, número, bairro, cidade. Pré-preenchido via `GET /api/loja/auth/me`. **Busca CEP:** ao preencher o CEP (8 dígitos), chama `https://viacep.com.br/ws/<cep>/json/`; preenche logradouro (`logradouro`), bairro (`bairro`), cidade (`localidade`); foca o número. Erro/`{erro:true}` → mensagem "CEP não encontrado" sem travar o preenchimento manual.
  - **Resumo:** chama `POST /api/loja/checkout/resumo` (com itens + endereço atual) e mostra subtotal + frete + total; recalcula ao mudar o endereço.
  - **Finalizar pedido** → `POST /api/loja/pedidos` → `Cart.clear()` → `pedido-confirmado.html?id=<orderId>`.
- **`pedido-confirmado.html?id=`** (protegida): número do pedido, resumo, aviso "pagamento a combinar", links para **Meus pedidos** e **continuar comprando**.
- **`meus-pedidos.html`** (protegida): lista de `GET /api/loja/pedidos` com status (badge) e total; cada item abre o detalhe.
- **`pedido.html?id=`** (protegida): detalhe de `GET /api/loja/pedidos/:id` (itens, frete, total, status, endereço).
- **Ajustes:** `carrinho.html` → botão "Finalizar compra" leva a `checkout.html`; `conta.html` ganha link "Meus pedidos"; (opcional) item "Meus pedidos" no menu da conta.

`StoreAuth` (de `account.js`) já cobre token/headers/`api()`. Páginas protegidas redirecionam para `entrar.html` em 401/403.

## Erros e estados

- Carrinho vazio → checkout bloqueia "Finalizar" e mostra aviso.
- Item sem estoque / inexistente → sinalizado no resumo; "Finalizar" bloqueado até ajustar.
- Preço/estoque mudou entre resumo e confirmação → o `POST /pedidos` é autoritativo e devolve o total final efetivo.
- 401/403 → `StoreAuth.logout()` + `entrar.html`.
- Detalhe de pedido de outro cliente → 404.
- ViaCEP fora do ar / CEP inválido → permite preenchimento manual; nunca bloqueia o checkout.

## Segurança / LGPD

- Tudo sob `customerAuth`; pedidos e detalhes sempre filtrados por `req.customer.id` (ownership) — cliente só vê/cria o que é seu.
- SQL parametrizado; preços e frete sempre recalculados no servidor (carrinho do cliente não é fonte de verdade).
- ViaCEP recebe apenas o CEP (dado de endereço público, padrão no Brasil), nenhum dado pessoal.

## Testes (sem suíte automatizada — curl + navegador)

1. Login (sub-2) → `POST /checkout/resumo` com 1–2 itens → confere subtotal/frete/total.
2. `POST /pedidos` → `201` com `orderId`; conferir no banco: `origin='loja'`, `payment_method='A COMBINAR'`, estoque baixado, `estoque_movimentacoes` registrada.
3. `GET /pedidos` (do cliente) lista o pedido; `GET /pedidos/:id` mostra o detalhe.
4. `GET /pedidos/:id` de um pedido de **outro** cliente → 404.
5. Carrinho vazio → `POST /pedidos` → 400.
6. Estoque insuficiente → resumo sinaliza e `POST /pedidos` → 400 (rollback, estoque intacto).
7. Navegador: CEP válido autopreenche o endereço; fluxo carrinho → checkout → confirmação → meus pedidos.

## Decomposição prevista (para o plano)

T1 migrações (`origin`, `cep`, `city`, enum `A COMBINAR`) · T2 `storeOrderController` resumo + criar (transação) + rotas · T3 endpoints histórico/detalhe (ownership) · T4 `checkout.html` (itens + endereço + ViaCEP + resumo + finalizar) · T5 `pedido-confirmado.html` · T6 `meus-pedidos.html` + `pedido.html` · T7 ajustes em `carrinho.html`/`conta.html`.
