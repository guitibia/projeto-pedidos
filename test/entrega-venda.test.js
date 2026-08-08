const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { createOrder } = require('../src/controllers/orderController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedProduct(estoque){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,?)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()+Math.floor(Math.random()*1e6), estoque != null ? estoque : 0]); return r.insertId; }
async function cleanup(){
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM estoque_movimentacoes WHERE product_id IN (SELECT id FROM products WHERE name = 'zz_test_prod')");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
}
async function criar(cli, prod, extra){
  const res = mockRes();
  await createOrder({ body: Object.assign({ clientId: cli, paymentMethod: 'DINHEIRO', totalValue: 40, products: [{ id: prod, salePrice: 40, quantity: 1 }] }, extra) }, res);
  return res;
}

test('createOrder retirada grava delivery_method=retirada e fee 0', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'retirada', deliveryFee: 99 });
    assert.strictEqual(res.statusCode, 201);
    const [[o]] = await db.query('SELECT delivery_method, delivery_fee FROM orders WHERE id = ?', [res.body.orderId]);
    assert.strictEqual(o.delivery_method, 'retirada');
    assert.strictEqual(Number(o.delivery_fee), 0);
  } finally { await cleanup(); }
});

test('createOrder entrega grava delivery_method=entrega e a taxa informada', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'entrega', deliveryFee: 12 });
    assert.strictEqual(res.statusCode, 201);
    const [[o]] = await db.query('SELECT delivery_method, delivery_fee FROM orders WHERE id = ?', [res.body.orderId]);
    assert.strictEqual(o.delivery_method, 'entrega');
    assert.strictEqual(Number(o.delivery_fee), 12);
  } finally { await cleanup(); }
});

test('createOrder entrega com taxa vazia/negativa grava fee 0', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'entrega', deliveryFee: -5 });
    assert.strictEqual(res.statusCode, 201);
    const [[o]] = await db.query('SELECT delivery_fee FROM orders WHERE id = ?', [res.body.orderId]);
    assert.strictEqual(Number(o.delivery_fee), 0);
  } finally { await cleanup(); }
});

test('createOrder rejeita deliveryMethod inválido (400)', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'teletransporte' });
    assert.strictEqual(res.statusCode, 400);
  } finally { await cleanup(); }
});
