# Produtos visíveis na loja (ocultar produtos da NF) — Design

**Data:** 2026-07-11
**Branch:** `Teste` (banco `db_pedidos_teste`). Nada vai para `main`/produção sem pedido explícito.

## Objetivo

A loja deve mostrar **apenas os produtos que o usuário quer vender** — não os que entram automaticamente
pela importação de NF. Cada produto ganha uma marca "visível na loja": cadastro manual nasce **visível**,
produto criado pela NF nasce **oculto**. No "Editar Produto" há um interruptor para mostrar/ocultar. Nada
some do site automaticamente na migração (revisão assistida): o usuário revisa os produtos existentes com
selo, filtro, interruptor rápido por produto e um botão "ocultar os que nunca foram vendidos".

## Contexto (o que já existe)

- Loja lista/lê produtos em `storeController`: `listProdutos` (catálogo, `storeController.js:18-20`),
  `getProduto` (detalhe + `relacionados`, `:40-44`), `listFranquias` (`:59`). Não há filtro de visibilidade hoje.
- NF cria produto em `nfController.js:72` (`INSERT INTO products (...) VALUES (..., 0)` — estoque 0).
- Cadastro manual em `productController.createProduct` (`:41`). Edição em `updateProduct` (`:160`),
  leitura em `getProductById` (`:97`) e `listAllProducts` (`:125`).
- A tela de produtos ativa é **`src/public/produtos.html`** (`list-products.html` só faz
  `window.location.replace('/produtos.html#listar')`). O modal "Editar Produto" (nome, código, EAN, valor,
  custo, promocional, franquia, descrição, foto) vive nela.
- Rotas em `src/routes/products.js`. Favoritos da loja em `storeFavoritesController`.

## Decisões (confirmadas com o usuário)

1. Produto da NF nasce **oculto**; cadastro manual nasce **visível**.
2. Interruptor "Mostrar na loja" no Editar Produto.
3. **Revisão assistida** para os existentes: nada some na migração (padrão visível); selo + filtro +
   interruptor rápido por produto + botão "ocultar os que nunca foram vendidos".

## Modelo de dados

- Migração aditiva idempotente em `connection.js`:
  `ALTER TABLE products ADD COLUMN visivel_loja TINYINT(1) NOT NULL DEFAULT 1` (dentro de `try/catch`).
  Padrão `1` → todos os produtos existentes continuam visíveis (nada some sozinho).

## Regras de nascimento

- **NF** (`nfController.js:72`): incluir `visivel_loja` com valor **0** no INSERT (produto oculto).
- **Manual** (`productController.createProduct`): sem mudança — o INSERT omite a coluna e usa o DEFAULT `1`.

## Filtro na loja (só visíveis)

Adicionar `visivel_loja = 1` em todos os pontos de leitura voltados ao cliente:
- `listProdutos`: incluir `p.visivel_loja = 1` no `where` (sempre, além de franquia/busca).
- `getProduto`: `... WHERE id = ? AND visivel_loja = 1` → **404** se o produto estiver oculto (link direto
  não vaza produto oculto).
- `relacionados` (dentro de `getProduto`): `... AND visivel_loja = 1`.
- `listFranquias`: `SELECT DISTINCT franchise FROM products WHERE visivel_loja = 1` (não lista franquia que
  só tem produto oculto).
- **Favoritos** (`storeFavoritesController`, listagem): o JOIN com `products` passa a filtrar
  `visivel_loja = 1` (um favorito que virou oculto não aparece mais na vitrine de favoritos).

**Fora de escopo:** bloquear checkout de um produto que já esteja no carrinho e foi ocultado depois
(caso raro; a compra por navegação já está barrada). `buildLines` não muda.

## Backend (productController + rotas)

- `updateProduct`: aceitar `visivel_loja` do corpo (0/1) e incluí-lo no `UPDATE ... SET`. Se não vier no
  corpo, manter o valor atual (não sobrescrever com null). Regra: `const vis = req.body.visivel_loja == null
  ? undefined : (req.body.visivel_loja ? 1 : 0)`; se `undefined`, não altera a coluna.
