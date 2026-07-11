const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { rascunhoVenda, marcarVenda, remanejarAlocacao } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedProduct(){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,0)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()]); return r.insertId; }
async function cleanup(){
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
}

test('rascunhoVenda devolve só recebidos com product_id; preço cai pro sale_value', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct();
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'K1', 2, 2, prod, 'veio']);
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K2', 1, 0, 'pendente']);
    const res = mockRes();
    await rascunhoVenda({ params: { id: p.insertId } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.itens.length, 1);
    assert.strictEqual(res.body.itens[0].product_id, prod);
    assert.strictEqual(Number(res.body.itens[0].preco), 40);
  } finally {
    await cleanup();
  }
});

test('marcarVenda grava order_id e bloqueia segunda venda (409)', async () => {
  try {
    const cli = await seedClient();
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K1', 1, 1, 'veio']);
    let res = mockRes();
    await marcarVenda({ params: { itemId: i.insertId }, body: { order_id: 12345 } }, res);
    assert.strictEqual(res.statusCode, 200);
    res = mockRes();
    await marcarVenda({ params: { itemId: i.insertId }, body: { order_id: 999 } }, res);
    assert.strictEqual(res.statusCode, 409);
  } finally {
    await cleanup();
  }
});

test('remanejarAlocacao ajusta recebido e rejeita acima do pedido (400)', async () => {
  const cli = await seedClient();
  const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
  const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K1', 3, 3, 'veio']);
  let res = mockRes();
  await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 1 } }, res);
  assert.strictEqual(res.statusCode, 200);
  let [[row]] = await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?', [i.insertId]);
  assert.strictEqual(Number(row.qtd_recebida), 1);
  assert.strictEqual(row.status, 'parcial');
  res = mockRes();
  await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 99 } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});
