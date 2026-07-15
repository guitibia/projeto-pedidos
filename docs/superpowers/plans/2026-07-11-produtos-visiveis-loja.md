# Produtos visíveis na loja — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A loja mostra só os produtos marcados como visíveis; produto criado pela NF nasce oculto, cadastro manual nasce visível, e há um interruptor no Editar Produto + revisão assistida (selo/filtro/toggle rápido/ocultar-nunca-vendidos) na tela de produtos.

**Architecture:** Coluna `products.visivel_loja` (default 1). NF insere 0. `storeController` filtra `visivel_loja=1` em toda leitura voltada ao cliente. `productController` salva/retorna o campo e ganha 2 endpoints (toggle rápido + ocultar-nunca-vendidos). UI em `produtos.html` (a tela ativa; `list-products.html` só redireciona pra ela).

**Tech Stack:** Node/Express (CommonJS), MySQL (mysql2/promise), testes `node:test`, front vanilla JS + Bootstrap/SweetAlert (`Auth.apiFetch`, `esc`).

## Global Constraints

- Branch `Teste` apenas; banco `db_pedidos_teste`. NUNCA commitar/mergear em `main` sem pedido explícito.
- Migração idempotente: `ALTER TABLE ... ADD COLUMN` em `try/catch` no bloco de migrações de `connection.js`. Default `1` → nada some do site na migração.
- Coluna/nome exatos: `visivel_loja TINYINT(1) NOT NULL DEFAULT 1`.
- Loja mostra só `visivel_loja = 1`; produto oculto no detalhe direto → 404.
- NF cria produto oculto (`visivel_loja=0`); cadastro manual usa o DEFAULT (visível).
- Queries parametrizadas; dado no DOM via `esc()`.
- Testes: `node --test test/<arq>.test.js`. O `node --test` NÃO encerra sozinho (pool MySQL): rode com timeout/kill (`node --test test/X.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`), valide por 0 `not ok`, mate o node ao final (libere a porta 3000). Seeds `zz_test_` + cleanup.

---

## File Structure

- `src/database/connection.js` — **MODIFICAR**: migração da coluna.
- `src/controllers/nfController.js` — **MODIFICAR**: INSERT do produto criado pela NF inclui `visivel_loja=0`.
- `src/controllers/productController.js` — **MODIFICAR**: `updateProduct` salva; `getProductById` retorna; + `toggleVisivel` e `ocultarNuncaVendidos`.
- `src/routes/products.js` — **MODIFICAR**: rotas novas.
- `src/controllers/storeController.js` — **MODIFICAR**: filtros `visivel_loja=1`.
- `src/controllers/storeFavoritesController.js` — **MODIFICAR**: favoritos filtram visíveis.
- `src/public/produtos.html` — **MODIFICAR**: interruptor no modal + selo/filtro/toggle rápido/botão em massa.
- Testes: `test/produto-visivel.test.js`, `test/loja-visivel.test.js`.

---

## ONDA 1 — Backend

### Task 1: Migração + NF nasce oculto + productController (salvar/retornar)

**Files:**
- Modify: `src/database/connection.js` (após a migração `pix_discount_percent`)
- Modify: `src/controllers/nfController.js` (INSERT ~linha 72)
- Modify: `src/controllers/productController.js` (`getProductById` ~106, `updateProduct` ~140-162)
- Test: `test/produto-visivel.test.js`

