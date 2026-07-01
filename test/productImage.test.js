const { test } = require('node:test');
const assert = require('node:assert');
const { setProductImageUrl } = require('../src/controllers/productController');

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

test('setProductImageUrl: id inválido → 400', async () => {
  const res = mockRes();
  await setProductImageUrl({ params: { id: 'abc' }, body: { url: 'http://x/y.png' } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('setProductImageUrl: URL não http/https → 400', async () => {
  const res = mockRes();
  await setProductImageUrl({ params: { id: '1' }, body: { url: 'ftp://x/y.png' } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('setProductImageUrl: URL inacessível → 422 (sem alterar foto)', async () => {
  const res = mockRes();
  await setProductImageUrl({ params: { id: '1' }, body: { url: 'http://127.0.0.1:1/x.png' } }, res);
  assert.strictEqual(res.statusCode, 422);
});
