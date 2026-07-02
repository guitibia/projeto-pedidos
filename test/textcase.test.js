const { test } = require('node:test');
const assert = require('node:assert');
const { titleCasePtBr, isShoutingName } = require('../src/utils/textcase');

test('titleCasePtBr: exemplos reais da NF', () => {
  assert.strictEqual(titleCasePtBr('THE BLEND EDP CARDAMOM 100ml'), 'The Blend Edp Cardamom 100ml');
  assert.strictEqual(titleCasePtBr('LILY OL PERF DES CPO 150ml V11'), 'Lily Ol Perf Des Cpo 150ml V11');
  assert.strictEqual(titleCasePtBr('QDB BAT EF MAT BERE 330 4,0g'), 'Qdb Bat Ef Mat Bere 330 4,0g');
  assert.strictEqual(titleCasePtBr('MALBEC DES COL MAGNETIC V3 100ml'), 'Malbec Des Col Magnetic V3 100ml');
});

test('titleCasePtBr: acentos pt-BR', () => {
  assert.strictEqual(titleCasePtBr('ÁGUA DE COLÔNIA'), 'Água De Colônia');
});

test('titleCasePtBr: vazio e null', () => {
  assert.strictEqual(titleCasePtBr(''), '');
  assert.strictEqual(titleCasePtBr(null), '');
});

test('isShoutingName: caixa alta (mesmo com unidade minúscula) é shouting', () => {
  assert.strictEqual(isShoutingName('THE BLEND EDP CARDAMOM 100ml'), true);
  assert.strictEqual(isShoutingName('QDB BAT EF MAT BERE 330 4,0g'), true);
  assert.strictEqual(isShoutingName('MALBEC DES COL MAGNETIC V3 100ml'), true);
});

test('isShoutingName: nome já formatado NÃO é shouting', () => {
  assert.strictEqual(isShoutingName('Creme de Corpo Eudora - 400ml'), false);
  assert.strictEqual(isShoutingName('Batom Una CC Violeta 62'), false);
  assert.strictEqual(isShoutingName('Lapis Labial Una Rosa Pequeno'), false);
});

test('isShoutingName: sem letras é false', () => {
  assert.strictEqual(isShoutingName('330 100'), false);
  assert.strictEqual(isShoutingName(''), false);
});
