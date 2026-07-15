const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { listProdutos, getProduto } = require('../src/controllers/storeController');
const { buildLines } = require('../src/controllers/storeOrderController');

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

test('buildLines marca produto oculto como indisponível (não comprável por ID/carrinho antigo)', async () => {
  const visId = await seedProduct(1, 'ZZBV'+Date.now());
  const hidId = await seedProduct(0, 'ZZBH'+Date.now());
  const lines = await buildLines([{ id: visId, qty: 1 }, { id: hidId, qty: 1 }]);
  const lv = lines.find(l => l.id === visId);
  const lh = lines.find(l => l.id === hidId);
  assert.strictEqual(lv.ok, true, 'visível é comprável');
  assert.strictEqual(lh.ok, false, 'oculto é indisponível');
  await cleanup();
});
