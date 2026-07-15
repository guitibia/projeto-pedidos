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
