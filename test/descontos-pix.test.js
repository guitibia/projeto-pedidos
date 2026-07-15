const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { get, put } = require('../src/controllers/descontosController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

test('put salva pix e get devolve pixAtivo/pixPercent', async () => {
  let res = mockRes();
  await put({ body: { ativo: false, percent: 0, pixAtivo: true, pixPercent: 7.5 } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mockRes();
  await get({}, res);
  assert.strictEqual(res.body.pixAtivo, true);
  assert.strictEqual(Number(res.body.pixPercent), 7.5);
});

test('put rejeita pixPercent fora de 0..99,99', async () => {
  const res = mockRes();
  await put({ body: { ativo: false, percent: 0, pixAtivo: true, pixPercent: 150 } }, res);
  assert.strictEqual(res.statusCode, 400);
});
