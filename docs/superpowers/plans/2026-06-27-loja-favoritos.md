# Loja — Favoritos (atrelado à conta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente logado favorita produtos (coração nos cards e no detalhe), vê a lista em favoritos.html, com contador no header — tudo persistido na conta.

**Architecture:** Tabela `favorites` (client_id, product_id) + API `/api/loja/favoritos` sob `customerAuth`. No front, um módulo `Favorites` (em account.js) mantém o set de ids do cliente, marca os corações (`syncHearts`) e atualiza o contador; `cardHTML` ganha um coração; `produto.html` liga o botão existente; `favoritos.html` lista. Reuso de `customerAuth`, `StoreAuth`, `cardHTML`.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla.

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`.
- CommonJS; migrações no startup de `connection.js`, cada uma em `try { } catch (_) {}`.
- Rotas de favoritos sob `customerAuth` (JWT `type:'customer'`); ownership sempre por `req.customer.id`.
- Favoritar exige login; deslogado → toast "Entre na sua conta para favoritar" (sem redirect forçado). Contador no header só para logados.
- `Favorites` usa `fetch` próprio para `/api/loja/favoritos*` com Bearer de `StoreAuth.getToken()` (o `StoreAuth.api()` prefixa `/api/loja/auth`, então NÃO serve aqui).
- `cardHTML`/`lojaToggleFav` referenciam `Favorites`/`StoreAuth`/`lojaToast` em tempo de execução (a ordem `cart.js→loja.js→account.js→script` é respeitada).
- SQL parametrizado; sem testes automatizados — curl + navegador. Matar `node` antes de testar (`powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`), depois `node src/app.js &`, `sleep 3`.

---

### Task 1: Migração — tabela favorites

**Files:**
- Modify: `src/database/connection.js`

- [ ] **Step 1: Migração**

Em `src/database/connection.js`, após a última migração existente (PIX do sub-5), adicionar:
```js
    // Migração: favoritos da loja
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS favorites (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          product_id INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_fav (client_id, product_id)
        )`);
    } catch (_) {}
```

- [ ] **Step 2: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [t]=await db.query(\"SHOW TABLES LIKE 'favorites'\");console.log('favorites existe:', t.length===1);const [c]=await db.query('SHOW COLUMNS FROM favorites');console.log('colunas:', c.map(x=>x.Field).join(','));process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: `favorites existe: true`; colunas `id,client_id,product_id,created_at`.

- [ ] **Step 3: Commit**

```bash
git add src/database/connection.js
git commit -m "feat(loja): migração da tabela favorites"
```

---

### Task 2: API de favoritos

**Files:**
- Create: `src/controllers/storeFavoritesController.js`, `src/routes/lojaFavoritos.js`
- Modify: `src/app.js`

**Interfaces:**
- Consome: `customerAuth` (`req.customer.id`).
- Produz: `GET /api/loja/favoritos` (lista produtos), `GET /api/loja/favoritos/ids` (array de ids), `POST /api/loja/favoritos` `{productId}`, `DELETE /api/loja/favoritos/:productId`.

- [ ] **Step 1: Criar `src/controllers/storeFavoritesController.js`**

```js
const db = require('../database/connection');

function parseId(v) { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; }

// GET /api/loja/favoritos — produtos favoritados do cliente (dados atuais)
async function listar(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.franchise, p.code, p.sale_value, p.promotion_price, p.image, p.estoque
       FROM favorites f JOIN products p ON p.id = f.product_id
       WHERE f.client_id = ? ORDER BY f.created_at DESC`,
      [req.customer.id]
    );
    return res.json(rows);
  } catch (e) { console.error('Erro ao listar favoritos:', e); return res.status(500).json({ error: 'Erro ao buscar favoritos.' }); }
}

// GET /api/loja/favoritos/ids — só os ids (p/ marcar corações e contar)
async function ids(req, res) {
  try {
    const [rows] = await db.query('SELECT product_id FROM favorites WHERE client_id = ?', [req.customer.id]);
    return res.json(rows.map(r => r.product_id));
  } catch (e) { console.error('Erro ao listar ids de favoritos:', e); return res.status(500).json({ error: 'Erro.' }); }
}

