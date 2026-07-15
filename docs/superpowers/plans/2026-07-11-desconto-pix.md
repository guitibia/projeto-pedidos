# Desconto no PIX — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar desconto a quem paga por PIX — um % global com exceção por cliente (cliente vence o global) — na loja e no painel, incidindo só nos produtos, por item, com o valor com desconto visível pra cliente.

**Architecture:** Helpers puros em `utils/pricing.js` (`getDescontoPix`, `resolvePixPercent`, `aplicaPix`). Global em `store_settings`; por cliente numa coluna nova `clients.pix_discount_percent`. Aplicação no `criarPix` (loja) e `orderController.createOrder` (painel). Config no `descontos.html` (global) e no modal de resumo do cliente em `clientes.html` (por cliente, via endpoint focado). Exibição no `checkout.html` (loja) e `pedidos.html` (painel).

**Tech Stack:** Node/Express (CommonJS), MySQL (mysql2/promise), testes `node:test` + `node:assert`, front vanilla JS + Bootstrap/SweetAlert (`Auth.apiFetch`, `esc`). Mercado Pago (PIX na loja).

## Global Constraints

- Branch `Teste` apenas; banco `db_pedidos_teste`. NUNCA commitar/mergear em `main` sem pedido explícito.
- Migração idempotente: `ALTER TABLE ... ADD COLUMN` dentro de `try/catch` no bloco de migrações de `connection.js`.
- Desconto do PIX incide **só nos produtos** (nunca no frete), **por item** (pra `order_products.sale_price` refletir e o lucro do dashboard ficar exato), e **empilha** sobre promoção/global/franquia.
- Regra: `%` do cliente vence o global; cliente vazio (`NULL`) herda o global; cliente `0` = sem desconto pra ele (sobrepõe global).
- Só PIX ganha desconto — cartão (`criarPreferencia`) e demais pagamentos ficam idênticos.
- `%` válido: 0–99,99; fora disso → 400. Sem novas dependências npm.
- Testes: `node --test test/<arq>.test.js`. O `node --test` NÃO encerra sozinho (pool MySQL aberto): rode com timeout/kill (`node --test test/X.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`), valide por 0 `not ok`, e mate o node ao final (libere a porta 3000). Seeds com prefixo `zz_test_` e cleanup.

---

## File Structure

- `src/utils/pricing.js` — **MODIFICAR**: `getDescontoPix()`, `resolvePixPercent()`, `aplicaPix()`.
- `src/database/connection.js` — **MODIFICAR**: migração da coluna `pix_discount_percent`.
- `src/controllers/descontosController.js` — **MODIFICAR**: get/put incluem o PIX global.
- `src/controllers/clientController.js` — **MODIFICAR**: `clientSummary` retorna `pix_discount_percent`; nova `setPixDiscount`.
- `src/routes/clients.js` — **MODIFICAR**: rota `PUT /:id/pix-discount`.
- `src/controllers/storeOrderController.js` — **MODIFICAR**: `getClient` inclui o campo; `resumo` devolve `pixPercent`/`pixTotal`.
- `src/controllers/paymentController.js` — **MODIFICAR**: `criarPix` aplica o desconto.
- `src/controllers/orderController.js` — **MODIFICAR**: `createOrder` aplica o desconto quando PIX.
- `src/public/descontos.html` — **MODIFICAR**: seção "Desconto no PIX".
- `src/public/clientes.html` — **MODIFICAR**: campo "Desconto PIX (%)" no modal do cliente.
- `src/public/loja/checkout.html` — **MODIFICAR**: exibe preço/economia do PIX.
- `src/public/pedidos.html` — **MODIFICAR**: preview do total com desconto ao marcar PIX.
- Testes: `test/pricing-pix.test.js`, `test/descontos-pix.test.js`, `test/client-pix.test.js`, `test/pix-loja.test.js`, `test/pix-painel.test.js`.

---

## ONDA 1 — Núcleo (backend)

### Task 1: Migração da coluna + helpers puros de PIX

**Files:**
- Modify: `src/database/connection.js` (após o bloco de migração de "pedidos das clientes")
- Modify: `src/utils/pricing.js`
- Test: `test/pricing-pix.test.js`

