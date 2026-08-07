const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { remanejarAlocacao } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedProduct(estoque){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,?)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()+Math.floor(Math.random()*1e6), estoque != null ? estoque : 0]); return r.insertId; }
async function cleanup(){
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM estoque_movimentacoes WHERE product_id IN (SELECT id FROM products WHERE name = 'zz_test_prod')");
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
}

test('remanejarAlocacao grava product_id quando enviado e mantém quando ausente', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct();
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K1', 2, 0, 'pendente']);
    // 1) com product_id: grava o vínculo
    let res = mockRes();
    await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 2, product_id: prod } }, res);
    assert.strictEqual(res.statusCode, 200);
    let [[row]] = await db.query('SELECT qtd_recebida, product_id FROM demanda_itens WHERE id = ?', [i.insertId]);
    assert.strictEqual(row.product_id, prod);
    assert.strictEqual(Number(row.qtd_recebida), 2);
    // 2) sem product_id: não apaga o vínculo anterior
    res = mockRes();
    await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    [[row]] = await db.query('SELECT qtd_recebida, product_id FROM demanda_itens WHERE id = ?', [i.insertId]);
    assert.strictEqual(row.product_id, prod, 'product_id continua ligado');
    assert.strictEqual(Number(row.qtd_recebida), 1);
  } finally {
    await cleanup();
  }
});