**Interfaces:**
- Produces: coluna `products.visivel_loja`; `getProductById` retorna `visivel_loja`; `updateProduct` aceita `visivel_loja` (0/1) no corpo e salva com `COALESCE(?, visivel_loja)` (não sobrescreve se ausente); produto criado pela NF nasce `visivel_loja=0`. `listAllProducts` já retorna o campo (usa `SELECT *`).

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `test/produto-visivel.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { getProductById, updateProduct, listAllProducts } = require('../src/controllers/productController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedProduct(vis){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque, visivel_loja) VALUES (?,?,?,?,?,0,?)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()+Math.floor(Math.random()*1e6), vis]); return r.insertId; }
async function cleanup(){ await db.query("DELETE FROM products WHERE name = 'zz_test_prod'"); }

test('produto sem a coluna no INSERT nasce visível (default 1)', async () => {
  const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,0)', ['zz_test_prod', 5, 40, 'Outros', 'ZZDEF'+Date.now()]);
  const [[row]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [r.insertId]);
  assert.strictEqual(Number(row.visivel_loja), 1);
  await cleanup();
});

test('getProductById retorna visivel_loja', async () => {
  const id = await seedProduct(0);
  const res = mockRes();
  await getProductById({ params: { id } }, res);
  assert.strictEqual(Number(res.body.visivel_loja), 0);
  await cleanup();
});

test('updateProduct salva visivel_loja (liga e desliga)', async () => {
  const id = await seedProduct(1);
  let res = mockRes();
  await updateProduct({ params: { id }, body: { name:'zz_test_prod', sale_value:40, franchise:'Outros', code:'X', visivel_loja: 0 } }, res);
  assert.strictEqual(res.statusCode, 200);
  let [[row]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [id]);
  assert.strictEqual(Number(row.visivel_loja), 0);
  res = mockRes();
  await updateProduct({ params: { id }, body: { name:'zz_test_prod', sale_value:40, franchise:'Outros', code:'X', visivel_loja: 1 } }, res);
  [[row]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [id]);
  assert.strictEqual(Number(row.visivel_loja), 1);
  await cleanup();
});

test('updateProduct sem visivel_loja no corpo NÃO altera o valor atual', async () => {
  const id = await seedProduct(0);
  const res = mockRes();
  await updateProduct({ params: { id }, body: { name:'zz_test_prod', sale_value:40, franchise:'Outros', code:'X' } }, res);
  const [[row]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [id]);
  assert.strictEqual(Number(row.visivel_loja), 0, 'continua oculto');
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/produto-visivel.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL (coluna `visivel_loja` não existe ainda / getProductById não retorna).

- [ ] **Step 3: Migração**

Em `src/database/connection.js`, logo após o bloco `// Migração: desconto no PIX por cliente` (o `ALTER TABLE clients ADD COLUMN pix_discount_percent ...`), inserir:

```js
    // Migração: visibilidade do produto na loja (produto da NF nasce oculto; padrão visível)
    for (const sql of [
      'ALTER TABLE products ADD COLUMN visivel_loja TINYINT(1) NOT NULL DEFAULT 1',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 4: NF nasce oculto**

Em `src/controllers/nfController.js`, o INSERT do produto criado pela NF (procure `INSERT INTO products (name, cost, sale_value, franchise, code, ean, estoque)`), trocar por:

```js
          const [pr] = await conn.query(
            'INSERT INTO products (name, cost, sale_value, franchise, code, ean, estoque, visivel_loja) VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
            [titleCasePtBr(String(d.novo.name || it.nomeSugerido || it.descricao)).slice(0, 200),
             it.valorUnit,
             Number(d.novo.sale_value) || it.valorUnit,
             String(d.novo.franchise || 'Outros').slice(0, 60),
             String(d.novo.code || it.cprod).slice(0, 60),
             it.ean || null]
          );
```

(Só foi adicionado `, visivel_loja` na lista de colunas e `, 0` nos valores — os parâmetros `?` continuam iguais; `estoque` e `visivel_loja` são literais `0, 0`.)

- [ ] **Step 5: productController — retornar e salvar**

Em `src/controllers/productController.js`:

(a) `getProductById` — no objeto retornado (o `return res.json({ ... })`), adicionar `visivel_loja`:

```js
    return res.json({ id: p.id, name: p.name, cost: p.cost, sale_value: p.sale_value, franchise: p.franchise, code: p.code, promotion_price: p.promotion_price ?? null, description: p.description ?? null, image: p.image ?? null, ean: p.ean ?? null, visivel_loja: p.visivel_loja });
```

(b) `updateProduct` — incluir `visivel_loja` no destructuring do corpo e no UPDATE (via COALESCE, pra não sobrescrever quando ausente):

```js
  const { name, sale_value, franchise, code, promotion_price, description, ean, visivel_loja } = req.body;
```

Antes do UPDATE, calcular:

```js
    const vis = visivel_loja === undefined ? null : (visivel_loja ? 1 : 0);
