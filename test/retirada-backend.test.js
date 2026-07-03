const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const store = require('../src/controllers/storeOrderController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; } };
}

// cria um cliente + produto p/ o teste
async function seed() {
  const [c] = await db.query("INSERT INTO clients (name, city) VALUES ('ZZ Retirada', 'Cidade Fora XYZ')");
  const [p] = await db.query("INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES ('ZZ Prod Retirada', 1, 20, 'Outros', ?, 50)", ['ZZR'+Date.now()]);
  return { cid: c.insertId, pid: p.insertId };
}
async function cleanup(s, orderId) {
  if (orderId) { await db.query('DELETE FROM order_products WHERE order_id=?', [orderId]); await db.query('DELETE FROM orders WHERE id=?', [orderId]); }
  await db.query('DELETE FROM estoque_movimentacoes WHERE product_id=?', [s.pid]);
  await db.query('DELETE FROM products WHERE id=?', [s.pid]);
  await db.query('DELETE FROM clients WHERE id=?', [s.cid]);
}

test('resumo: retirada zera o frete e ignora a cidade (cliente de fora)', async () => {
  const s = await seed();
  const res = mockRes();
  await store.resumo({ customer: { id: s.cid }, body: { items: [{ id: s.pid, qty: 2 }], deliveryMethod: 'retirada' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.deliveryFee, 0);
  assert.strictEqual(res.body.total, res.body.subtotal);
  assert.strictEqual(res.body.deliveryMethod, 'retirada');
  await cleanup(s);
});

test('criarPedidoPago: grava delivery_method=retirada e delivery_fee=0', async () => {
  const s = await seed();
  const conn = await db.getConnection();
  let orderId;
  try {
    await conn.beginTransaction();
    orderId = await store.criarPedidoPago(conn, {
      clientId: s.cid,
      lines: [{ id: s.pid, qty: 1, unitPrice: 20, costPrice: null }],
      fee: 0, total: 20, paymentMethod: 'PIX', mpPaymentId: null, deliveryMethod: 'retirada'
    });
    await conn.commit();
  } finally { conn.release(); }
  const [[o]] = await db.query('SELECT delivery_method, delivery_fee FROM orders WHERE id=?', [orderId]);
  assert.strictEqual(o.delivery_method, 'retirada');
  assert.strictEqual(Number(o.delivery_fee), 0);
  await cleanup(s, orderId);
});
