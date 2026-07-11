const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');

test('migração criou as tabelas de demanda', async () => {
  for (const t of ['demanda_pedidos', 'demanda_itens', 'demanda_conciliacoes']) {
    const [rows] = await db.query('SHOW TABLES LIKE ?', [t]);
    assert.strictEqual(rows.length, 1, `tabela ${t} deve existir`);
  }
});