- `getProductById` e `listAllProducts`: incluir `visivel_loja` no SELECT retornado.
- Novo `toggleVisivel` → `PUT /api/products/:id/visivel` body `{ visivel: true|false }`:
  `UPDATE products SET visivel_loja = ? WHERE id = ?`; 404 se produto não existe; 400 se id inválido.
- Novo `ocultarNuncaVendidos` → `POST /api/products/ocultar-nunca-vendidos`:
  `UPDATE products SET visivel_loja = 0 WHERE id NOT IN (SELECT DISTINCT product_id FROM order_products
  WHERE product_id IS NOT NULL)`; retorna `{ ocultados: <affectedRows> }`.
- Registrar as rotas em `src/routes/products.js` (a fixa `/ocultar-nunca-vendidos` não conflita com
  `/:id`; `/:id/visivel` fica junto de `/:id/image-url`).

## UI (`produtos.html`)

- **Editar Produto:** adicionar o interruptor **"Mostrar na loja"** (checkbox/switch Bootstrap). Ao abrir o
  modal, marcar conforme `produto.visivel_loja`. Ao salvar, incluir `visivel_loja` no corpo do
  `PUT /api/products/:id`.
- **Lista de produtos:**
  - **Selo** por produto: verde "Na loja" quando `visivel_loja=1`, cinza "Oculto" quando `0`.
  - **Filtro** (botões/aba): Todos / Na loja / Ocultos (filtra a lista já carregada por `visivel_loja`).
  - **Interruptor rápido** por produto (sem abrir o modal): chama `PUT /api/products/:id/visivel` e atualiza
    o selo na hora.
  - Botão **"Ocultar os que nunca foram vendidos"**: confirmação (SweetAlert) → `POST
    /api/products/ocultar-nunca-vendidos` → mostra quantos foram ocultados e recarrega a lista.
- Dados interpolados no DOM via `esc()` (padrão do projeto).

## Tratamento de erros / validação

- `visivel` / `visivel_loja`: qualquer valor "verdadeiro" vira 1, o resto 0 (coerção booleana simples).
- ID inválido → 400; produto inexistente → 404.
- `ocultar-nunca-vendidos` é idempotente (rodar de novo não muda nada além do que já estava visível e sem venda).

## Testes

Backend (`test/*.test.js`, banco `db_pedidos_teste`, seeds `zz_test_`):
- `updateProduct` salva `visivel_loja` (liga e desliga); não sobrescreve quando o campo não vem no corpo.
- `getProductById`/`listAllProducts` retornam `visivel_loja`.
- `toggleVisivel`: liga/desliga; 404 para produto inexistente.
- `ocultarNuncaVendidos`: produto sem venda vira oculto; produto com venda (em `order_products`) continua visível.
- `storeController.listProdutos` não retorna produto oculto; `getProduto` dá 404 para produto oculto.
- NF: produto inserido pelo caminho de criação da NF nasce com `visivel_loja=0` (verificado no valor do INSERT).

UI: verificação manual (o projeto não tem testes de UI) — smoke: selo/filtro/interruptor/botão em massa
funcionam; o modal salva o interruptor; loja não mostra ocultos.

## Ondas de implementação

- **Onda 1 (backend):** migração + NF nasce oculto + filtros da loja + `productController`
  (update/get/list + toggle + ocultar-nunca-vendidos) + rotas + testes.
- **Onda 2 (UI):** interruptor no Editar Produto + selo/filtro/interruptor rápido/botão em massa na lista.

## Fora de escopo

- Bloquear compra de produto oculto que já esteja no carrinho (raro).
- Distinção automática "veio da NF" por origem gravada (não existe marca de origem; a revisão assistida usa
  "nunca vendido" como sinal). Produtos novos da NF passam a nascer ocultos daqui pra frente.