```

E trocar o UPDATE por:

```js
    const [result] = await conn.query(
      'UPDATE products SET name=?, cost=?, sale_value=?, franchise=?, code=?, promotion_price=?, description=?, ean=?, visivel_loja=COALESCE(?, visivel_loja) WHERE id=?',
      [name, cost, sv, franchise, code, promoVal, description ?? null, (ean && String(ean).trim()) ? String(ean).trim().slice(0,14) : null, vis, id]
    );
```

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test test/produto-visivel.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (4/4). Mate qualquer node preso depois.

- [ ] **Step 7: Commit**

```bash
git add src/database/connection.js src/controllers/nfController.js src/controllers/productController.js test/produto-visivel.test.js
git commit -m "feat(loja): coluna visivel_loja (NF nasce oculto) + productController salva/retorna"
```

---

### Task 2: Loja mostra só visíveis (storeController + favoritos)

**Files:**
- Modify: `src/controllers/storeController.js` (`listProdutos`, `getProduto`, `relacionados`, `listFranquias`)
- Modify: `src/controllers/storeFavoritesController.js` (listagem de favoritos)
- Test: `test/loja-visivel.test.js`

**Interfaces:**
- Consumes: coluna `visivel_loja` (Task 1).
- Produces: nenhuma leitura da loja retorna produto oculto; `getProduto` de produto oculto → 404.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `test/loja-visivel.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { listProdutos, getProduto } = require('../src/controllers/storeController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedProduct(vis, code){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque, visivel_loja) VALUES (?,?,?,?,?,5,?)', ['zz_test_prod', 5, 40, 'ZZFranq', code, vis]); return r.insertId; }
async function cleanup(){ await db.query("DELETE FROM products WHERE name = 'zz_test_prod'"); }

test('listProdutos não retorna produto oculto', async () => {
  const visId = await seedProduct(1, 'ZZV'+Date.now());
  const hidId = await seedProduct(0, 'ZZH'+Date.now());
  const res = mockRes();
  await listProdutos({ query: { franchise: 'ZZFranq' } }, res);
  const ids = res.body.map(p => p.id);
  assert.ok(ids.includes(visId), 'visível aparece');
  assert.ok(!ids.includes(hidId), 'oculto não aparece');
  await cleanup();
});

