const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { updateOrderStatus } = require('../src/controllers/orderController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

async function seedClient(){
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]);
  return r.insertId;
}

async function seedOrder(clientId, status){
  const [r] = await db.query(
    'INSERT INTO orders (client_id, payment_method, total_cost, status) VALUES (?,?,?,?)',
    [clientId, 'DINHEIRO', 10, status || 'Pendente']);
  return r.insertId;
}

async function delivered(orderId){
  const [[o]] = await db.query('SELECT delivered_at FROM orders WHERE id = ?', [orderId]);
  return o.delivered_at;
}

async function cleanup(){
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('marcar Entregue grava delivered_at', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    assert.strictEqual(await delivered(ord), null);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Entregue' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(await delivered(ord), 'delivered_at deveria estar preenchido');
  } finally { await cleanup(); }
});

test('remarcar Entregue nao reescreve a data original', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    await db.query("UPDATE orders SET status='Entregue', delivered_at='2020-01-01 10:00:00' WHERE id = ?", [ord]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Entregue' } }, res);
    const d = await delivered(ord);
    assert.strictEqual(new Date(d).getFullYear(), 2020);
  } finally { await cleanup(); }
});

test('voltar para Pendente limpa delivered_at', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    await db.query("UPDATE orders SET status='Entregue', delivered_at=NOW() WHERE id = ?", [ord]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Pendente' } }, res);
    assert.strictEqual(await delivered(ord), null);
  } finally { await cleanup(); }
});

test('cancelar limpa delivered_at', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    await db.query("UPDATE orders SET status='Entregue', delivered_at=NOW() WHERE id = ?", [ord]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Cancelado', motivo: 'teste' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(await delivered(ord), null);
  } finally { await cleanup(); }
});
