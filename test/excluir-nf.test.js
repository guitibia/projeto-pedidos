const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { remover } = require('../src/controllers/nfController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}

async function seedNf(estoqueInicial, qtd) {
  const code = 'ZZDEL' + Date.now() + Math.random().toString(36).slice(2, 6);
  const [pr] = await db.query(
    "INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES ('ZZ Del Test', 1, 2, 'Outros', ?, ?)",
    [code, estoqueInicial]);
  const pid = pr.insertId;
  const chave = 'ZZDELNF' + Date.now() + Math.floor(Math.random() * 1e6);
  const [nf] = await db.query(
    "INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero, serie, valor_total, data_emissao, xml) VALUES (?, 'ZZ FORN', '00000000000000', '999', '1', 0, NULL, '')",
    [chave]);
  const nfId = nf.insertId;
  await db.query(
    "INSERT INTO nf_entrada_itens (nf_id, cprod, descricao, ncm, quantidade, valor_unit, valor_total, product_id) VALUES (?, 'C1', 'ITEM', '0', ?, 1, ?, ?)",
    [nfId, qtd, qtd, pid]);
  await db.query(
    "INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao, origem, nf_id) VALUES (?, 'Entrada', ?, 'NF 999', 'NF', ?)",
    [pid, qtd, nfId]);
  return { pid, nfId };
}
async function cleanup(pid) {
  await db.query('DELETE FROM estoque_movimentacoes WHERE product_id=?', [pid]);
  await db.query('DELETE FROM products WHERE id=?', [pid]);
}

test('remover: devolve estoque e apaga a NF', async () => {
  const { pid, nfId } = await seedNf(10, 4);
  const res = mockRes();
  await remover({ params: { id: String(nfId) } }, res);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.produtosAfetados, 1);
  assert.strictEqual(res.body.unidadesDevolvidas, 4);
  const [[p]] = await db.query('SELECT estoque FROM products WHERE id=?', [pid]);
  assert.strictEqual(Number(p.estoque), 6);
  const [[nf]] = await db.query('SELECT COUNT(*) n FROM nf_entradas WHERE id=?', [nfId]);
  assert.strictEqual(nf.n, 0);
  const [[it]] = await db.query('SELECT COUNT(*) n FROM nf_entrada_itens WHERE nf_id=?', [nfId]);
  assert.strictEqual(it.n, 0);
  const [[mv]] = await db.query("SELECT COUNT(*) n FROM estoque_movimentacoes WHERE nf_id=?", [nfId]);
  assert.strictEqual(mv.n, 0);
  await cleanup(pid);
});

test('remover: clamp em 0 quando já vendido', async () => {
  const { pid, nfId } = await seedNf(2, 4);
  const res = mockRes();
  await remover({ params: { id: String(nfId) } }, res);
  const [[p]] = await db.query('SELECT estoque FROM products WHERE id=?', [pid]);
  assert.strictEqual(Number(p.estoque), 0);
  assert.strictEqual(res.body.algumJaMovimentado, true);
  await cleanup(pid);
});

test('remover: id inexistente → 404', async () => {
  const res = mockRes();
  await remover({ params: { id: '999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
