const { test } = require('node:test');
const assert = require('node:assert');
const { aplicaPix, resolvePixPercent } = require('../src/utils/pricing');

// Reproduz a regra de composição usada no criarPix/resumo: desconto só nos produtos, frete intacto.
function comporTotalPix(linhas, fee, pixPct) {
  const linhasPix = linhas.map(l => {
    const unitPrice = aplicaPix(l.unitPrice, pixPct);
    return { unitPrice, qty: l.qty, lineTotal: Number((unitPrice * l.qty).toFixed(2)) };
  });
  const subtotal = Number(linhasPix.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
  return { linhasPix, subtotal, total: Number((subtotal + fee).toFixed(2)) };
}

test('desconto incide só nos produtos; frete intacto', () => {
  const pct = resolvePixPercent(null, { ativo: true, percent: 5 });
  const r = comporTotalPix([{ unitPrice: 100, qty: 2 }], 15, pct); // subtotal 200 -> 190
  assert.strictEqual(r.subtotal, 190);
  assert.strictEqual(r.total, 205); // 190 + 15 frete
  assert.strictEqual(r.linhasPix[0].unitPrice, 95);
});

test('sem desconto (pct 0) o total é o original', () => {
  const r = comporTotalPix([{ unitPrice: 100, qty: 2 }], 15, 0);
  assert.strictEqual(r.subtotal, 200);
  assert.strictEqual(r.total, 215);
});
