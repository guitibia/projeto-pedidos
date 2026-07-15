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

  // snapshot dos produtos REAIS (não-fixture) que seriam ocultados, pra restaurar depois
  // (o endpoint mexe na tabela toda; sem isso o teste poluiria o banco de dev)
  const [colateral] = await db.query(
    "SELECT id FROM products WHERE visivel_loja=1 AND name <> 'zz_test_prod' AND NOT EXISTS (SELECT 1 FROM order_products op WHERE op.product_id = products.id)");

  const res = mockRes();
  await ocultarNuncaVendidos({}, res);
  assert.strictEqual(res.statusCode, 200);
  const [[a]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [semVenda]);
  const [[b]] = await db.query('SELECT visivel_loja FROM products WHERE id = ?', [comVenda]);
  assert.strictEqual(Number(a.visivel_loja), 0, 'sem venda foi ocultado');
  assert.strictEqual(Number(b.visivel_loja), 1, 'com venda continua visível');

  // restaura os produtos reais afetados (fora dos fixtures)
  if (colateral.length) await db.query('UPDATE products SET visivel_loja=1 WHERE id IN (?)', [colateral.map(r => r.id)]);
  // limpeza
  await db.query('DELETE FROM order_products WHERE order_id = ?', [ord.insertId]);
  await db.query('DELETE FROM orders WHERE id = ?', [ord.insertId]);
  await db.query('DELETE FROM clients WHERE id = ?', [cli.insertId]);
  await cleanup();
});
