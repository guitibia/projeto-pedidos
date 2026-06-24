# Loja — Sub-projeto 1: Fundação + Catálogo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar uma loja pública navegável (home, listagem, produto, carrinho) no estilo Clean Boutique, lendo os produtos existentes, com suporte a foto/descrição cadastrados pelo dashboard.

**Architecture:** Mesma stack (Express + HTML/CSS/JS + MySQL). Loja pública em `src/public/loja/` servida estaticamente; API pública em `/api/loja/*` sem auth. Produtos ganham `image`/`description`; dashboard sobe foto via multer. Carrinho em localStorage. Admin intacto.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), multer (novo), HTML/CSS/JS vanilla, Nunito Sans

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- Loja isolada do admin: páginas em `src/public/loja/`, API em `/api/loja/*` **sem** o middleware `auth`
- Paleta Clean Boutique: `--bg:#FAF8F6`, `--surface:#FFFFFF`, `--text:#2B2B2B`, `--text-soft:#6B6B6B`, `--accent:#B76E79`, `--accent-soft:#E7D5CE`, `--border:#EADFD9`; corpo em **Nunito Sans**, títulos/wordmark em **Cormorant Garamond** (serif)
- **Nome da loja: "Beleza Multi Marcas"** (usar exatamente assim em header, `<title>`, footer)
- **Logo:** emblema vetorial já criado em `/loja/emblem.svg` (flor line-art rosé). O logo do header/footer = `<img src="/loja/emblem.svg">` + wordmark: "Beleza" em Cormorant Garamond + "Multi Marcas" em caixa-alta pequena com letter-spacing. Já existe um placeholder em `loja/index.html` que será **substituído** pela home real (Task 5)
- `/` (raiz) já redireciona para `/loja/` (cliente cai direto na vitrine); admin via `/login.html`; manter o link discreto "Área administrativa" no footer da loja
- Preço de venda = `sale_value`; promoção = `promotion_price` (quando não nulo, risca o `sale_value`)
- Imagens enviadas em `src/public/uploads/products/`, **ignoradas no git**; caminho relativo em `products.image`
- `esc()`/escape de HTML em qualquer dado do banco renderizado
- Acessibilidade: contraste ≥4.5:1, foco visível, `alt` nas imagens, `loading="lazy"`, responsivo 375/768/1024/1440, `prefers-reduced-motion`, toques ≥44px
- Sem testes automatizados — verificar via curl + browser

---

### Task 1: Migração (image/description) + multer + uploads

**Files:**
- Modify: `src/database/connection.js`, `.gitignore`, `package.json` (via npm)
- Create: `src/public/uploads/products/.gitkeep`

- [ ] **Step 1: Instalar multer**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
npm install multer
```

- [ ] **Step 2: Migração das colunas**

Em `src/database/connection.js`, após a migração existente de `sale_value`, adicionar:
```js
    // Migração: foto e descrição de produto (para a loja)
    try { await conn.query('ALTER TABLE products ADD COLUMN image VARCHAR(255) DEFAULT NULL'); } catch (_) {}
    try { await conn.query('ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL'); } catch (_) {}
