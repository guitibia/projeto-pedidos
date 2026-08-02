const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { createPromissoria, listPromissorias } = require('../src/controllers/promissoriaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function cleanup(){
  await db.query("DELETE parc FROM parcelas parc JOIN promissorias p ON p.id=parc.promissoria_id JOIN notas_fiscais nf ON nf.id=p.nota_fiscal_id WHERE nf.fornecedor='zz_test_forn'");
  await db.query("DELETE p FROM promissorias p JOIN notas_fiscais nf ON nf.id=p.nota_fiscal_id WHERE nf.fornecedor='zz_test_forn'");
  await db.query("DELETE FROM notas_fiscais WHERE fornecedor='zz_test_forn'");
}

test('createPromissoria grava numero_boleto quando informado e NULL quando vazio', async () => {
  const res = mockRes();
  await createPromissoria({ body: { fornecedor: 'zz_test_forn', itens: [
    { data_vencimento: '2026-08-10', valor: 100, numero_boleto: 'BOL-123' },
    { data_vencimento: '2026-09-10', valor: 200, numero_boleto: '' },
  ] } }, res);
  assert.strictEqual(res.statusCode, 201);
  const [rows] = await db.query(
    "SELECT parc.numero_boleto, parc.valor FROM parcelas parc JOIN promissorias p ON p.id=parc.promissoria_id JOIN notas_fiscais nf ON nf.id=p.nota_fiscal_id WHERE nf.fornecedor='zz_test_forn' ORDER BY parc.valor");
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].numero_boleto, 'BOL-123');   // valor 100
  assert.strictEqual(rows[1].numero_boleto, null);        // valor 200 (vazio -> null)
  await cleanup();
});

test('listPromissorias retorna numero_boleto na parcela', async () => {
  let res = mockRes();
  await createPromissoria({ body: { fornecedor: 'zz_test_forn', itens: [ { data_vencimento: '2026-08-10', valor: 100, numero_boleto: 'BOL-999' } ] } }, res);
  res = mockRes();
  await listPromissorias({}, res);
  const achou = res.body.some(prom => (prom.parcelas||[]).some(p => p.numero_boleto === 'BOL-999'));
  assert.ok(achou, 'listPromissorias deve trazer numero_boleto');
  await cleanup();
});
