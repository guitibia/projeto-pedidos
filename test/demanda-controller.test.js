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

const {
  criarPedido, getPedido, addItem, updateItem, deleteItem, listarPedidos, listarFornecedores,
  listaCompra, relatorio
} = require('../src/controllers/demandaController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; } };
}
async function seedClient() {
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_' + Date.now()]);
  return r.insertId;
}
async function cleanupDemanda() {
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('criarPedido + addItem + getPedido devolve itens', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId, observacao: 'teste' } }, res);
  assert.strictEqual(res.statusCode, 201);
  const pedidoId = res.body.id;

  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { fornecedor_nome: 'Natura', fornecedor_cnpj: '12345678000199', codigo: '8412', nome: 'Batom', qtd_pedida: 2, preco_venda: 30 } }, res);
  assert.strictEqual(res.statusCode, 201);

  res = mockRes();
  await getPedido({ params: { id: pedidoId } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.itens.length, 1);
  assert.strictEqual(res.body.itens[0].codigo, '8412');
  await cleanupDemanda();
});

test('addItem rejeita qtd inválida (400)', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId } }, res);
  const pedidoId = res.body.id;
  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { codigo: '1', qtd_pedida: 0 } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanupDemanda();
});

test('criarPedido rejeita cliente inexistente (400)', async () => {
  const res = mockRes();
  await criarPedido({ body: { client_id: 999999999 } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('deleteItem remove o item', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId } }, res);
  const pedidoId = res.body.id;
  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { codigo: '8412', qtd_pedida: 1 } }, res);
  const itemId = res.body.id;
  res = mockRes();
  await deleteItem({ params: { itemId } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mockRes();
  await getPedido({ params: { id: pedidoId } }, res);
  assert.strictEqual(res.body.itens.length, 0);
  await cleanupDemanda();
});

test('listaCompra agrupa linhas pendentes por fornecedor', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId } }, res);
  const pedidoId = res.body.id;
  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { fornecedor_nome: 'Natura', fornecedor_cnpj: '11111111000191', codigo: 'AA1', nome: 'Batom', qtd_pedida: 2 } }, res);

  res = mockRes();
  await listaCompra({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  const forn = res.body.find(f => f.fornecedor_cnpj === '11111111000191');
  assert.ok(forn, 'fornecedor presente');
  const it = forn.itens.find(i => i.codigo === 'AA1');
  assert.strictEqual(it.qtd_total, 2);
  assert.strictEqual(it.clientes.length, 1);
  await cleanupDemanda();
});

test('relatorio devolve visões por cliente e por fornecedor', async () => {
  const res = mockRes();
  await relatorio({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.porCliente));
  assert.ok(Array.isArray(res.body.porFornecedor));
});
