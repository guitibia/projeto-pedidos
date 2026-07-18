const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { excluirPedido } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r]=await db.query('INSERT INTO clients (name) VALUES (?)',['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedPedido(clientId, orderId){
  const [p]=await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)',[clientId]);
  await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, order_id) VALUES (?,?,?,?)',[p.insertId,'X',1, orderId || null]);
  return p.insertId;
}
async function cleanup(){
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('excluirPedido apaga pedido sem venda', async () => {
  const cli=await seedClient();
  const pedidoId=await seedPedido(cli, null);
  const res=mockRes();
  await excluirPedido({ params:{ id: pedidoId } }, res);
  assert.strictEqual(res.statusCode,200);
  const [[p]]=await db.query('SELECT COUNT(*) c FROM demanda_pedidos WHERE id = ?',[pedidoId]);
  const [[it]]=await db.query('SELECT COUNT(*) c FROM demanda_itens WHERE pedido_id = ?',[pedidoId]);
  assert.strictEqual(Number(p.c),0);
  assert.strictEqual(Number(it.c),0);
  await cleanup();
});

test('excluirPedido com item já vendido → 409', async () => {
  const cli=await seedClient();
  const pedidoId=await seedPedido(cli, 99999);
  const res=mockRes();
  await excluirPedido({ params:{ id: pedidoId } }, res);
  assert.strictEqual(res.statusCode,409);
  const [[p]]=await db.query('SELECT COUNT(*) c FROM demanda_pedidos WHERE id = ?',[pedidoId]);
  assert.strictEqual(Number(p.c),1,'não apagou');
  await cleanup();
});

test('excluirPedido inexistente → 404', async () => {
  const res=mockRes();
  await excluirPedido({ params:{ id: 999999999 } }, res);
  assert.strictEqual(res.statusCode,404);
});