```

- [ ] **Step 3: Pasta de uploads + gitignore**

Criar o arquivo `src/public/uploads/products/.gitkeep` (vazio). Em `.gitignore`, adicionar:
```
src/public/uploads/products/*
!src/public/uploads/products/.gitkeep
```

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [c]=await db.query('SHOW COLUMNS FROM products');console.log(c.map(x=>x.Field).filter(f=>['image','description'].includes(f)));process.exit(0)})()" 2>/dev/null
```
Esperado: `[ 'image', 'description' ]`.

- [ ] **Step 5: Commit**

```bash
git add src/database/connection.js .gitignore src/public/uploads/products/.gitkeep package.json package-lock.json
git commit -m "feat(loja): colunas image/description em products + multer + pasta de uploads"
```

---

### Task 2: Upload de foto + descrição no dashboard

**Files:**
- Modify: `src/controllers/productController.js`, `src/routes/products.js`, `src/public/produtos.html`

**Interfaces:**
- Produz: `POST /api/products/:id/image` (multipart, campo `image`) salva o arquivo e grava `products.image`; `updateProduct` aceita `description`; `getProductById`/`listAllProducts` retornam `image`/`description`

- [ ] **Step 1: Configurar multer no controller**

No topo de `src/controllers/productController.js`, após `const db = require('../database/connection');`:
```js
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, `p${req.params.id}_${Date.now()}${ext}`);
  }
});
const uploadImage = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\/(jpe?g|png|webp|gif)/.test(file.mimetype))
}).single('image');
```

- [ ] **Step 2: Endpoint de upload de imagem**

Adicionar ao controller:
```js
// POST /api/products/:id/image
function setProductImage(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  uploadImage(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 4MB, imagem).' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    const rel = '/uploads/products/' + req.file.filename;
    try {
      const [[old]] = await db.query('SELECT image FROM products WHERE id = ?', [id]);
      await db.query('UPDATE products SET image = ? WHERE id = ?', [rel, id]);
      if (old && old.image) {
        const oldPath = path.join(__dirname, '..', 'public', old.image);
        fs.unlink(oldPath, () => {});
      }
      return res.json({ message: 'Imagem atualizada.', image: rel });
    } catch (e) {
      console.error('Erro ao salvar imagem:', e);
      return res.status(500).json({ error: 'Erro ao salvar imagem.' });
    }
  });
}
```
Incluir `setProductImage` no `module.exports`.

- [ ] **Step 3: description em create/update e retornos**

- Em `updateProduct`: aceitar `description` no body e incluir `description=?` no UPDATE (valor `description ?? null`).
- Em `createProduct`: aceitar `description` no body e na coluna do INSERT (`description`).
- Em `getProductById` e na resposta de `searchProductByCode`: incluir `description: p.description ?? null` e `image: p.image ?? null`.
- `listAllProducts` já faz `SELECT *` → retorna ambos.

- [ ] **Step 4: Rota**

Em `src/routes/products.js`, importar `setProductImage` e adicionar:
```js
router.post('/:id/image', setProductImage);
```

- [ ] **Step 5: Frontend — campo de descrição + upload na edição de produto**

Em `src/public/produtos.html`, no modal de edição (`#edit-form`), adicionar após o campo de promoção:
```html
          <div class="mb-3">
            <label class="form-label">Descrição <span style="opacity:.5;font-weight:400">(loja)</span></label>
            <textarea class="form-control" id="edit-description" rows="3" placeholder="Descrição que aparece na loja"></textarea>
          </div>
          <div class="mb-3">
            <label class="form-label">Foto do produto <span style="opacity:.5;font-weight:400">(loja)</span></label>
            <input type="file" class="form-control" id="edit-image" accept="image/*">
            <div id="edit-image-preview" style="margin-top:.5rem"></div>
          </div>
```
Em `openEdit(id)`: setar `edit-description` com `p.description ?? ''` e mostrar preview se `p.image` (`<img src="${p.image}" style="height:70px;border-radius:8px">`).
No submit do `#edit-form`: incluir `description` no payload do PUT; após o PUT bem-sucedido, se houver arquivo em `#edit-image`, enviar via `FormData` para `POST /api/products/${id}/image` com `Auth.apiFetch` (sem definir Content-Type manualmente — deixar o browser definir o boundary; usar `fetch` direto com header Authorization, já que `Auth.apiFetch` força `application/json`). Mostrar erro via Swal se falhar.

Detalhe do upload (usar fetch cru com token, pois apiFetch fixa JSON):
```js
    const file = document.getElementById('edit-image').files[0];
    if (file) {
      const fd = new FormData(); fd.append('image', file);
      const up = await fetch(`/api/products/${id}/image`, {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + Auth.getToken() },
        body: fd
      });
      if (!up.ok) Swal.fire('Atenção', 'Produto salvo, mas a imagem falhou.', 'warning');
    }
```

- [ ] **Step 6: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
# descrição via PUT
ID=$(curl -s "http://localhost:3000/api/products/all" -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d)[0].id))")
echo "produto de teste: $ID"
```
Verificar no browser: editar um produto, escrever descrição, escolher uma foto, salvar; reabrir → preview aparece. Conferir o arquivo em `src/public/uploads/products/`.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/productController.js src/routes/products.js src/public/produtos.html
git commit -m "feat(loja): upload de foto e descrição de produto no dashboard"
```

---

### Task 3: API pública da loja

**Files:**
- Create: `src/controllers/storeController.js`, `src/routes/loja.js`
- Modify: `src/app.js`

**Interfaces:**
- Produz: `GET /api/loja/produtos` (`?franchise=&q=&sort=`), `GET /api/loja/produtos/:id`, `GET /api/loja/franquias`

- [ ] **Step 1: storeController**

Criar `src/controllers/storeController.js`:
```js
const db = require('../database/connection');

const SORTS = {
  recentes:   'p.created_at DESC',
  preco_asc:  'COALESCE(p.promotion_price, p.sale_value) ASC',
  preco_desc: 'COALESCE(p.promotion_price, p.sale_value) DESC',
  nome:       'p.name ASC',
};

async function listProdutos(req, res) {
  const { franchise, q } = req.query;
  const sort = SORTS[req.query.sort] || SORTS.recentes;
  const where = [], params = [];
  if (franchise) { where.push('p.franchise = ?'); params.push(franchise); }
  if (q) { where.push('(p.name LIKE ? OR p.code LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  const sql = `SELECT id, name, franchise, code, sale_value, promotion_price, image, estoque
               FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${sort}`;
  try {
    const [rows] = await db.query(sql, params);
    return res.json(rows);
  } catch (e) { console.error('Erro loja/produtos:', e); return res.status(500).json({ error: 'Erro ao buscar produtos.' }); }
}

async function getProduto(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[p]] = await db.query(
      'SELECT id, name, franchise, code, sale_value, promotion_price, image, description, estoque FROM products WHERE id = ?', [id]);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });
    const [relacionados] = await db.query(
      `SELECT id, name, franchise, sale_value, promotion_price, image, estoque
       FROM products WHERE franchise = ? AND id <> ? ORDER BY RAND() LIMIT 4`, [p.franchise, id]);
    return res.json({ ...p, relacionados });
  } catch (e) { console.error('Erro loja/produto:', e); return res.status(500).json({ error: 'Erro ao buscar produto.' }); }
}

async function listFranquias(req, res) {
  try {
    const [rows] = await db.query('SELECT DISTINCT franchise FROM products ORDER BY franchise');
    return res.json(rows.map(r => r.franchise));
  } catch (e) { console.error('Erro loja/franquias:', e); return res.status(500).json({ error: 'Erro ao buscar franquias.' }); }
}

module.exports = { listProdutos, getProduto, listFranquias };
```

- [ ] **Step 2: Rotas**

Criar `src/routes/loja.js`:
```js
const express = require('express');
const router = express.Router();
const { listProdutos, getProduto, listFranquias } = require('../controllers/storeController');
router.get('/produtos',     listProdutos);
router.get('/produtos/:id', getProduto);
router.get('/franquias',    listFranquias);
module.exports = router;
```

- [ ] **Step 3: Montar no app.js (sem auth)**

Em `src/app.js`, na seção de rotas públicas (após `app.use('/api/auth', ...)`), adicionar:
```js
const lojaRoutes = require('./routes/loja');
app.use('/api/loja', apiLimiter, lojaRoutes);
```

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
curl -s "http://localhost:3000/api/loja/franquias"
echo ""
curl -s "http://localhost:3000/api/loja/produtos?franchise=Boticário&sort=preco_asc" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log('produtos:',a.length,'| 1o:',a[0]&&a[0].name)})"
```
Esperado: lista de franquias; produtos retornando (sem precisar de token).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeController.js src/routes/loja.js src/app.js
git commit -m "feat(loja): API pública /api/loja (produtos, produto, franquias)"
```

---

### Task 4: Assets da loja (CSS + JS + carrinho)

**Files:**
- Create: `src/public/loja/loja.css`, `src/public/loja/cart.js`, `src/public/loja/loja.js`

**Interfaces:**
- Produz: tokens/estilos Clean Boutique; `Cart` (localStorage) global; helpers de header/busca/contador

- [ ] **Step 1: loja.css — tokens e base**

Criar `src/public/loja/loja.css` com:
```css
@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Nunito+Sans:wght@300;400;600;700;800&display=swap');
:root{
  --bg:#FAF8F6; --surface:#FFFFFF; --text:#2B2B2B; --text-soft:#6B6B6B;
  --accent:#B76E79; --accent-dark:#9d5b66; --accent-soft:#E7D5CE; --border:#EADFD9;
  --success:#3a9d5d; --danger:#c0392b; --radius:14px; --maxw:1180px;
  --shadow:0 8px 28px rgba(60,40,35,.10);
}
*,*::before,*::after{box-sizing:border-box}
body{margin:0;font-family:'Nunito Sans',system-ui,sans-serif;background:var(--bg);color:var(--text);line-height:1.55}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
.container{max-width:var(--maxw);margin:0 auto;padding:0 20px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;border:none;border-radius:999px;
  background:var(--accent);color:#fff;font-weight:700;font-size:.95rem;padding:.7rem 1.4rem;cursor:pointer;transition:background .18s,transform .18s}
.btn:hover{background:var(--accent-dark)}
.btn:disabled{opacity:.5;cursor:not-allowed}
.btn-ghost{background:transparent;color:var(--text);border:1px solid var(--border)}
.btn-ghost:hover{background:var(--accent-soft)}
:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation:none!important}}
```
Acrescentar estilos de: `.store-header`, `.store-search`, `.cart-count`, `.product-card`, `.product-grid`, `.brand-chip`, `.hero`, `.section-title`, `.price`, `.price s`, `.store-footer`, placeholder de imagem `.img-ph` (proporção 1:1, ícone + nome), badges de marca `.brand-badge`, e o `.cookie-banner`. (Seguir os tokens; classes citadas são usadas pelas páginas das Tasks 5–8.)

- [ ] **Step 2: cart.js — carrinho em localStorage**

Criar `src/public/loja/cart.js`:
```js
const Cart = (() => {
  const KEY = 'loja_cart';
  function read(){ try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  function write(items){ localStorage.setItem(KEY, JSON.stringify(items)); document.dispatchEvent(new Event('cart:changed')); }
  function getItems(){ return read(); }
  function getCount(){ return read().reduce((s,i)=>s+i.qty,0); }
  function getSubtotal(){ return read().reduce((s,i)=>s + (i.price * i.qty), 0); }
  function addItem(p, qty=1){
    const items = read(); const ex = items.find(i=>i.id===p.id);
    if (ex) ex.qty += qty; else items.push({ id:p.id, name:p.name, price:p.price, image:p.image||null, franchise:p.franchise||'', qty });
    write(items);
  }
  function setQty(id, qty){ const items=read(); const it=items.find(i=>i.id===id); if(it){ it.qty=Math.max(1,qty); write(items);} }
  function removeItem(id){ write(read().filter(i=>i.id!==id)); }
  function clear(){ write([]); }
  return { getItems, getCount, getSubtotal, addItem, setQty, removeItem, clear };
})();
```

- [ ] **Step 3: loja.js — header, busca, contador, util**

Criar `src/public/loja/loja.js` com:
```js
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtBRL(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); }
function precoHTML(p){
  const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
  const venda = Number(p.sale_value||0), pp = Number(p.promotion_price||0);
  return promo
    ? `<span class="price">${fmtBRL(pp)} <s>${fmtBRL(venda)}</s></span>`
    : `<span class="price">${fmtBRL(venda)}</span>`;
}
function imgHTML(p, cls=''){
  return p.image
    ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="img-ph ${cls}"><span>${esc(p.franchise||'')}</span><small>${esc(p.name)}</small></div>`;
}
function syncCartCount(){ const el=document.getElementById('cart-count'); if(el){ const n=Cart.getCount(); el.textContent=n; el.style.display=n?'flex':'none'; } }
document.addEventListener('DOMContentLoaded', syncCartCount);
document.addEventListener('cart:changed', syncCartCount);
```

- [ ] **Step 4: Verificar**

```bash
curl -s -o /dev/null -w "loja.css:%{http_code} cart.js:%{http_code} loja.js:%{http_code}\n" \
  http://localhost:3000/loja/loja.css
node -e "for(const f of ['loja.css','cart.js','loja.js']){} console.log('arquivos criados')"
```
Conferir que os 3 arquivos existem e o CSS importa a fonte.

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/loja.css src/public/loja/cart.js src/public/loja/loja.js
git commit -m "feat(loja): assets base — loja.css (Clean Boutique), cart.js, loja.js"
```

---

### Task 5: Home (`loja/index.html`)

**Files:**
- Create: `src/public/loja/index.html`

**Interfaces:**
- Consome: `/api/loja/produtos`, `/api/loja/franquias`, `loja.css`, `loja.js`, `cart.js`

- [ ] **Step 1: Estrutura da home**

Criar `src/public/loja/index.html` com `<head>` linkando `loja.css`, Nunito Sans, e no fim do body `cart.js` + `loja.js`. Seções (na ordem):
1. **Header** (`.store-header`): logo = `<a href="/loja/">` com `<img src="/loja/emblem.svg">` + wordmark "Beleza" (Cormorant) e "Multi Marcas" (caixa-alta pequena); barra de busca (`.store-search`, form → `produtos.html?q=`), ícones ♡ (favoritos — placeholder), 👤 (conta — link para `#`, "em breve"), 🛒 com `<span id="cart-count" class="cart-count">` (link → `carrinho.html`). Header fixo no topo, responsivo (busca colapsa em ícone no mobile).
2. **Hero** (`.hero`): título "Beleza para o seu dia", subtítulo, botão "Comprar agora" → `produtos.html`. Fundo em gradiente `--accent-soft`.
3. **Compre por marca**: `.section-title` + linha de `.brand-chip` gerados de `/api/loja/franquias` (cada um → `produtos.html?franchise=<marca>`).
4. **Ofertas**: `.section-title` "Ofertas" + `.product-grid` com produtos que têm `promotion_price` (filtrar client-side do `/api/loja/produtos`); máx 8.
5. **Novidades**: `.product-grid` com os mais recentes (`sort=recentes`), máx 8.
6. **Footer** (`.store-footer`): links (Início, Produtos, Política de Privacidade → `privacidade.html`), contato, redes (ícones), aviso LGPD curto.

- [ ] **Step 2: JS de render dos cards**

Função `cardHTML(p)` (reutilizável; pode viver em `loja.js`): card com `imgHTML(p)`, `.brand-badge` com `esc(p.franchise)`, nome (link → `produto.html?id=${p.id}`), `precoHTML(p)`, botão "Adicionar" (chama `Cart.addItem({id,name,price,image,franchise}, 1)` usando `promotion_price||sale_value` como `price`; se `estoque<=0` botão vira "Esgotado" desabilitado). Buscar dados com `fetch('/api/loja/produtos...')` (sem token).

- [ ] **Step 3: Verificar no browser**

`http://localhost:3000/loja/` → header, hero, marcas (clicáveis), vitrines com produtos, footer. Adicionar um produto → contador do carrinho incrementa. Responsivo em 375px.

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/index.html src/public/loja/loja.js
git commit -m "feat(loja): home (hero, marcas, ofertas, novidades)"
```

---

### Task 6: Listagem (`loja/produtos.html`)

**Files:**
- Create: `src/public/loja/produtos.html`

- [ ] **Step 1: Estrutura**

Mesmo header/footer da home. Conteúdo: título + total de resultados; barra de **filtros** (chips de marca de `/api/loja/franquias`, com "Todas"), **busca** (input), **ordenação** (`<select>`: Recentes, Menor preço, Maior preço, Nome). Lê estado inicial da URL (`?franchise=`, `?q=`, `?sort=`). `.product-grid` com `cardHTML(p)`. Empty state quando vazio. Ao mudar filtro/busca/ordem: atualizar a URL (`history.replaceState`) e refazer o `fetch('/api/loja/produtos?...')`. Skeleton enquanto carrega.

- [ ] **Step 2: Verificar**

`http://localhost:3000/loja/produtos.html?franchise=Natura` → grid filtrado; trocar ordenação reordena; busca "batom" filtra; empty state em busca sem resultado.

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/produtos.html
git commit -m "feat(loja): listagem com filtro por marca, busca e ordenação"
```

---

### Task 7: Produto (`loja/produto.html`)

**Files:**
- Create: `src/public/loja/produto.html`

- [ ] **Step 1: Estrutura ("foto ao lado")**

Lê `?id=`. `fetch('/api/loja/produtos/'+id)`. Layout 2 colunas (empilha no mobile): esquerda = foto grande (`imgHTML`), direita = breadcrumb (Início › marca › nome), `.brand-badge`, nome (h1), `precoHTML`, status de estoque (● Em estoque / Esgotado), seletor de quantidade (− n +), botão "Adicionar ao carrinho" (`Cart.addItem`, qtd selecionada; desabilita se esgotado), ♡ favoritar (placeholder), descrição (`esc(p.description)` ou "Sem descrição."). Abaixo: "Você também pode gostar" com `.product-grid` de `p.relacionados` (cardHTML). 404 amigável se produto não existir.

- [ ] **Step 2: Verificar**

`http://localhost:3000/loja/produto.html?id=<ID>` → foto ao lado das infos; ajustar quantidade e adicionar → contador soma a quantidade; relacionados aparecem; id inexistente → mensagem amigável.

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/produto.html
git commit -m "feat(loja): página de produto (foto ao lado, quantidade, relacionados)"
```

---

### Task 8: Carrinho + LGPD (banner + privacidade)

**Files:**
- Create: `src/public/loja/carrinho.html`, `src/public/loja/privacidade.html`
- Modify: `src/public/loja/loja.js` (banner de cookies)

- [ ] **Step 1: Carrinho**

Criar `loja/carrinho.html` com header/footer. Renderiza `Cart.getItems()`: cada item com foto, nome, preço unitário, seletor de quantidade (atualiza via `Cart.setQty`), remover (`Cart.removeItem`), subtotal da linha. Mostra **subtotal** (`Cart.getSubtotal`). Botão "Finalizar compra" **desabilitado** com aviso "Login e checkout no próximo passo". Empty state quando vazio ("Seu carrinho está vazio" + botão "Ver produtos"). Reage a `cart:changed`.

- [ ] **Step 2: Banner de cookies (LGPD) no loja.js**

Adicionar ao `loja.js`: ao carregar, se `localStorage.getItem('loja_cookie_consent')` não for `'1'`, injetar um `.cookie-banner` fixo embaixo com texto curto + link para `privacidade.html` + botão "Aceitar" (grava `'1'` e remove o banner).
```js
(function cookieBanner(){
  if (localStorage.getItem('loja_cookie_consent') === '1') return;
  document.addEventListener('DOMContentLoaded', () => {
    const b = document.createElement('div');
    b.className = 'cookie-banner';
    b.innerHTML = `<span>Usamos cookies para melhorar sua experiência. Veja nossa <a href="/loja/privacidade.html">Política de Privacidade</a>.</span>
      <button class="btn" id="cookie-ok">Aceitar</button>`;
    document.body.appendChild(b);
    document.getElementById('cookie-ok').onclick = () => { localStorage.setItem('loja_cookie_consent','1'); b.remove(); };
  });
})();
```

- [ ] **Step 3: Página de Política de Privacidade**

Criar `loja/privacidade.html` (header/footer + conteúdo legível) com seções: quais dados coletamos, finalidade, base legal (LGPD), com quem compartilhamos (ninguém/serviços essenciais), direitos do titular (acesso, correção, exclusão), cookies, e contato do controlador. Texto objetivo em pt-BR.

- [ ] **Step 4: Verificar**

Carrinho: adicionar itens em outras páginas, abrir `carrinho.html` → itens, ajustar quantidade, remover, subtotal correto; esvaziar → empty state. Banner de cookies aparece na 1ª visita e some ao aceitar (não volta). `privacidade.html` abre e está linkada no footer e no banner.

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/carrinho.html src/public/loja/privacidade.html src/public/loja/loja.js
git commit -m "feat(loja): carrinho, banner de cookies LGPD e política de privacidade"
```
