# Loja Online — Sub-projeto 1: Fundação + Catálogo — Design

**Data:** 2026-06-24
**Branch:** Teste
**Parte de:** Loja e-commerce pública (projeto maior, decomposto em sub-projetos)

## Visão geral do projeto (contexto)

Loja pública para vender os produtos já cadastrados no dashboard (Natura, Avon, Boticário, Eudora, Abelha Rainha), reaproveitando o mesmo banco e a mesma stack (Express + HTML/CSS/JS + MySQL). Decomposição:

1. **Fundação + catálogo** ← *este spec*
2. Contas de cliente + LGPD (cadastro com e-mail/CPF/aniversário/senha; **verificação de e-mail por link — requisito confirmado**; exige envio de e-mail, ex. nodemailer/SMTP ou Resend — a decidir no sub-projeto 2)
3. Checkout (pedido como cliente logado, sem pagamento online)
4. Pagamento automático (gateway)

**Decisões de fundação (já tomadas):** imagens via upload no dashboard; clientes da loja estendem a tabela `clients`; mesma stack; navegação por franquia + busca.

## Objetivo (sub-projeto 1)

Entregar uma loja pública navegável e bonita (estilo "Clean Boutique"): home, listagem, página de produto e carrinho client-side, lendo os produtos existentes — com suporte a foto e descrição de produto cadastrados pelo dashboard.

## Direção visual (validada em mockups)

- **Estilo:** Clean Boutique — claro, muito respiro, foto grande, simples.
- **Paleta:** fundo `#FAF8F6`, superfície `#FFFFFF`, texto `#2B2B2B`, texto suave `#6B6B6B`, acento rosé `#B76E79`, acento claro `#E7D5CE`, borda `#EADFD9`.
- **Tipografia:** Nunito Sans (Google Fonts).
- **Home:** "Hero primeiro" (hero → atalhos de marca → vitrines → rodapé).
- **Produto:** "Foto ao lado" (foto à esquerda, infos/CTA à direita; empilha no mobile).
- Tudo num CSS próprio `loja.css`, **separado** do tema dark do admin.

## Arquitetura

- **Páginas públicas** em `src/public/loja/`: `index.html` (home), `produtos.html` (listagem), `produto.html` (detalhe, lê `?id=`), `carrinho.html`, `privacidade.html`.
- **Assets da loja:** `src/public/loja/loja.css`, `src/public/loja/loja.js` (header, busca, carrinho, helpers), `src/public/loja/cart.js` (carrinho em localStorage).
- **API pública** em `/api/loja/*` (sem auth — só leitura de catálogo), novo `storeController` + `routes/loja.js`, montado em `app.js` **sem** o `auth` middleware.
- Admin/dashboard permanece intacto.

## Banco (migração não-destrutiva em connection.js)

```sql
ALTER TABLE products ADD COLUMN image VARCHAR(255) DEFAULT NULL;
ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL;
```

## Upload de foto + descrição no dashboard

- Dependência nova: `multer` (upload multipart). Arquivos salvos em `src/public/uploads/products/` (servido estaticamente); o caminho relativo vai em `products.image`.
- `produtos.html` (dashboard) ganha no cadastro e na edição: input de **foto** (preview) e textarea de **descrição**.
- `productController`: `createProduct`/`updateProduct` aceitam `image` (arquivo) e `description`; rota de upload (`POST /api/products/:id/image` ou multipart no create/update — definir no plano). Imagem antiga substituída ao trocar.
- `getProductById`/`listAllProducts` retornam `image` e `description`.
- `.gitignore`: ignorar `src/public/uploads/` (arquivos enviados não versionados).

## API da loja

- `GET /api/loja/produtos` — query `?franchise=`, `?q=` (nome/código, case-insensitive), `?sort=` (`recentes|preco_asc|preco_desc|nome`). Retorna id, name, franchise, code, sale_value, promotion_price, image, estoque. Mostra todos; marca "esgotado" quando `estoque <= 0`.
- `GET /api/loja/produtos/:id` — detalhe (inclui description + "relacionados" da mesma franquia).
- `GET /api/loja/franquias` — lista de franquias distintas (para os atalhos/menu).

## Páginas — conteúdo

### Home (`loja/index.html`)
Header (logo, busca, ♡ favoritos, conta, 🛒 carrinho com contador) · Hero (imagem + título + CTA "Comprar") · "Compre por marca" (chips/cards das franquias) · "Ofertas" (produtos com `promotion_price`) · "Novidades" (mais recentes) · Footer (links, contato, **Política de Privacidade**, redes).

### Listagem (`loja/produtos.html`)
Filtro por marca (lateral/topo) + busca + ordenação · grid responsivo de cards: foto (ou placeholder), selo da marca, nome, preço (promo riscando o normal), botão "+ carrinho". Empty state quando nada encontrado. Lê filtros da URL (`?franchise=`, `?q=`).

### Produto (`loja/produto.html?id=`)
Breadcrumb · foto à esquerda · à direita: selo marca, nome, preço/promoção, status de estoque, seletor de quantidade, "Adicionar ao carrinho", ♡ favoritar, descrição · seção "Você também pode gostar" (relacionados).

### Carrinho (`loja/carrinho.html`)
Itens do localStorage (foto, nome, preço, quantidade ajustável, remover), subtotal, botão "Finalizar compra" (desabilitado/aviso "em breve — login no próximo passo"). Persistência em `localStorage` via `cart.js`.

### Carrinho (estado global)
`cart.js`: `addItem(produto, qtd)`, `removeItem(id)`, `setQty(id, qtd)`, `getItems()`, `getCount()`, `getSubtotal()`, `clear()` — tudo em localStorage; o contador no header reflete `getCount()`.

## LGPD (preparando o terreno)
- **Banner de consentimento de cookies** (aceitar/saber mais) exibido até aceitar (guardado em localStorage).
- Página **Política de Privacidade** (`loja/privacidade.html`) com: dados coletados, finalidade, base legal, direitos do titular, contato do controlador. Linkada no footer e no banner.
- Coleta de dados pessoais pesada (cadastro) só no sub-projeto 2; aqui o catálogo não coleta dado pessoal.

## Acessibilidade / qualidade (Clean Boutique)
- Contraste de texto ≥ 4.5:1; foco visível; imagens com `alt`; `loading="lazy"` nas fotos; placeholder com proporção fixa (evita CLS); responsivo 375/768/1024/1440; `prefers-reduced-motion`; toques ≥ 44px.

## Casos de borda
- Produto sem foto → placeholder elegante (ícone + nome).
- Produto sem estoque → card marcado "Esgotado", botão desabilitado.
- Busca sem resultado → empty state com sugestão.
- `promotion_price` nulo → mostra só o preço normal (`sale_value`).

## Fora de escopo (sub-projetos seguintes)
- Login/cadastro de cliente, verificação de e-mail, "meus pedidos" (sub-projeto 2).
- Checkout e criação de pedido pela loja (sub-projeto 3).
- Pagamento online (sub-projeto 4).
- Categorias de produto (decidido: começar por franquia + busca).
