const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { aplicarConciliacao } = require('../src/controllers/demandaController');

const CNPJ = '22222222000122';
async function seedClient() {
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_' + Date.now() + Math.random()]);
  return r.insertId;
}
async function seedPedidoComItem(clientId, codigo, qtd) {
  const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [clientId]);
  const [i] = await db.query(
    'INSERT INTO demanda_itens (pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, qtd_pedida) VALUES (?, ?, ?, ?, ?)',
    [p.insertId, CNPJ, 'ZZ Fornecedor', codigo, qtd]);
  return { pedidoId: p.insertId, itemId: i.insertId };
}
async function seedNf(itens) { // itens: [{cprod, qtd}]
  const chave = 'zz' + Date.now() + Math.floor(Math.random()*1e9);
  const [n] = await db.query('INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero) VALUES (?, ?, ?, ?)',
    [String(chave).slice(0,44), 'ZZ Fornecedor', CNPJ, '1']);
  for (const it of itens) {
    await db.query('INSERT INTO nf_entrada_itens (nf_id, cprod, quantidade) VALUES (?, ?, ?)', [n.insertId, it.cprod, it.qtd]);
  }
  return n.insertId;
}
async function cleanup() {
  await db.query("DELETE FROM demanda_conciliacoes WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)", [CNPJ]);
  await db.query("DELETE FROM nf_entrada_itens WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)", [CNPJ]);
  await db.query("DELETE FROM nf_entradas WHERE emitente_cnpj = ?", [CNPJ]);
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('conciliação marca veio/parcial e é idempotente', async () => {
  const cli = await seedClient();
  const { itemId } = await seedPedidoComItem(cli, 'K10', 3);
  const nfId = await seedNf([{ cprod: 'K10', qtd: 2 }]);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await aplicarConciliacao(conn, nfId, CNPJ);
    await conn.commit();
  } finally { conn.release(); }

  let [[row]] = await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?', [itemId]);
  assert.strictEqual(Number(row.qtd_recebida), 2);
  assert.strictEqual(row.status, 'parcial');

  // reprocessar a MESMA NF não conta em dobro
  const conn2 = await db.getConnection();
  try {
    await conn2.beginTransaction();
    await aplicarConciliacao(conn2, nfId, CNPJ);
    await conn2.commit();
  } finally { conn2.release(); }
  [[row]] = await db.query('SELECT qtd_recebida FROM demanda_itens WHERE id = ?', [itemId]);
  assert.strictEqual(Number(row.qtd_recebida), 2, 'idempotente: continua 2');
  await cleanup();
});

test('conciliação fecha o item (veio) e conclui o pedido', async () => {
  const cli = await seedClient();
  const { pedidoId, itemId } = await seedPedidoComItem(cli, 'K20', 2);
  const nfId = await seedNf([{ cprod: 'K20', qtd: 2 }]);
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); await aplicarConciliacao(conn, nfId, CNPJ); await conn.commit(); }
  finally { conn.release(); }
  const [[item]] = await db.query('SELECT status FROM demanda_itens WHERE id = ?', [itemId]);
  const [[ped]] = await db.query('SELECT status FROM demanda_pedidos WHERE id = ?', [pedidoId]);
  assert.strictEqual(item.status, 'veio');
  assert.strictEqual(ped.status, 'concluido');
  await cleanup();
});
