const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { remanejarAlocacao, gerarVendas, rascunhoVenda } = require('../src/controllers/demandaController');


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

test('gerarVendas cria venda, baixa estoque, marca order_id e agrega mesmo produto', async () => {
  try {
    const cli = await seedClient();
    const prod = await seedProduct(10); // estoque 10
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    // dois itens do MESMO produto (devem agregar em 1 linha de order_products, qtd 3)
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'A', 2, 2, prod, 'veio']);
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'B', 1, 1, prod, 'veio']);
    // um item recebido SEM produto (fica de fora)
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, nome, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'C', 'Brinde sem produto', 1, 1, 'veio']);

    const res = mockRes();
    await gerarVendas({ body: { payment_method: 'DINHEIRO' } }, res);
    assert.strictEqual(res.statusCode, 200);
    // endpoint é global (gera de todos os pedidos elegíveis); afirmamos só sobre o pedido semeado,
    // achando a order pelos itens que ELE marcou — não dependemos da contagem global do banco.
    const [[mk]] = await db.query('SELECT order_id FROM demanda_itens WHERE pedido_id = ? AND order_id IS NOT NULL LIMIT 1', [p.insertId]);
    assert.ok(mk && mk.order_id, 'gerou order para o pedido semeado');
    const orderId = mk.order_id;
    assert.ok(res.body.geradas.some(g => g.order_id === orderId), 'order do pedido semeado consta em geradas');
    assert.ok(res.body.sem_produto.some(s => s.nome === 'Brinde sem produto'), 'item sem produto listado');
    // order_products agregado numa linha, quantidade 3
    const [ops] = await db.query('SELECT product_id, quantity FROM order_products WHERE order_id = ?', [orderId]);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(Number(ops[0].quantity), 3);
    // estoque baixou de 10 para 7
    const [[pr]] = await db.query('SELECT estoque FROM products WHERE id = ?', [prod]);
    assert.strictEqual(Number(pr.estoque), 7);
    // os dois itens ligados foram marcados; o sem produto não
    const [[marc]] = await db.query('SELECT COUNT(*) n FROM demanda_itens WHERE pedido_id = ? AND order_id = ?', [p.insertId, orderId]);
    assert.strictEqual(Number(marc.n), 2);
  } finally {
    await cleanup();
  }
});

test('gerarVendas ignora item já vendido e reporta estoque insuficiente em falhas', async () => {
  try {
    const cli = await seedClient();
    const [[cliRow]] = await db.query('SELECT name FROM clients WHERE id = ?', [cli]);
    const prod = await seedProduct(1); // estoque só 1
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    // pede/recebe 2 mas só há 1 em estoque -> falha
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'A', 2, 2, prod, 'veio']);
    const res = mockRes();
    await gerarVendas({ body: { payment_method: 'DINHEIRO' } }, res);
    assert.strictEqual(res.statusCode, 200);
    // o pedido semeado (estoque insuficiente) entra em falhas — afirmamos pelo nome do cliente, não pela contagem global
    assert.ok(res.body.falhas.some(f => f.cliente === cliRow.name), 'pedido com estoque insuficiente consta em falhas');
    // nada foi baixado nem marcado NELE
    const [[pr]] = await db.query('SELECT estoque FROM products WHERE id = ?', [prod]);
    assert.strictEqual(Number(pr.estoque), 1);
    const [[marc]] = await db.query('SELECT COUNT(*) n FROM demanda_itens WHERE pedido_id = ? AND order_id IS NOT NULL', [p.insertId]);
    assert.strictEqual(Number(marc.n), 0);
  } finally {
    await cleanup();
  }
});

test('rascunhoVenda agrega dois itens do mesmo produto numa linha só (evita PK duplicada)', async () => {
  try {
    const cli = await seedClient();
    const prod = await seedProduct(10);
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    const [i1] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, nome, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?,?)', [p.insertId, 'A', 'Linha 1', 2, 2, prod, 'veio']);
    const [i2] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, nome, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?,?)', [p.insertId, 'B', 'Linha 2', 1, 1, prod, 'veio']);
    const res = mockRes();
    await rascunhoVenda({ params: { id: p.insertId } }, res);
    assert.strictEqual(res.statusCode, 200);
    // uma linha só (o mesmo produto), quantidade somada = 3
    assert.strictEqual(res.body.itens.length, 1);
    assert.strictEqual(res.body.itens[0].product_id, prod);
    assert.strictEqual(Number(res.body.itens[0].qtd), 3);
    // demanda_item_ids traz os dois ids (pra marcar ambos como vendidos)
    const ids = String(res.body.itens[0].demanda_item_ids).split(',').map(Number).sort((a,b)=>a-b);
    assert.deepStrictEqual(ids, [i1.insertId, i2.insertId].sort((a,b)=>a-b));
  } finally {
    await cleanup();
  }
});

test('rascunhoVenda liga o produto por nome via NF quando o item veio sem produto', async () => {
  let nfId;
  try {
    const cli = await seedClient();
    const prod = await seedProduct(5);
    // NF com um item ligado ao produto, descrição parecida com o nome do item do pedido
    const [nf] = await db.query('INSERT INTO nf_entradas (chave, emitente_nome) VALUES (?,?)', ['zzchave'+Date.now()+Math.floor(Math.random()*1e6), 'zz_test_emit']);
    nfId = nf.insertId;
    await db.query('INSERT INTO nf_entrada_itens (nf_id, descricao, quantidade, product_id) VALUES (?,?,?,?)', [nfId, 'ZZTESTE XYZZY FLARGON UNICO', 1, prod]);
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    // item recebido na mão (✓ Chegou), SEM product_id
    const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, nome, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'K1', 'Zzteste Xyzzy Flargon Unico', 1, 1, 'veio']);
    const res = mockRes();
    await rascunhoVenda({ params: { id: p.insertId } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.itens.length, 1);
    assert.strictEqual(res.body.itens[0].product_id, prod, 'ligou o produto por nome via NF');
    // e persistiu no item
    const [[row]] = await db.query('SELECT product_id FROM demanda_itens WHERE id = ?', [i.insertId]);
    assert.strictEqual(row.product_id, prod);
  } finally {
    if (nfId) { await db.query('DELETE FROM nf_entrada_itens WHERE nf_id = ?', [nfId]); await db.query('DELETE FROM nf_entradas WHERE id = ?', [nfId]); }
    await cleanup();
  }
});

test('gerarVendas rejeita payment_method inválido (400)', async () => {
  const res = mockRes();
  await gerarVendas({ body: { payment_method: 'BOLETO' } }, res);
  assert.strictEqual(res.statusCode, 400);
});
