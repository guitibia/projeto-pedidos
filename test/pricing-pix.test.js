const { test } = require('node:test');
const assert = require('node:assert');
const { resolvePixPercent, aplicaPix } = require('../src/utils/pricing');

test('resolvePixPercent: cliente definido vence o global', () => {
  assert.strictEqual(resolvePixPercent(10, { ativo: true, percent: 5 }), 10);
});
test('resolvePixPercent: cliente 0 sobrepõe global ativo (sem desconto)', () => {
  assert.strictEqual(resolvePixPercent(0, { ativo: true, percent: 5 }), 0);
});
test('resolvePixPercent: cliente vazio herda o global', () => {
  assert.strictEqual(resolvePixPercent(null, { ativo: true, percent: 5 }), 5);
  assert.strictEqual(resolvePixPercent('', { ativo: true, percent: 5 }), 5);
  assert.strictEqual(resolvePixPercent(undefined, { ativo: true, percent: 5 }), 5);
});
test('resolvePixPercent: global inativo → 0', () => {
  assert.strictEqual(resolvePixPercent(null, { ativo: false, percent: 5 }), 0);
  assert.strictEqual(resolvePixPercent(null, { ativo: true, percent: 0 }), 0);
});
test('aplicaPix: aplica percentual e arredonda', () => {
  assert.strictEqual(aplicaPix(200, 5), 190);
  assert.strictEqual(aplicaPix(99.99, 10), 89.99);
});
test('aplicaPix: percent 0 mantém valor', () => {
  assert.strictEqual(aplicaPix(200, 0), 200);
  assert.strictEqual(aplicaPix(200, -3), 200);
});
