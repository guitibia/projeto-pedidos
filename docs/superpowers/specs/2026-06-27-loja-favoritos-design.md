# Loja — Favoritos (atrelado à conta) — Design

**Data:** 2026-06-27
**Loja:** Beleza Multi Marcas (Node/Express + MySQL)
**Depende de:** sub-1 (catálogo), sub-2 (contas/`customerAuth`).
**Fora de escopo:** notificar quando um favorito entrar em promoção; compartilhar/exportar lista; favoritos para visitante não logado (favoritar exige conta).

## Objetivo

Permitir que o cliente **logado** marque produtos como favoritos (coração nos cards e no detalhe), veja sua lista de favoritos (o coração do header leva pra lá) e tenha um contador no header. Os favoritos ficam **na conta** (servidor), persistindo e sincronizando entre dispositivos.

## Decisões (travadas na conversa)

- **Armazenamento:** no servidor, tabela `favorites` atrelada ao `client_id` (não localStorage).
- **Login obrigatório para favoritar.** Clicar no coração deslogado mostra um **aviso discreto (toast)** "Entre na sua conta para favoritar" com link pro login — sem redirecionar à força.
- **Contador no header** só para quem está logado.

## Banco de dados (migração no padrão `try/catch` do `connection.js`)

```sql
CREATE TABLE IF NOT EXISTS favorites (
  id INT AUTO_INCREMENT PRIMARY KEY,
  client_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_fav (client_id, product_id)
);
```

## Backend — `/api/loja/favoritos` (router novo, tudo sob `customerAuth`)

`src/controllers/storeFavoritesController.js`:
- `GET /api/loja/favoritos` → produtos favoritados do cliente, com dados atuais: `SELECT p.id, p.name, p.franchise, p.code, p.sale_value, p.promotion_price, p.image, p.estoque FROM favorites f JOIN products p ON p.id = f.product_id WHERE f.client_id = ? ORDER BY f.created_at DESC`. (mesma forma de produto que o catálogo usa, pra reusar `cardHTML`).
- `GET /api/loja/favoritos/ids` → `[productId, ...]` do cliente (pra marcar os corações no catálogo e contar).
- `POST /api/loja/favoritos` `{ productId }` → valida id inteiro + produto existe; `INSERT IGNORE` (o `UNIQUE` evita duplicar). Retorna `{ ok: true }`.
- `DELETE /api/loja/favoritos/:productId` → `DELETE FROM favorites WHERE client_id=? AND product_id=?`. Retorna `{ ok: true }`.

`src/routes/lojaFavoritos.js` montado em `/api/loja/favoritos` (após o catálogo). Ownership sempre por `req.customer.id`; SQL parametrizado.

## Frontend

- **Módulo `Favorites`** (em `account.js`, junto do `StoreAuth`): mantém um `Set` de IDs favoritados. `load()` (chamado no `DOMContentLoaded` quando logado) busca `/favoritos/ids`, guarda o set, atualiza o contador do header e marca os corações já na tela; `isFav(id)`; `toggle(id)` (POST/DELETE conforme estado, atualiza o set + UI + contador); `syncHearts()` (varre `[data-fav]` na página e ajusta cheio/vazio).
- **Coração nos cards** (`cardHTML` em `loja.js`): botão ❤ sobreposto na imagem (`product-card__media`), com `data-fav="<id>"` e `onclick="lojaToggleFav(this)"`. `lojaToggleFav` (em `account.js`): se `!StoreAuth.isLoggedIn()` → mostra o toast; senão `Favorites.toggle(id)`.
- **Detalhe do produto** (`produto.html`): um botão "favoritar" (coração) ao lado do "Adicionar ao carrinho", mesmo comportamento.
- **`favoritos.html`** (página nova, moldura padrão): o coração do header aponta pra cá. Se deslogado → "Entre na sua conta para ver seus favoritos" + link `entrar.html`. Logado → `GET /favoritos`, renderiza com `cardHTML` (cada card já vem com o coração cheio; desfavoritar remove o card da lista). Vazio → "Você ainda não tem favoritos" + link pra `produtos.html`.
- **Header** (as 15+ páginas): o `<a>` do coração passa a `href="/loja/favoritos.html"` com um `<span id="fav-count" class="cart-count">` (mesmo estilo do `#cart-count`). `Favorites.load()` preenche o número (oculto/0 quando deslogado).
- **Toast**: pequeno helper `lojaToast(msg, href?)` (em `loja.js`) que mostra uma mensagem transitória no rodapé da tela por ~3s.

Ordem dos scripts (`cart.js → loja.js → account.js → script da página`): `cardHTML`/`lojaToggleFav` referenciam `Favorites`/`StoreAuth` em **tempo de execução** (não no parse), então a ordem atual funciona. Páginas que renderizam produtos de forma assíncrona chamam `Favorites.syncHearts()` após renderizar.

## Erros / segurança / LGPD

- Tudo sob `customerAuth`; favoritos sempre filtrados por `req.customer.id` (cliente só vê/mexe nos seus).
- SQL parametrizado; `UNIQUE (client_id, product_id)` + `INSERT IGNORE` tornam o adicionar idempotente.
- 401/403 nas chamadas → o front trata como "não logado" (toast/login); não quebra a navegação.
- Favoritar é dado pessoal leve (produto preferido), sob a conta com consentimento LGPD já existente.

## Testes (sem suíte automatizada — curl + navegador)

1. Login → `POST /favoritos {productId}` → `GET /favoritos/ids` contém o id → `GET /favoritos` lista o produto.
2. `POST` repetido do mesmo produto → não duplica (UNIQUE).
3. `DELETE /favoritos/:id` → some da lista e dos ids.
4. Sem login → `GET/POST /favoritos` → 401.
5. Ownership: favoritos de um cliente B não aparecem no `GET /favoritos`/`/ids` de um cliente A (filtro por `req.customer.id`).
6. Navegador: coração cheio/vazio no catálogo; contador no header atualiza; `favoritos.html` mostra a lista; deslogado vê o aviso.

## Decomposição prevista (para o plano)

T1 migração `favorites` · T2 `storeFavoritesController` (listar/ids/adicionar/remover) + `routes/lojaFavoritos.js` + mount · T3 módulo `Favorites` + `lojaToggleFav` + `lojaToast` + contador no header (account.js/loja.js) + coração no `cardHTML` · T4 `favoritos.html` + coração no `produto.html` + header (coração vira link + `#fav-count`) nas páginas da loja.
