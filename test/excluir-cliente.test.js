const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { deleteClient } = require('../src/controllers/clientController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}

async function seedClient() {
  const [c] = await db.query(
    "INSERT INTO clients (name, address, house_number, neighborhood) VALUES ('ZZ Del Cliente', 'Rua X', '1', 'Centro')");
  return c.insertId;
}

test('deleteClient: cliente sem pedidos é excluído (e favoritos limpos)', async () => {
  const id = await seedClient();
  // um favorito qualquer (product_id fictício)
  await db.query('INSERT INTO favorites (client_id, product_id) VALUES (?, ?)', [id, 999999]);
  const res = mockRes();
  await deleteClient({ params: { id: String(id) } }, res);
  assert.strictEqual(res.body.ok, true);
  const [[c]] = await db.query('SELECT COUNT(*) n FROM clients WHERE id=?', [id]);
  assert.strictEqual(c.n, 0);
  const [[f]] = await db.query('SELECT COUNT(*) n FROM favorites WHERE client_id=?', [id]);
  assert.strictEqual(f.n, 0);
});

test('deleteClient: cliente com pedido → 409 e permanece', async () => {
  const id = await seedClient();
  const [o] = await db.query(
    "INSERT INTO orders (client_id, payment_method, total_cost, status) VALUES (?, 'DINHEIRO', 0, 'Pendente')",
    [id]);
  const res = mockRes();
  await deleteClient({ params: { id: String(id) } }, res);
  assert.strictEqual(res.statusCode, 409);
  const [[c]] = await db.query('SELECT COUNT(*) n FROM clients WHERE id=?', [id]);
  assert.strictEqual(c.n, 1);
  // cleanup
  await db.query('DELETE FROM orders WHERE id=?', [o.insertId]);
  await db.query('DELETE FROM clients WHERE id=?', [id]);
});

test('deleteClient: id inexistente → 404', async () => {
  const res = mockRes();
  await deleteClient({ params: { id: '999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
