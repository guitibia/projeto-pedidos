const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { listarPedidos } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

async function seedClient(){
  const nome = 'zz_test_cli_'+Date.now()+Math.floor(Math.random()*1e6);
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', [nome]);
  return { id: r.insertId, nome };
}

async function seedOrder(clientId, status, deliveredAt){
  const [r] = await db.query(
    'INSERT INTO orders (client_id, payment_method, total_cost, status, delivered_at) VALUES (?,?,?,?,?)',
    [clientId, 'DINHEIRO', 10, status, deliveredAt || null]);
  return r.insertId;
}

async function seedPedido(clientId){
  const [r] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [clientId]);
  return r.insertId;
}

async function seedItem(pedidoId, orderId){
  const [r] = await db.query(
    'INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status, order_id) VALUES (?,?,?,?,?,?)',
    [pedidoId, 'K'+Math.floor(Math.random()*1e6), 1, 1, 'veio', orderId || null]);
  return r.insertId;
}

async function listar(query){
  const res = mockRes();
  await listarPedidos({ query: query || {} }, res);
  assert.strictEqual(res.statusCode, 200);
  return res.body;
}

const achar = (lista, pedidoId) => lista.find(p => p.id === pedidoId);

async function cleanup(){
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('pedido sem venda gerada fica na aba Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, null);
    assert.ok(achar(await listar(), ped), 'deveria estar em Pedidos');
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined);
  } finally { await cleanup(); }
});

test('pedido com venda Pendente fica na aba Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Pendente'));
    assert.ok(achar(await listar(), ped));
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined);
  } finally { await cleanup(); }
});

test('pedido com todas as vendas Entregue vai para a aba Entregues', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    const p = achar(await listar({ entregues: '1' }), ped);
    assert.ok(p, 'deveria estar em Entregues');
    assert.strictEqual(p.entregue, true);
    assert.strictEqual(achar(await listar(), ped), undefined);
  } finally { await cleanup(); }
});

test('pedido com duas vendas, uma Entregue e outra Pendente, fica em Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    await seedItem(ped, await seedOrder(cli.id, 'Pendente'));
    assert.ok(achar(await listar(), ped));
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined);
  } finally { await cleanup(); }
});

test('venda Entregue e outra Cancelada mantem o pedido em Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    await seedItem(ped, await seedOrder(cli.id, 'Cancelado'));
    assert.ok(achar(await listar(), ped));
  } finally { await cleanup(); }
});

test('pedido entregue com item sem venda aparece em Entregues com itens_pendentes = 1', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    await seedItem(ped, null);
    const p = achar(await listar({ entregues: '1' }), ped);
    assert.ok(p, 'deveria estar em Entregues');
    assert.strictEqual(Number(p.itens_pendentes), 1);
  } finally { await cleanup(); }
});

test('entrega de 120 dias atras so aparece na busca por nome', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    const antiga = new Date(Date.now() - 120*24*3600*1000);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', antiga));
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined, 'deveria estar fora da janela de 90 dias');
    assert.ok(achar(await listar({ entregues: '1', q: cli.nome }), ped), 'a busca deveria ignorar a janela');
  } finally { await cleanup(); }
});