// POST /api/loja/favoritos { productId }
async function adicionar(req, res) {
  const pid = parseId(req.body && req.body.productId);
  if (!pid) return res.status(400).json({ error: 'Produto inválido.' });
  try {
    const [[prod]] = await db.query('SELECT id FROM products WHERE id = ?', [pid]);
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado.' });
    await db.query('INSERT IGNORE INTO favorites (client_id, product_id) VALUES (?, ?)', [req.customer.id, pid]);
    return res.status(201).json({ ok: true });
  } catch (e) { console.error('Erro ao favoritar:', e); return res.status(500).json({ error: 'Erro ao favoritar.' }); }
}

// DELETE /api/loja/favoritos/:productId
async function remover(req, res) {
  const pid = parseId(req.params.productId);
  if (!pid) return res.status(400).json({ error: 'Produto inválido.' });
  try {
    await db.query('DELETE FROM favorites WHERE client_id = ? AND product_id = ?', [req.customer.id, pid]);
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao remover favorito:', e); return res.status(500).json({ error: 'Erro.' }); }
}

module.exports = { listar, ids, adicionar, remover };
```

- [ ] **Step 2: Criar `src/routes/lojaFavoritos.js`**

```js
const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/storeFavoritesController');

router.get('/ids', customerAuth, c.ids);
router.get('/', customerAuth, c.listar);
router.post('/', customerAuth, c.adicionar);
router.delete('/:productId', customerAuth, c.remover);

module.exports = router;
```

- [ ] **Step 3: Montar no app.js**

Em `src/app.js`, após o mount de `lojaPagamentosRoutes`, adicionar:
```js
const lojaFavoritosRoutes = require('./routes/lojaFavoritos');
app.use('/api/loja/favoritos', apiLimiter, lojaFavoritosRoutes);
```

- [ ] **Step 4: Verificar (sem login → 401; fluxo logado)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "GET /favoritos sem login -> 401: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/favoritos
echo -n "POST /favoritos sem login -> 401: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/favoritos -X POST -H "Content-Type: application/json" -d '{"productId":1}'
# cria+verifica+loga um cliente e testa o fluxo
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Fav Teste","email":"fav@teste.com","cpf":"52998224725","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}' >/dev/null
TK=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='fav@teste.com'\");console.log(c?c.t:'');process.exit(0)})()" 2>/dev/null)
curl -s "http://localhost:3000/api/loja/auth/verify?token=$TK" >/dev/null
JWT=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"fav@teste.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id FROM products ORDER BY id LIMIT 1');console.log(p.id);process.exit(0)})()" 2>/dev/null)
echo -n "favoritar -> 201: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/favoritos -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"productId\":$PID}"
echo -n "favoritar de novo (idempotente) -> 201: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/favoritos -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"productId\":$PID}"
echo -n "ids contém o produto: "; curl -s -m 8 http://localhost:3000/api/loja/favoritos/ids -H "Authorization: Bearer $JWT"
echo ""; echo -n "lista tem 1 item: "; curl -s -m 8 http://localhost:3000/api/loja/favoritos -H "Authorization: Bearer $JWT" | grep -o '"id":[0-9]*' | wc -l
echo -n "remover -> ok: "; curl -s -m 8 http://localhost:3000/api/loja/favoritos/$PID -X DELETE -H "Authorization: Bearer $JWT"
echo ""; echo -n "ids vazio após remover: "; curl -s -m 8 http://localhost:3000/api/loja/favoritos/ids -H "Authorization: Bearer $JWT"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: sem login → 401 (GET e POST); favoritar → 201 (e 201 de novo sem duplicar); `ids` `[<PID>]`; lista com 1 item; remover → `{"ok":true}`; `ids` vazio `[]`. (Apague o cliente de teste depois: `DELETE FROM clients WHERE email='fav@teste.com'`.)

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeFavoritesController.js src/routes/lojaFavoritos.js src/app.js
git commit -m "feat(loja): API de favoritos (listar/ids/adicionar/remover)"
```

---

### Task 3: Módulo Favorites + coração nos cards + toast

**Files:**
- Modify: `src/public/loja/account.js`, `src/public/loja/loja.js`, `src/public/loja/loja.css`

**Interfaces:**
- Consome: `StoreAuth` (getToken/isLoggedIn); API `/api/loja/favoritos*`.
- Produz: globais `Favorites` (`load`, `isLoaded`, `isFav`, `toggle`, `syncHearts`), `lojaToggleFav(btn)`, `lojaToast(msg, href?)`; e o coração `[data-fav]` que `cardHTML` passa a emitir.

- [ ] **Step 1: Módulo `Favorites` + `lojaToggleFav` no fim de `account.js`**

Adicionar ao fim de `src/public/loja/account.js` (depois do `StoreAuth`):
```js
// ── Favoritos (atrelado à conta) ──
const Favorites = (() => {
  const ids = new Set();
  let loaded = false;

  function authHeaders() {
    const t = StoreAuth.getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }
  function updateCount() {
    const el = document.getElementById('fav-count');
    if (!el) return;
    const n = ids.size;
    el.textContent = n;
    el.style.display = (StoreAuth.isLoggedIn() && n > 0) ? 'flex' : 'none';
  }
  function syncHearts() {
    const nodes = document.querySelectorAll('[data-fav]');
    nodes.forEach(function (el) {
      const fid = parseInt(el.getAttribute('data-fav'), 10);
      const on = ids.has(fid);
      el.classList.toggle('is-fav', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      const icon = el.querySelector('i');
      if (icon) icon.className = on ? 'bi bi-heart-fill' : 'bi bi-heart';
    });
  }
  async function load() {
    if (!StoreAuth.isLoggedIn()) { loaded = true; updateCount(); return; }
    try {
      const r = await fetch('/api/loja/favoritos/ids', { headers: authHeaders() });
      if (r.ok) {
        const arr = await r.json();
        ids.clear();
        (arr || []).forEach(function (x) { ids.add(Number(x)); });
      }
    } catch (e) {}
    loaded = true;
    updateCount();
    syncHearts();
  }
  function isLoaded() { return loaded; }
  function isFav(id) { return ids.has(Number(id)); }
  async function toggle(id) {
    id = Number(id);
    const had = ids.has(id);
    if (had) ids.delete(id); else ids.add(id);   // otimista
    updateCount(); syncHearts();
    try {
      if (had) {
        await fetch('/api/loja/favoritos/' + id, { method: 'DELETE', headers: authHeaders() });
      } else {
        await fetch('/api/loja/favoritos', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ productId: id })
        });
      }
    } catch (e) {
      if (had) ids.add(id); else ids.delete(id);  // reverte em erro
      updateCount(); syncHearts();
    }
  }
  document.addEventListener('DOMContentLoaded', load);
  return { load, isLoaded, isFav, toggle, syncHearts };
})();

function lojaToggleFav(btn) {
  if (typeof StoreAuth === 'undefined' || !StoreAuth.isLoggedIn()) {
    lojaToast('Entre na sua conta para favoritar ❤', '/loja/entrar.html');
    return;
  }
  const id = btn.getAttribute('data-fav');
  if (id) Favorites.toggle(id);
}
```

- [ ] **Step 2: `lojaToast` + coração no `cardHTML` em `loja.js`**

Em `src/public/loja/loja.js`, adicionar o helper de toast (perto do topo, após `esc`/`fmtBRL`):
```js
function lojaToast(msg, href) {
  var t = document.createElement('div');
  t.className = 'loja-toast';
  t.setAttribute('role', 'status');
  t.innerHTML = esc(msg) + (href ? ' <a href="' + esc(href) + '">Entrar</a>' : '');
  document.body.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('loja-toast--show'); });
  setTimeout(function () { t.classList.remove('loja-toast--show'); setTimeout(function () { t.remove(); }, 300); }, 3200);
}
```
E no `cardHTML`, dentro de `'<div class="product-card__media">'`, inserir o botão de coração como primeiro filho da mídia (antes do `<a ...>`):
```js
      '<div class="product-card__media">' +
        '<button class="card-fav" type="button" data-fav="' + esc(String(p.id)) + '" onclick="lojaToggleFav(this)" aria-label="Favoritar" aria-pressed="false"><i class="bi bi-heart"></i></button>' +
        '<a href="produto.html?id=' + esc(String(p.id)) + '" tabindex="-1" aria-hidden="true">' +
          imgHTML(p, '') +
        '</a>' +
```
(O resto do `cardHTML` permanece igual.)

- [ ] **Step 3: CSS em `loja.css`** (coração nos cards, contador, toast)

Adicionar ao fim de `src/public/loja/loja.css`:
```css
/* Favoritos */
.card-fav{position:absolute;top:.6rem;right:.6rem;z-index:3;width:32px;height:32px;border-radius:999px;border:none;
  background:rgba(255,255,255,.92);color:#b76e79;display:flex;align-items:center;justify-content:center;cursor:pointer;
  font-size:1rem;box-shadow:0 1px 5px rgba(0,0,0,.14);transition:transform .15s, background .15s}
.card-fav:hover{transform:scale(1.12);background:#fff}
.card-fav.is-fav,.card-fav .bi-heart-fill{color:#e0245e}
.loja-toast{position:fixed;left:50%;bottom:1.4rem;transform:translateX(-50%) translateY(1rem);z-index:1000;
  background:var(--text);color:#fff;padding:.7rem 1.1rem;border-radius:999px;font-size:.9rem;box-shadow:0 4px 16px rgba(0,0,0,.25);
  opacity:0;transition:opacity .25s, transform .25s;pointer-events:none;max-width:90vw}
.loja-toast a{color:#ffd9df;font-weight:700;margin-left:.3rem;pointer-events:auto}
.loja-toast--show{opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto}
```

- [ ] **Step 4: Verificar (parse + presença)**

```bash
node -e "new Function(require('fs').readFileSync('src/public/loja/account.js','utf8')); console.log('account.js OK')"
node -e "new Function(require('fs').readFileSync('src/public/loja/loja.js','utf8')); console.log('loja.js OK')"
node -e "const h=require('fs').readFileSync('src/public/loja/loja.js','utf8'); console.log('cardHTML tem coração:', h.includes('card-fav') && h.includes('lojaToggleFav')); console.log('tem lojaToast:', h.includes('function lojaToast'));"
node -e "const a=require('fs').readFileSync('src/public/loja/account.js','utf8'); console.log('Favorites + lojaToggleFav:', a.includes('const Favorites') && a.includes('function lojaToggleFav'));"
node -e "const c=require('fs').readFileSync('src/public/loja/loja.css','utf8'); console.log('css .card-fav e .loja-toast:', c.includes('.card-fav') && c.includes('.loja-toast'));"
```
Esperado: account.js OK; loja.js OK; coração/toast/Favorites/css todos `true`.

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/account.js src/public/loja/loja.js src/public/loja/loja.css
git commit -m "feat(loja): módulo Favorites + coração nos cards + toast"
```

---

### Task 4: Integração — favoritos.html, header, produto.html, catálogo

**Files:**
- Create: `src/public/loja/favoritos.html`
- Modify: `src/public/loja/produto.html`, `src/public/loja/index.html`, `src/public/loja/produtos.html`, e o header (coração) de todas as páginas da loja.

**Interfaces:**
- Consome: `Favorites`, `lojaToggleFav`, `cardHTML`, `StoreAuth`.

- [ ] **Step 1: Header — coração vira link + contador, em todas as páginas da loja**

O coração do header hoje é `<a href="#" title="Favoritos (em breve)" ...><i class="bi bi-heart"></i></a>`. Trocar em todas as páginas para apontar a `favoritos.html` e ganhar o `#fav-count`. Rode este script (idempotente):
```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
node -e "
const fs=require('fs'); const dir='src/public/loja'; let n=0;
const novo='<a href=\"/loja/favoritos.html\" title=\"Favoritos\" aria-label=\"Favoritos\" style=\"position:relative\">\n          <i class=\"bi bi-heart\" aria-hidden=\"true\"></i>\n          <span id=\"fav-count\" class=\"cart-count\" aria-live=\"polite\" aria-atomic=\"true\"></span>\n        </a>';
for (const f of fs.readdirSync(dir)) {
  if(!f.endsWith('.html')) continue;
  const p=dir+'/'+f; let h=fs.readFileSync(p,'utf8'); const before=h;
  // substitui o link de coração do header (em breve OU já apontando) pelo novo
  h=h.replace(/<a href=\"[^\"]*\" title=\"Favoritos[^\"]*\"[^>]*>\s*<i class=\"bi bi-heart\"[^>]*><\/i>(\s*<span id=\"fav-count\"[\s\S]*?<\/span>)?\s*<\/a>/, novo);
  if(h!==before){ fs.writeFileSync(p,h); n++; console.log('header atualizado:',f); }
}
console.log('arquivos:',n);
"
```
(Se algum arquivo não casar o padrão, ajuste manualmente o coração do header daquele arquivo para o bloco `novo` acima.)

- [ ] **Step 2: Carregar `account.js` nas páginas de catálogo (index, produtos, produto)**

Essas 3 páginas mostram cards mas não carregam `account.js` (onde mora o `Favorites`). Em cada uma, logo após a linha `<script src="/loja/loja.js"></script>`, adicionar:
```html
  <script src="/loja/account.js"></script>
```
(As páginas de conta já carregam; só faltam index/produtos/produto.)

- [ ] **Step 3: Ligar o coração do detalhe em `produto.html`**

`produto.html` já tem um botão `.btn-fav` placeholder ("Favoritar (em breve)"). Trocar por um coração funcional. Localizar:
```js
                '<button type="button" class="btn-fav" title="Favoritar (em breve)" aria-label="Favoritar — em breve">' +
                  '<i class="bi bi-heart" aria-hidden="true"></i>' +
                '</button>' +
```
e trocar por (usando o id do produto exibido — a variável do produto na página, ex.: `p.id`/`prod.id`; usar a que existir no escopo):
```js
                '<button type="button" class="btn-fav" data-fav="' + esc(String(PRODUTO_ID)) + '" onclick="lojaToggleFav(this)" title="Favoritar" aria-label="Favoritar" aria-pressed="false">' +
                  '<i class="bi bi-heart" aria-hidden="true"></i>' +
                '</button>' +
```
Substituir `PRODUTO_ID` pela variável real do id do produto no escopo dessa função (ler o trecho ao redor para confirmar o nome). Após renderizar o detalhe, chamar `if (typeof Favorites !== 'undefined') Favorites.syncHearts();` (para o coração já vir cheio se favoritado). Os produtos relacionados (via `cardHTML`) já vêm com coração automático.

- [ ] **Step 4: Criar `favoritos.html`**

Moldura padrão da loja (head + header/footer copiados de `index.html`, já com o coração novo do Step 1; scripts `cart.js`, `loja.js`, `account.js`, depois o script da página). Conteúdo:
- Título "Meus Favoritos".
- Script (`'use strict'` IIFE):
  - Se `!StoreAuth.isLoggedIn()` → mostrar "Entre na sua conta para ver seus favoritos" + link `entrar.html?next=/loja/favoritos.html` (não buscar).
  - Senão `fetch('/api/loja/favoritos', { headers: { Authorization: 'Bearer ' + StoreAuth.getToken() } })`:
    - 401/403 → `StoreAuth.logout()` + recarrega (mostra o estado deslogado).
    - lista vazia → estado vazio "Você ainda não tem favoritos" + link `produtos.html`.
    - senão → `grid.innerHTML = items.map(cardHTML).join('')` (cada card já traz o coração; cheio após `Favorites.syncHearts()`), e chamar `Favorites.syncHearts()`.
  - Como desfavoritar pela própria página remove do servidor mas o card continua na tela: ouvir cliques no `.card-fav` (ou após `toggle`) e, se o produto saiu dos favoritos, **remover o card da grade** (re-buscar a lista, ou remover o `<article>` correspondente). Simples: após um toggle nessa página, recarregar a lista (`carregar()` de novo) — como o toggle é otimista, dá pra apenas remover o card cujo `data-fav` ficou vazio. Implementar removendo o card no clique do coração quando ele desmarca.

- [ ] **Step 5: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "favoritos.html 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/favoritos.html
for f in index produtos produto favoritos; do echo -n "$f carrega account.js: "; curl -s http://localhost:3000/loja/$f.html | grep -c "account.js"; done
echo -n "header aponta p/ favoritos.html (amostra index): "; curl -s http://localhost:3000/loja/ | grep -c 'favoritos.html'
echo -n "produto.html liga o coração: "; curl -s http://localhost:3000/loja/produto.html | grep -c 'lojaToggleFav'
node -e "const h=require('fs').readFileSync('src/public/loja/favoritos.html','utf8');const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,'');new Function(s);console.log('favoritos.html script OK')"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: favoritos.html 200; index/produtos/produto/favoritos com `account.js` ≥1; header com `favoritos.html` ≥1; produto.html com `lojaToggleFav` ≥1; script parse OK.

- [ ] **Step 6: Teste no navegador (manual)**

`npm run dev` → logar → na vitrine/produtos, clicar no coração de um produto (fica cheio, contador do header sobe) → abrir **Favoritos** (coração do header) → ver o produto → desfavoritar (some) → deslogar e clicar num coração → aparece o toast "Entre na sua conta para favoritar".

- [ ] **Step 7: Commit**

```bash
git add src/public/loja/favoritos.html src/public/loja/produto.html src/public/loja/index.html src/public/loja/produtos.html
# (o script do Step 1 pode ter tocado outras páginas da loja — inclua-as)
git add src/public/loja/*.html
git commit -m "feat(loja): página de favoritos, coração no detalhe e contador no header"
```