**Interfaces:**
- Produces:
  - `getDescontoPix()` → `Promise<{ ativo:boolean, percent:number }>` (lê `store_settings`).
  - `resolvePixPercent(clientePixPercent, globalPix)` → `number` (cliente vence; `null`/''/`undefined` herda global; global inativo → 0).
  - `aplicaPix(valor, percent)` → `number` (arredonda 2 casas; percent ≤ 0 → valor inalterado).
  - Coluna `clients.pix_discount_percent DECIMAL(5,2) NULL`.

- [ ] **Step 1: Escrever os testes puros (falham primeiro)**

Criar `test/pricing-pix.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { resolvePixPercent, aplicaPix } = require('../src/utils/pricing');

test('resolvePixPercent: cliente definido vence o global', () => {
  assert.strictEqual(resolvePixPercent(10, { ativo: true, percent: 5 }), 10);
});
test('resolvePixPercent: cliente 0 sobrepõe global ativo (sem desconto)', () => {
  assert.strictEqual(resolvePixPercent(0, { ativo: true, percent: 5 }), 0);
});
test('resolvePixPercent: cliente vazio herda o global', () => {
  assert.strictEqual(resolvePixPercent(null, { ativo: true, percent: 5 }), 5);
  assert.strictEqual(resolvePixPercent('', { ativo: true, percent: 5 }), 5);
  assert.strictEqual(resolvePixPercent(undefined, { ativo: true, percent: 5 }), 5);
});
test('resolvePixPercent: global inativo → 0', () => {
  assert.strictEqual(resolvePixPercent(null, { ativo: false, percent: 5 }), 0);
  assert.strictEqual(resolvePixPercent(null, { ativo: true, percent: 0 }), 0);
});
test('aplicaPix: aplica percentual e arredonda', () => {
  assert.strictEqual(aplicaPix(200, 5), 190);
  assert.strictEqual(aplicaPix(99.99, 10), 89.99);
});
test('aplicaPix: percent 0 mantém valor', () => {
  assert.strictEqual(aplicaPix(200, 0), 200);
  assert.strictEqual(aplicaPix(200, -3), 200);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/pricing-pix.test.js`
Expected: FAIL (`resolvePixPercent is not a function`).

- [ ] **Step 3: Implementar os helpers em `src/utils/pricing.js`**

No `src/utils/pricing.js`, adicionar antes do `module.exports`:

```js
async function getDescontoPix() {
  try {
    const [rows] = await db.query(
      "SELECT skey, svalue FROM store_settings WHERE skey IN ('desconto_pix_ativo','desconto_pix_percent')"
    );
    const m = {};
    rows.forEach(function (r) { m[r.skey] = r.svalue; });
    return { ativo: m.desconto_pix_ativo === '1', percent: Number(m.desconto_pix_percent) || 0 };
  } catch (_) { return { ativo: false, percent: 0 }; }
}

// % do PIX: cliente definido vence o global (0 do cliente sobrepõe); vazio herda o global.
function resolvePixPercent(clientePixPercent, globalPix) {
  if (clientePixPercent !== null && clientePixPercent !== undefined && clientePixPercent !== '') {
    const p = Number(clientePixPercent);
    return isNaN(p) ? 0 : p;
  }
  if (globalPix && globalPix.ativo && globalPix.percent > 0) return globalPix.percent;
  return 0;
}

function aplicaPix(valor, percent) {
  const p = Number(percent) || 0;
  if (p <= 0) return round2(Number(valor) || 0);
  return round2((Number(valor) || 0) * (1 - p / 100));
}
```

E trocar a linha do export para:

```js
module.exports = { getDescontoGlobal, precoEfetivo, round2, getDescontoPix, resolvePixPercent, aplicaPix };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/pricing-pix.test.js`
Expected: PASS (6/6).

- [ ] **Step 5: Adicionar a migração da coluna**

Em `src/database/connection.js`, logo após o bloco `// Migração: pedidos das clientes + conciliação com a NF` (o `for (const sql of [...])` das 3 tabelas `demanda_*`), inserir:

