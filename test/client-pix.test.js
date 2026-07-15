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