test('getProduto de produto oculto → 404', async () => {
  const hidId = await seedProduct(0, 'ZZH2'+Date.now());
  const res = mockRes();
  await getProduto({ params: { id: String(hidId) } }, res);
  assert.strictEqual(res.statusCode, 404);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/loja-visivel.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL (oculto aparece na lista; getProduto devolve 200).

- [ ] **Step 3: Filtros no storeController**

Em `src/controllers/storeController.js`:

(a) `listProdutos` — adicionar o filtro sempre. Logo após `const where = [], params = [];`, inserir:

```js
  where.push('p.visivel_loja = 1');
```

(b) `getProduto` — o SELECT do produto vira:

```js
    const [[p]] = await db.query(
      'SELECT id, name, franchise, code, sale_value, promotion_price, image, description, estoque FROM products WHERE id = ? AND visivel_loja = 1', [id]);
```

(c) `getProduto` — o SELECT de `relacionados` vira:

```js
      `SELECT id, name, franchise, sale_value, promotion_price, image, estoque
       FROM products WHERE franchise = ? AND id <> ? AND visivel_loja = 1 ORDER BY RAND() LIMIT 4`, [p.franchise, id]);
```

(d) `listFranquias` vira:

```js
    const [rows] = await db.query('SELECT DISTINCT franchise FROM products WHERE visivel_loja = 1 ORDER BY franchise');
```

- [ ] **Step 4: Filtro nos favoritos**

Em `src/controllers/storeFavoritesController.js`, na listagem de favoritos (o `SELECT ... FROM favorites f JOIN products p ON p.id = f.product_id WHERE ...`), adicionar `AND p.visivel_loja = 1` à cláusula WHERE existente (que já filtra por `f.client_id`). Leia o arquivo e ache a query; o resultado deve ficar tipo:

```sql
... FROM favorites f JOIN products p ON p.id = f.product_id WHERE f.client_id = ? AND p.visivel_loja = 1 ...
```

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/loja-visivel.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (2/2). Mate o node depois.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/storeController.js src/controllers/storeFavoritesController.js test/loja-visivel.test.js
git commit -m "feat(loja): loja lista/abre só produtos visiveis (catálogo, detalhe 404, relacionados, franquias, favoritos)"
```

---

### Task 3: Endpoints de toggle rápido e ocultar-nunca-vendidos

**Files:**
- Modify: `src/controllers/productController.js` (`toggleVisivel`, `ocultarNuncaVendidos`, export)
- Modify: `src/routes/products.js`
- Test: `test/produto-visivel.test.js` (adicionar)

**Interfaces:**
- Produces:
  - `toggleVisivel` → `PUT /api/products/:id/visivel` body `{ visivel: true|false }`: seta `visivel_loja`; 404 se não existe; 400 id inválido; retorna `{ ok:true, visivel }`.
  - `ocultarNuncaVendidos` → `POST /api/products/ocultar-nunca-vendidos`: oculta produtos visíveis sem nenhuma linha em `order_products`; retorna `{ ocultados: <n> }`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Adicionar ao final de `test/produto-visivel.test.js`:

```js
const { toggleVisivel, ocultarNuncaVendidos } = require('../src/controllers/productController');

test('toggleVisivel liga/desliga e 404 para inexistente', async () => {
  const id = await seedProduct(1);
  let res = mockRes();
  await toggleVisivel({ params: { id }, body: { visivel: false } }, res);
  assert.strictEqual(res.statusCode, 200);
  let [[row]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [id]);
  assert.strictEqual(Number(row.visivel_loja), 0);
  res = mockRes();
  await toggleVisivel({ params: { id: 999999999 }, body: { visivel: true } }, res);
  assert.strictEqual(res.statusCode, 404);
  await cleanup();
});

test('ocultarNuncaVendidos oculta sem venda e mantém com venda', async () => {
  const semVenda = await seedProduct(1);
  const comVenda = await seedProduct(1);
  // cria um pedido + item para "comVenda"
  const [cli] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()]);
  const [ord] = await db.query('INSERT INTO orders (client_id, payment_method, total_cost) VALUES (?,?,?)', [cli.insertId, 'PIX', 40]);
  await db.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity) VALUES (?,?,?,?)', [ord.insertId, comVenda, 40, 1]);

  const res = mockRes();
  await ocultarNuncaVendidos({}, res);
  assert.strictEqual(res.statusCode, 200);
  const [[a]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [semVenda]);
  const [[b]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [comVenda]);
  assert.strictEqual(Number(a.visivel_loja), 0, 'sem venda foi ocultado');
  assert.strictEqual(Number(b.visivel_loja), 1, 'com venda continua visível');

  // limpeza
  await db.query('DELETE FROM order_products WHERE order_id = ?', [ord.insertId]);
  await db.query('DELETE FROM orders WHERE id = ?', [ord.insertId]);
  await db.query('DELETE FROM clients WHERE id = ?', [cli.insertId]);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/produto-visivel.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL (`toggleVisivel is not a function`).

- [ ] **Step 3: Implementar os endpoints**

Em `src/controllers/productController.js`, antes do `module.exports`, adicionar:

```js
// PUT /api/products/:id/visivel  — liga/desliga a visibilidade na loja (toggle rápido)
async function toggleVisivel(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const visivel = req.body.visivel ? 1 : 0;
  try {
    const [r] = await db.query('UPDATE products SET visivel_loja = ? WHERE id = ?', [visivel, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json({ ok: true, visivel });
  } catch (e) { console.error('toggleVisivel', e); return res.status(500).json({ error: 'Erro ao atualizar visibilidade.' }); }
}

// POST /api/products/ocultar-nunca-vendidos  — oculta produtos visíveis que nunca tiveram venda
async function ocultarNuncaVendidos(req, res) {
  try {
    const [r] = await db.query(
      `UPDATE products p SET p.visivel_loja = 0
       WHERE p.visivel_loja = 1
         AND NOT EXISTS (SELECT 1 FROM order_products op WHERE op.product_id = p.id)`);
    return res.json({ ocultados: r.affectedRows });
  } catch (e) { console.error('ocultarNuncaVendidos', e); return res.status(500).json({ error: 'Erro ao ocultar.' }); }
}
```

Acrescentar `toggleVisivel, ocultarNuncaVendidos` ao `module.exports`.

Em `src/routes/products.js`: importar as duas funções e adicionar as rotas (a fixa antes de `/:id`):

```js
router.post('/ocultar-nunca-vendidos', ocultarNuncaVendidos);
router.put('/:id/visivel', toggleVisivel);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/produto-visivel.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (6/6). Mate o node depois.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/productController.js src/routes/products.js test/produto-visivel.test.js
git commit -m "feat(loja): endpoints toggle de visibilidade + ocultar produtos nunca vendidos"
```

---

## ONDA 2 — UI (`produtos.html`)

### Task 4: Interruptor "Mostrar na loja" no Editar Produto

**Files:**
- Modify: `src/public/produtos.html`
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/products/:id` (retorna `visivel_loja`), `PUT /api/products/:id` (aceita `visivel_loja`).

- [ ] **Step 1: Adicionar o interruptor no modal**

Em `src/public/produtos.html`, no modal "Editar Produto" (onde ficam nome/código/EAN/valor/custo/promocional/franquia/descrição/foto), adicionar um switch, por exemplo perto da Franquia/Descrição:

```html
<div class="form-check form-switch mt-2">
  <input class="form-check-input" type="checkbox" id="edit-visivel-loja" checked>
  <label class="form-check-label" for="edit-visivel-loja">Mostrar na loja</label>
</div>
```

- [ ] **Step 2: Ligar o interruptor ao carregar e ao salvar**

No JS da página:
- Onde o modal é preenchido a partir de `GET /api/products/:id` (ou do produto já carregado), setar: `document.getElementById('edit-visivel-loja').checked = Number(produto.visivel_loja) === 1;` (produto novo/sem valor → tratar como visível/`true`).
- Onde o formulário monta o corpo do `PUT /api/products/:id`, incluir no JSON: `visivel_loja: document.getElementById('edit-visivel-loja').checked ? 1 : 0`.

- [ ] **Step 3: Smoke manual**

Run: `npm run dev`. Abrir Produtos, editar um produto, desmarcar "Mostrar na loja", salvar; reabrir → deve vir desmarcado; conferir na loja (`/loja`) que ele sumiu; remarcar → volta. Depois **matar o node** (liberar :3000).

- [ ] **Step 4: Commit**

```bash
git add src/public/produtos.html
git commit -m "feat(loja): interruptor 'Mostrar na loja' no Editar Produto"
```

---

### Task 5: Revisão assistida na lista (selo + filtro + toggle rápido + ocultar-nunca-vendidos)

**Files:**
- Modify: `src/public/produtos.html`
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/products/all` (retorna `visivel_loja`), `PUT /api/products/:id/visivel`, `POST /api/products/ocultar-nunca-vendidos`.

- [ ] **Step 1: Selo por produto**

Na renderização de cada produto da lista (onde as linhas/cards são montados a partir de `/api/products/all`), adicionar um selo conforme `visivel_loja`:

```js
const seloLoja = Number(p.visivel_loja) === 1
  ? '<span class="badge bg-success">Na loja</span>'
  : '<span class="badge bg-secondary">Oculto</span>';
```

Inserir `seloLoja` numa coluna/canto do card (usando `esc()` no restante dos dados do produto como já é feito).

- [ ] **Step 2: Interruptor rápido por produto**

Ao lado do selo, um switch que chama o toggle sem abrir o modal:

```js
const toggleLoja = `<div class="form-check form-switch d-inline-block ms-2" title="Mostrar na loja">
  <input class="form-check-input" type="checkbox" ${Number(p.visivel_loja)===1?'checked':''} onchange="toggleVisivelLoja(${p.id}, this.checked)">
</div>`;
```

E a função (no escopo do script):

```js
async function toggleVisivelLoja(id, visivel) {
  const r = await Auth.apiFetch('/api/products/' + id + '/visivel', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ visivel: !!visivel })
  });
  if (!r.ok) { Swal.fire('Erro', (await r.json()).error || '', 'error'); }
  else { carregarProdutos(); } // recarrega a lista (use o nome real da função que lista os produtos)
}
```

- [ ] **Step 3: Filtro Todos / Na loja / Ocultos**

Adicionar três botões/pills acima da lista e filtrar a lista já carregada por `visivel_loja` antes de renderizar:

```html
<div class="btn-group btn-group-sm mb-2" role="group">
  <button class="btn btn-outline-primary active" data-vis="todos" onclick="setFiltroVis(this)">Todos</button>
  <button class="btn btn-outline-primary" data-vis="loja" onclick="setFiltroVis(this)">Na loja</button>
  <button class="btn btn-outline-primary" data-vis="ocultos" onclick="setFiltroVis(this)">Ocultos</button>
</div>
```

```js
let filtroVis = 'todos';
function setFiltroVis(btn){
  filtroVis = btn.dataset.vis;
  document.querySelectorAll('[data-vis]').forEach(b => b.classList.toggle('active', b === btn));
  carregarProdutos(); // ou re-renderiza a partir da lista já em memória
}
// na hora de renderizar, aplicar:
//   let lista = todosProdutos;
//   if (filtroVis === 'loja')    lista = lista.filter(p => Number(p.visivel_loja) === 1);
//   if (filtroVis === 'ocultos') lista = lista.filter(p => Number(p.visivel_loja) === 0);
```

- [ ] **Step 4: Botão "Ocultar os que nunca foram vendidos"**

Adicionar o botão perto do filtro:

```html
<button class="btn btn-sm btn-outline-secondary mb-2" onclick="ocultarNuncaVendidos()">Ocultar os que nunca foram vendidos</button>
```

```js
async function ocultarNuncaVendidos(){
  const ok = await Swal.fire({
    title: 'Ocultar nunca vendidos?',
    text: 'Vai ocultar da loja todos os produtos que ainda não tiveram nenhuma venda. Você pode reativar depois pelo filtro "Ocultos".',
    icon: 'warning', showCancelButton: true, confirmButtonText: 'Ocultar', cancelButtonText: 'Cancelar'
  });
  if (!ok.isConfirmed) return;
  const r = await Auth.apiFetch('/api/products/ocultar-nunca-vendidos', { method: 'POST' });
  const d = await r.json();
  if (!r.ok) return Swal.fire('Erro', d.error || '', 'error');
  await Swal.fire('Pronto', d.ocultados + ' produto(s) ocultado(s).', 'success');
  carregarProdutos();
}
```

- [ ] **Step 5: Smoke manual**

Run: `npm run dev`. Em Produtos: ver os selos; alternar o interruptor rápido de um produto e conferir na loja; filtrar Todos/Na loja/Ocultos; clicar "Ocultar os que nunca foram vendidos", confirmar, ver a contagem e a lista atualizar (produtos com venda continuam "Na loja"). Depois **matar o node**.

- [ ] **Step 6: Commit**

```bash
git add src/public/produtos.html
git commit -m "feat(loja): revisão assistida de produtos (selo, filtro, toggle rápido, ocultar nunca vendidos)"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** migração (T1), NF nasce oculto (T1), filtros da loja incl. favoritos e detalhe 404 (T2), update/get retornam o campo (T1), toggle + ocultar-nunca-vendidos (T3), interruptor no modal (T4), selo/filtro/toggle rápido/botão em massa (T5). Fora de escopo (checkout de oculto no carrinho) permanece fora. ✔
- **Consistência de nomes:** coluna `visivel_loja` (default 1) idêntica em migração, NF, productController, storeController, favoritos, testes e UI. Endpoints `PUT /:id/visivel` e `POST /ocultar-nunca-vendidos` idênticos entre controller, rotas e UI. ✔
- **Sem placeholders de lógica:** todo passo traz código real; os snippets de UI apontam onde integrar e usam `carregarProdutos()`/nome real da função de listagem (a confirmar no arquivo — é a única indireção, resolvida lendo `produtos.html`).
- **Riscos:** default 1 (nada some na migração); `getProduto` 404 pra oculto; `ocultarNuncaVendidos` usa `NOT EXISTS` (null-safe) e só mexe em `visivel_loja=1` (idempotente, reversível pelo filtro); NF nasce oculto sem afetar o cadastro manual (que usa o default). Tudo na `Teste`.

## Ordem de execução

Onda 1 (T1→T3) entrega o comportamento completo no backend (loja já esconde ocultos, NF nasce oculto, endpoints prontos). Onda 2 (T4→T5) adiciona os controles na tela de produtos. Cada task termina testável e commitada.