```js
    // Migração: desconto no PIX por cliente
    for (const sql of [
      'ALTER TABLE clients ADD COLUMN pix_discount_percent DECIMAL(5,2) NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 6: Commit**

```bash
git add src/utils/pricing.js src/database/connection.js test/pricing-pix.test.js
git commit -m "feat(pix): helpers de desconto PIX (puros) + coluna clients.pix_discount_percent"
```

---

### Task 2: Desconto PIX global (descontosController)

**Files:**
- Modify: `src/controllers/descontosController.js`
- Test: `test/descontos-pix.test.js`

**Interfaces:**
- Consumes: `getDescontoPix` (Task 1).
- Produces: `GET /api/descontos` passa a devolver também `{ pixAtivo, pixPercent }`; `PUT /api/descontos` aceita `pixAtivo` (bool) e `pixPercent` (0–99,99) e persiste em `store_settings` (`desconto_pix_ativo`, `desconto_pix_percent`).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/descontos-pix.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { get, put } = require('../src/controllers/descontosController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

test('put salva pix e get devolve pixAtivo/pixPercent', async () => {
  let res = mockRes();
  await put({ body: { ativo: false, percent: 0, pixAtivo: true, pixPercent: 7.5 } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mockRes();
  await get({}, res);
  assert.strictEqual(res.body.pixAtivo, true);
  assert.strictEqual(Number(res.body.pixPercent), 7.5);
});

test('put rejeita pixPercent fora de 0..99,99', async () => {
  const res = mockRes();
  await put({ body: { ativo: false, percent: 0, pixAtivo: true, pixPercent: 150 } }, res);
  assert.strictEqual(res.statusCode, 400);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/descontos-pix.test.js`
Expected: FAIL (get não devolve `pixAtivo`; put não valida `pixPercent`).

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `src/controllers/descontosController.js` por:

```js
const db = require('../database/connection');
const { getDescontoGlobal, getDescontoPix } = require('../utils/pricing');

async function get(req, res) {
  const g = await getDescontoGlobal();
  const p = await getDescontoPix();
  return res.json({ ativo: g.ativo, percent: g.percent, pixAtivo: p.ativo, pixPercent: p.percent });
}

async function put(req, res) {
  const ativo = req.body.ativo ? '1' : '0';
  const percent = Number(req.body.percent);
  if (isNaN(percent) || percent < 0 || percent >= 100) {
    return res.status(400).json({ error: 'Percentual deve ser entre 0 e 99,99.' });
  }
  const pixAtivo = req.body.pixAtivo ? '1' : '0';
  const pixPercent = Number(req.body.pixPercent);
  if (isNaN(pixPercent) || pixPercent < 0 || pixPercent >= 100) {
    return res.status(400).json({ error: 'Percentual do PIX deve ser entre 0 e 99,99.' });
  }
  try {
    const sets = [
      ['desconto_global_ativo', ativo],
      ['desconto_global_percent', String(percent)],
      ['desconto_pix_ativo', pixAtivo],
      ['desconto_pix_percent', String(pixPercent)],
    ];
    for (const [k, v] of sets) {
      await db.query('INSERT INTO store_settings (skey,svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', [k, v]);
    }
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar desconto:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { get, put };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/descontos-pix.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/descontosController.js test/descontos-pix.test.js
git commit -m "feat(pix): desconto PIX global no descontosController (get/put)"
```

---

### Task 3: Desconto PIX por cliente (endpoint + resumo)

**Files:**
- Modify: `src/controllers/clientController.js` (`clientSummary` SELECT + nova `setPixDiscount`)
- Modify: `src/routes/clients.js`
- Test: `test/client-pix.test.js`

