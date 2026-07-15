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
