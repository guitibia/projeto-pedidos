const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { clientSummary } = require('../src/controllers/clientController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}

async function seed() {
  const [c] = await db.query(
    "INSERT INTO clients (name, address, house_number, neighborhood) VALUES ('ZZ Perfil Cliente', 'Rua X', '1', 'Centro')");
  const cid = c.insertId;
  const [pr] = await db.query(
    "INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES ('ZZ Perfil Prod', 1, 10, 'Outros', ?, 0)",
    ['ZZP' + Date.now() + Math.random().toString(36).slice(2, 6)]);
  const pid = pr.insertId;
  const [o1] = await db.query(
    "INSERT INTO orders (client_id, payment_method, total_cost, status, origin) VALUES (?, 'PIX', 100, 'Entregue', 'Site')", [cid]);
  const [o2] = await db.query(
    "INSERT INTO orders (client_id, payment_method, total_cost, status, origin) VALUES (?, 'DINHEIRO', 50, 'Cancelado', 'Presencial')", [cid]);
  await db.query("INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES (?, ?, 10, 3, 1)", [o1.insertId, pid]);
  await db.query("INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES (?, ?, 10, 5, 1)", [o2.insertId, pid]);
  return { cid, pid, o1: o1.insertId, o2: o2.insertId };
}
async function cleanup(s) {
  await db.query('DELETE FROM order_products WHERE order_id IN (?, ?)', [s.o1, s.o2]);
  await db.query('DELETE FROM orders WHERE id IN (?, ?)', [s.o1, s.o2]);
  await db.query('DELETE FROM products WHERE id = ?', [s.pid]);
  await db.query('DELETE FROM clients WHERE id = ?', [s.cid]);
}

test('clientSummary: agrega pedidos e exclui cancelados do financeiro', async () => {
  const s = await seed();
  const res = mockRes();
  await clientSummary({ params: { id: String(s.cid) } }, res);
  const b = res.body;
  assert.strictEqual(b.client.name, 'ZZ Perfil Cliente');
  assert.strictEqual(b.stats.totalPedidos, 2);
  assert.strictEqual(Number(b.stats.totalGasto), 100);      // exclui o cancelado (50)
  assert.strictEqual(Number(b.stats.ticketMedio), 100);     // 100 / 1 pedido válido
  // topProdutos: só o pedido não-cancelado (qtd 3, total 30)
  assert.strictEqual(b.topProdutos.length, 1);
  assert.strictEqual(Number(b.topProdutos[0].qtd), 3);
  assert.strictEqual(Number(b.topProdutos[0].total), 30);
  const statuses = b.stats.porStatus.map(r => r.status).sort();
  assert.deepStrictEqual(statuses, ['Cancelado', 'Entregue']);
  await cleanup(s);
});

test('clientSummary: id inexistente → 404', async () => {
  const res = mockRes();
  await clientSummary({ params: { id: '999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