**Interfaces:**
- Produces:
  - `clientSummary` inclui `pix_discount_percent` no objeto `client`.
  - `setPixDiscount(req,res)` → `PUT /api/clients/:id/pix-discount` body `{ percent }` (número 0–99,99, ou `null`/''` para limpar → `NULL`); 400 fora de faixa; 404 se cliente não existe.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/client-pix.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { setPixDiscount, clientSummary } = require('../src/controllers/clientController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function cleanup(){ await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'"); }

test('setPixDiscount grava e clientSummary retorna o valor', async () => {
  const id = await seedClient();
  let res = mockRes();
  await setPixDiscount({ params: { id }, body: { percent: 8 } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mockRes();
  await clientSummary({ params: { id } }, res);
  assert.strictEqual(Number(res.body.client.pix_discount_percent), 8);
  await cleanup();
});

test('setPixDiscount vazio limpa para NULL', async () => {
  const id = await seedClient();
  await db.query('UPDATE clients SET pix_discount_percent = 8 WHERE id = ?', [id]);
  const res = mockRes();
  await setPixDiscount({ params: { id }, body: { percent: '' } }, res);
  assert.strictEqual(res.statusCode, 200);
  const [[row]] = await db.query('SELECT pix_discount_percent FROM clients WHERE id = ?', [id]);
  assert.strictEqual(row.pix_discount_percent, null);
  await cleanup();
});

test('setPixDiscount rejeita fora de faixa (400) e cliente inexistente (404)', async () => {
  let res = mockRes();
  await setPixDiscount({ params: { id: 999999999 }, body: { percent: 5 } }, res);
  assert.strictEqual(res.statusCode, 404);
  const id = await seedClient();
  res = mockRes();
  await setPixDiscount({ params: { id }, body: { percent: 150 } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/client-pix.test.js`
Expected: FAIL (`setPixDiscount is not a function`).

- [ ] **Step 3: Implementar**

Em `src/controllers/clientController.js`:

(a) No `clientSummary`, incluir a coluna no SELECT do cliente (linha ~104), trocando por:

```js
    const [[client]] = await db.query(
      'SELECT id, name, email, email_verified, cpf, phone, birthdate, cep, address, house_number, neighborhood, city, pix_discount_percent, created_at FROM clients WHERE id = ?',
      [id]);
```

(b) Adicionar a função antes do `module.exports`:

```js
// PUT /api/clients/:id/pix-discount  — define o % de desconto no PIX do cliente (vazio = usa o global)
async function setPixDiscount(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const raw = req.body.percent;
  let percent = null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    percent = Number(raw);
    if (isNaN(percent) || percent < 0 || percent >= 100) {
      return res.status(400).json({ error: 'Percentual deve ser entre 0 e 99,99.' });
    }
  }
  try {
    const [r] = await db.query('UPDATE clients SET pix_discount_percent = ? WHERE id = ?', [percent, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar desconto PIX do cliente:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}
```

(c) Acrescentar `setPixDiscount` ao `module.exports`.

Em `src/routes/clients.js`: importar `setPixDiscount` e adicionar a rota (antes do `module.exports`):

```js
const { createClient, listClients, listClientOrders, deleteClient, clientSummary, setPixDiscount } = require('../controllers/clientController');
// ...
router.put('/:id/pix-discount', setPixDiscount);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/client-pix.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/clientController.js src/routes/clients.js test/client-pix.test.js
git commit -m "feat(pix): desconto PIX por cliente (endpoint + resumo)"
```

---

### Task 4: Aplicar o desconto na loja (criarPix + resumo)

**Files:**
- Modify: `src/controllers/storeOrderController.js` (`getClient` SELECT + `resumo` devolve pix)
- Modify: `src/controllers/paymentController.js` (`criarPix` aplica o desconto)
- Test: `test/pix-loja.test.js`

**Interfaces:**
- Consumes: `getDescontoPix`, `resolvePixPercent`, `aplicaPix` (Task 1).
- Produces: `resumo` devolve `pixPercent` e `pixTotal`; `criarPix` grava `payment_intent` com subtotal/total já com desconto nos produtos e snapshot com `unitPrice` descontado.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/pix-loja.test.js` (testa as funções puras de composição do total; usa `aplicaPix` real):

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { aplicaPix, resolvePixPercent } = require('../src/utils/pricing');

// Reproduz a regra de composição usada no criarPix/resumo: desconto só nos produtos, frete intacto.
function comporTotalPix(linhas, fee, pixPct) {
  const linhasPix = linhas.map(l => {
    const unitPrice = aplicaPix(l.unitPrice, pixPct);
    return { unitPrice, qty: l.qty, lineTotal: Number((unitPrice * l.qty).toFixed(2)) };
  });
  const subtotal = Number(linhasPix.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
  return { linhasPix, subtotal, total: Number((subtotal + fee).toFixed(2)) };
}

test('desconto incide só nos produtos; frete intacto', () => {
  const pct = resolvePixPercent(null, { ativo: true, percent: 5 });
  const r = comporTotalPix([{ unitPrice: 100, qty: 2 }], 15, pct); // subtotal 200 -> 190
  assert.strictEqual(r.subtotal, 190);
  assert.strictEqual(r.total, 205); // 190 + 15 frete
  assert.strictEqual(r.linhasPix[0].unitPrice, 95);
});

test('sem desconto (pct 0) o total é o original', () => {
  const r = comporTotalPix([{ unitPrice: 100, qty: 2 }], 15, 0);
  assert.strictEqual(r.subtotal, 200);
  assert.strictEqual(r.total, 215);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/pix-loja.test.js`
Expected: FAIL até `src/utils/pricing.js` exportar `aplicaPix`/`resolvePixPercent` (já feito na Task 1 → se Task 1 estiver aplicada, este teste passa direto; garanta que a lógica do Step 3 espelha `comporTotalPix`).

- [ ] **Step 3: Implementar na loja**

(a) `src/controllers/storeOrderController.js`, no topo, garantir o import:

```js
const { precoEfetivo, getDescontoGlobal, getDescontoPix, resolvePixPercent, aplicaPix } = require('../utils/pricing');
```

(b) `getClient` (SELECT ~linha 23) — incluir a coluna:

```js
    'SELECT id, name, address, house_number, neighborhood, cep, city, lat, lng, pix_discount_percent FROM clients WHERE id = ?',
```

(c) `resumo` — antes do `return res.json(...)`, calcular o PIX e adicioná-lo à resposta:

```js
    const pixPct = resolvePixPercent(client.pix_discount_percent, await getDescontoPix());
    const pixSubtotal = Number(lines.filter(l => l.ok).reduce((s, l) => s + aplicaPix(l.lineTotal, pixPct), 0).toFixed(2));
    const pixTotal = Number((pixSubtotal + fee).toFixed(2));
```

e incluir no objeto do `res.json`: `pixPercent: pixPct, pixTotal,` (mantendo `subtotal`, `deliveryFee`, `total` como estão).

(d) `src/controllers/paymentController.js`, `criarPix` — no topo do arquivo garantir o import:

```js
const { getDescontoPix, resolvePixPercent, aplicaPix } = require('../utils/pricing');
```

Trocar a linha `SELECT email, cpf FROM clients` (~200) para incluir o campo:

```js
    const [[conta]] = await db.query('SELECT email, cpf, pix_discount_percent FROM clients WHERE id = ?', [req.customer.id]);
```

Depois de `const linhas = await store.buildLines(items);` e da checagem de indisponível, aplicar o desconto ANTES de calcular `subtotal`/`snapshot`:

```js
    const pixPct = resolvePixPercent(conta ? conta.pix_discount_percent : null, await getDescontoPix());
    const linhasPix = linhas.map(l => {
      const unitPrice = aplicaPix(l.unitPrice, pixPct);
      return Object.assign({}, l, { unitPrice, lineTotal: Number((unitPrice * l.qty).toFixed(2)) });
    });
```

Trocar `const subtotal = Number(linhas.reduce(...))` para usar `linhasPix`:

```js
    const subtotal = Number(linhasPix.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
```

E trocar a montagem do snapshot para usar `linhasPix`:

```js
    const snapshot = linhasPix.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
```

(O restante — `total = subtotal + fee`, `payment_intent`, MP, webhook — permanece: agora com o `subtotal`/`total` já descontados só nos produtos.)

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/pix-loja.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeOrderController.js src/controllers/paymentController.js test/pix-loja.test.js
git commit -m "feat(pix): aplica desconto PIX na loja (criarPix) e expõe pixTotal no resumo"
```

---

### Task 5: Aplicar o desconto no painel (createOrder)

**Files:**
- Modify: `src/controllers/orderController.js` (`createOrder`)
- Test: `test/pix-painel.test.js`

**Interfaces:**
- Consumes: `getDescontoPix`, `resolvePixPercent`, `aplicaPix` (Task 1).
- Produces: quando `paymentMethod === 'PIX'`, `createOrder` aplica o % (cliente vence global) em cada `salePrice` e recalcula o total gravado; outros pagamentos ficam idênticos.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/pix-painel.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { createOrder } = require('../src/controllers/orderController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(pix){ const [r] = await db.query('INSERT INTO clients (name, pix_discount_percent) VALUES (?, ?)', ['zz_test_cli_'+Date.now()+Math.random(), pix]); return r.insertId; }
async function seedProduct(){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,10)', ['zz_test_prod', 5, 100, 'Outros', 'ZZP'+Date.now()]); return r.insertId; }
async function cleanup(orderIds){
  for (const oid of orderIds) { await db.query('DELETE FROM order_products WHERE order_id = ?', [oid]); await db.query('DELETE FROM estoque_movimentacoes WHERE observacao LIKE ?', ['Pedido #'+oid+'%']); await db.query('DELETE FROM orders WHERE id = ?', [oid]); }
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('PIX aplica o % do cliente por item e no total', async () => {
  const clientId = await seedClient(10); // 10% no PIX
  const productId = await seedProduct();
  const res = mockRes();
  await createOrder({ body: { clientId, paymentMethod: 'PIX', totalValue: 200,
    products: [{ id: productId, salePrice: 100, quantity: 2, productCost: 5 }] } }, res);
  assert.strictEqual(res.statusCode, 201);
  const orderId = res.body.orderId;
  const [[op]] = await db.query('SELECT sale_price FROM order_products WHERE order_id = ?', [orderId]);
  assert.strictEqual(Number(op.sale_price), 90); // 100 - 10%
  const [[o]] = await db.query('SELECT total_cost FROM orders WHERE id = ?', [orderId]);
  assert.strictEqual(Number(o.total_cost), 180); // 90 * 2
  await cleanup([orderId]);
});

test('pagamento não-PIX não altera preço', async () => {
  const clientId = await seedClient(10);
  const productId = await seedProduct();
  const res = mockRes();
  await createOrder({ body: { clientId, paymentMethod: 'DINHEIRO', totalValue: 200,
    products: [{ id: productId, salePrice: 100, quantity: 2, productCost: 5 }] } }, res);
  assert.strictEqual(res.statusCode, 201);
  const orderId = res.body.orderId;
  const [[op]] = await db.query('SELECT sale_price FROM order_products WHERE order_id = ?', [orderId]);
  assert.strictEqual(Number(op.sale_price), 100);
  await cleanup([orderId]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/pix-painel.test.js`
Expected: FAIL (o preço sai 100, não 90 — desconto ainda não aplicado).

- [ ] **Step 3: Implementar em `createOrder`**

Em `src/controllers/orderController.js`, no topo do arquivo garantir o import:

```js
const { getDescontoPix, resolvePixPercent, aplicaPix } = require('../utils/pricing');
```

Logo APÓS o laço de validação dos produtos (o `for (const product of productArray) { if (!product.id ...) }`, ~linha 33) e ANTES de `const fee = 0;`, inserir:

```js
  // Desconto PIX (só quando o pagamento é PIX): aplica por item e recalcula o total.
  let effProducts = productArray;
  let effTotal = Number(totalValue);
  if (paymentMethod === 'PIX') {
    const [[cli]] = await db.query('SELECT pix_discount_percent FROM clients WHERE id = ?', [clientId]);
    const pixPct = resolvePixPercent(cli ? cli.pix_discount_percent : null, await getDescontoPix());
    if (pixPct > 0) {
      effProducts = productArray.map(p => Object.assign({}, p, { salePrice: aplicaPix(parseFloat(p.salePrice), pixPct) }));
      effTotal = Number(effProducts.reduce((s, p) => s + (Number(p.salePrice) * (p.quantity || 1)), 0).toFixed(2));
    }
  }
```

Depois, no INSERT de `orders`, trocar `totalValue` por `effTotal`:

```js
      [clientId, paymentMethod, installments || null, effTotal, combinedPaymentValue || null, fee]
```

E na montagem de `productsValues` (o `productArray.map(...)`) e no laço de baixa de estoque, trocar `productArray` por `effProducts`:

```js
    const productsValues = effProducts.map(p => [
      orderId, p.id, parseFloat(p.salePrice), p.quantity || 1,
      p.productCost != null ? parseFloat(p.productCost) : null
    ]);
```

```js
    for (const product of effProducts) {
```

E no retorno de sucesso, trocar `totalValue` por `effTotal`:

```js
    return res.status(201).json({ message: 'Pedido criado com sucesso!', orderId, totalValue: effTotal, deliveryFee: fee });
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/pix-painel.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/orderController.js test/pix-painel.test.js
git commit -m "feat(pix): aplica desconto PIX no painel (createOrder) por item e no total"
```

---

## ONDA 2 — UI

### Task 6: Configuração (descontos.html global + clientes.html por cliente)

**Files:**
- Modify: `src/public/descontos.html`
- Modify: `src/public/clientes.html`
- Test: verificação manual (smoke), o projeto não tem testes de UI.

**Interfaces:**
- Consumes: `GET/PUT /api/descontos` (agora com `pixAtivo`/`pixPercent`), `PUT /api/clients/:id/pix-discount`, `GET /api/clients/:id/summary` (agora com `client.pix_discount_percent`).

- [ ] **Step 1: descontos.html — seção "Desconto no PIX"**

Abrir `src/public/descontos.html`, localizar os controles do desconto global (o toggle + input de % que usam `GET/PUT /api/descontos`). Ao lado/abaixo, adicionar a seção PIX no mesmo padrão visual:

```html
<hr>
<h5 class="mt-3">Desconto no PIX</h5>
<div class="form-check form-switch mb-2">
  <input class="form-check-input" type="checkbox" id="pix-ativo">
  <label class="form-check-label" for="pix-ativo">Ativar desconto para pagamentos no PIX</label>
</div>
<div class="input-group" style="max-width:220px">
  <input type="number" min="0" max="99.99" step="0.01" class="form-control" id="pix-percent" placeholder="0">
  <span class="input-group-text">%</span>
</div>
```

No JS da página: ao carregar (onde faz `GET /api/descontos`), preencher `pix-ativo`/`pix-percent` com `data.pixAtivo`/`data.pixPercent`; ao salvar (onde faz `PUT /api/descontos`), incluir no corpo `pixAtivo: document.getElementById('pix-ativo').checked, pixPercent: Number(document.getElementById('pix-percent').value) || 0` (junto com os campos globais que já envia).

- [ ] **Step 2: clientes.html — campo "Desconto PIX (%)" no modal do cliente**

Em `src/public/clientes.html`, no modal que mostra o resumo do cliente (o que chama `GET /api/clients/:id/summary`), adicionar um campo editável + botão salvar:

```html
<div class="input-group input-group-sm mt-2" style="max-width:260px">
  <span class="input-group-text">Desconto PIX (%)</span>
  <input type="number" min="0" max="99.99" step="0.01" class="form-control" id="cli-pix-percent" placeholder="usa o global">
  <button class="btn btn-outline-primary" id="cli-pix-salvar" type="button">Salvar</button>
</div>
<div class="form-text">Vazio = usa o desconto global do PIX.</div>
```

No JS: ao abrir o resumo, setar `cli-pix-percent` com `data.client.pix_discount_percent` (vazio se `null`). No clique de `cli-pix-salvar`, chamar:

```js
const v = document.getElementById('cli-pix-percent').value;
const r = await Auth.apiFetch('/api/clients/' + clienteIdAtual + '/pix-discount', {
  method: 'PUT', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ percent: v === '' ? null : Number(v) })
});
if (r.ok) Swal.fire('Salvo!', 'Desconto PIX do cliente atualizado.', 'success');
else Swal.fire('Erro', (await r.json()).error || '', 'error');
```

(Use a variável de id do cliente já existente no escopo do modal; se não houver, guarde o id ao abrir o resumo.)

- [ ] **Step 3: Smoke manual**

Run: `npm run dev`. Em `descontos.html`: ativar o PIX, pôr 5%, salvar, recarregar — o valor persiste. Em `clientes.html`: abrir um cliente, pôr 10% no campo, salvar, reabrir — mostra 10; limpar e salvar — volta a "usa o global". Depois **matar o node** (liberar :3000).

- [ ] **Step 4: Commit**

```bash
git add src/public/descontos.html src/public/clientes.html
git commit -m "feat(pix): UI de configuração — global (descontos) e por cliente (resumo)"
```

---

### Task 7: Exibir o preço do PIX no checkout da loja

**Files:**
- Modify: `src/public/loja/checkout.html`
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `POST /api/loja/checkout/resumo` (agora devolve `pixPercent` e `pixTotal`).

- [ ] **Step 1: Mostrar o desconto na seleção de pagamento**

Em `src/public/loja/checkout.html`, onde a resposta do resumo (`/api/loja/checkout/resumo`) é usada para exibir o total e as formas de pagamento, usar `pixPercent`/`pixTotal`:

- Guardar os valores do resumo (ex.: `resumoAtual = data`).
- Na opção de pagamento PIX, quando `data.pixPercent > 0`, exibir o `pixTotal` formatado, um selo "`{pixPercent}%` OFF" e "você economiza R$ {total - pixTotal}". Quando `pixPercent <= 0`, mostrar o `total` normal, sem selo.
- Ao selecionar PIX, o total destacado passa a ser `pixTotal`; ao selecionar Cartão, volta a ser `total`.

Exemplo de render (adaptar aos elementos reais da página, usando as classes/ids já existentes e `fmt`/formatação de moeda da própria página):

```js
function precoPix(d) {
  if (d.pixPercent > 0) {
    const economia = (d.total - d.pixTotal).toFixed(2);
    return `R$ ${d.pixTotal.toFixed(2)} <span class="badge bg-success">${d.pixPercent}% OFF</span>
            <div class="small text-success">você economiza R$ ${economia}</div>`;
  }
  return `R$ ${d.total.toFixed(2)}`;
}
```

Nenhum dado interpolado vem de texto livre do usuário (são números do backend), mas mantenha a formatação numérica consistente com o resto da página.

- [ ] **Step 2: Smoke manual**

Run: `npm run dev`. Com o desconto PIX global ativo (ex.: 5%), logar na loja, adicionar item, ir ao checkout: a opção PIX mostra o valor com desconto, o selo "5% OFF" e a economia; selecionar PIX destaca o total com desconto; Cartão mostra o cheio. Testar também com um cliente que tenha % próprio (o valor reflete o dele). Depois **matar o node**.

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(pix): checkout da loja mostra preço do PIX com desconto e economia"
```

---

### Task 8: Preview do desconto PIX no painel (pedidos.html)

**Files:**
- Modify: `src/public/pedidos.html`
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/descontos` (`pixAtivo`/`pixPercent`), `GET /api/clients/:id/summary` (`client.pix_discount_percent`).

- [ ] **Step 1: Recalcular o total exibido ao marcar PIX**

Em `src/public/pedidos.html` (tela de criar pedido), quando o método de pagamento selecionado for **PIX** e houver um cliente selecionado, calcular o `%` efetivo e mostrar o total com desconto:

- Ao carregar a tela, buscar o global uma vez: `const desc = await (await Auth.apiFetch('/api/descontos')).json();` (guardar `desc.pixAtivo`, `desc.pixPercent`).
- Ao selecionar/trocar o cliente, buscar o `pix_discount_percent` dele via `GET /api/clients/:id/summary` (`resumo.client.pix_discount_percent`) e guardar.
- Função de resolução no front (espelha o backend):

```js
function pixPercentEfetivo(cliPix, desc) {
  if (cliPix !== null && cliPix !== undefined && cliPix !== '') { const p = Number(cliPix); return isNaN(p) ? 0 : p; }
  if (desc && desc.pixAtivo && Number(desc.pixPercent) > 0) return Number(desc.pixPercent);
  return 0;
}
```

- Quando o pagamento for PIX e `pct > 0`, exibir um aviso perto do total, ex.: `PIX: R$ 190,00 — 5% aplicado` (total dos produtos × (1 − pct/100)). É só **preview** — o backend é a fonte autoritativa (Task 5), então não é preciso alterar o corpo do POST; o valor gravado virá do servidor.

- [ ] **Step 2: Smoke manual**

Run: `npm run dev`. No painel, criar pedido: escolher um cliente, adicionar produto, marcar pagamento PIX → aparece o total com desconto (global, ou o do cliente se ele tiver). Trocar pra outro pagamento → some o aviso e volta o cheio. Criar o pedido com PIX e conferir na lista que o total gravado bate com o preview. Depois **matar o node**.

- [ ] **Step 3: Commit**

```bash
git add src/public/pedidos.html
git commit -m "feat(pix): preview do total com desconto PIX ao criar pedido no painel"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** dados (T1 coluna + global settings via T2), regra de resolução (T1 `resolvePixPercent`), aplicação loja (T4) e painel (T5) só nos produtos e por item, config global (T2+T6) e por cliente (T3+T6), exibição loja (T7) e painel (T8). Fora de escopo (outras formas de pagamento, frete, auditoria) permanece fora. ✔
- **Desvio da spec (registrado):** a spec falava em "clientController update"; como não existe update de cliente, o `%` por cliente usa um endpoint focado `PUT /api/clients/:id/pix-discount` + o modal de resumo (T3/T6). Mesmo efeito, mecanismo concreto.
- **Consistência de tipos:** `getDescontoPix()→{ativo,percent}`, `resolvePixPercent(cliPix, globalPix)→number`, `aplicaPix(valor,percent)→number` usados idênticos em T2/T4/T5. Chaves `desconto_pix_ativo`/`desconto_pix_percent` e coluna `pix_discount_percent` idênticas em todas as tasks. ✔
- **Sem placeholders de lógica:** todo passo traz o código real; nos passos de UI, os snippets são concretos e apontam onde integrar nos elementos existentes.
- **Riscos:** desconto só quando `pct>0` (sem desconto = comportamento idêntico ao atual); frete nunca descontado; aplicado por item (lucro exato); migração aditiva idempotente; tudo na `Teste`.

## Ordem de execução

Onda 1 (T1→T5) entrega o desconto funcionando de ponta a ponta no backend (loja + painel). Onda 2 (T6→T8) adiciona a configuração e a exibição. Cada task termina testável e commitada.
