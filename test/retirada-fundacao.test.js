const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { getEnderecoRetirada } = require('../src/utils/delivery');
const { metodoEntrega } = require('../src/controllers/storeOrderController');

test('metodoEntrega: só "retirada" (case-insensitive) vira retirada; resto é entrega', () => {
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'retirada' }), 'retirada');
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'RETIRADA' }), 'retirada');
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'entrega' }), 'entrega');
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'x' }), 'entrega');
  assert.strictEqual(metodoEntrega({}), 'entrega');
  assert.strictEqual(metodoEntrega(null), 'entrega');
});

test('getEnderecoRetirada: lê o setting endereco_retirada', async () => {
  await db.query("INSERT INTO store_settings (skey, svalue) VALUES ('endereco_retirada', ?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)", ['Rua Teste, 100 — Centro']);
  assert.strictEqual(await getEnderecoRetirada(), 'Rua Teste, 100 — Centro');
});
