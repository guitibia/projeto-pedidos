const { test } = require('node:test');
const assert = require('node:assert');
const { conciliar } = require('../src/services/conciliacaoNf');

const L = (id, codigo, pedida, recebida = 0, created_at = id) =>
  ({ id, codigo, qtd_pedida: pedida, qtd_recebida: recebida, created_at });

test('casa exato: recebe tudo', () => {
  const r = conciliar([{ codigo: '8412', qtd: 2 }], [L(1, '8412', 2)]);
  assert.deepStrictEqual(r.alocacoes, [{ demanda_item_id: 1, qtd: 2 }]);
  assert.deepStrictEqual(r.extras, []);
});

test('parcial: recebe menos do que pediu', () => {
  const r = conciliar([{ codigo: '8412', qtd: 1 }], [L(1, '8412', 3)]);
  assert.deepStrictEqual(r.alocacoes, [{ demanda_item_id: 1, qtd: 1 }]);
  assert.deepStrictEqual(r.extras, []);
});

test('falta total: código não veio na NF', () => {
  const r = conciliar([{ codigo: '9999', qtd: 5 }], [L(1, '8412', 2)]);
  assert.deepStrictEqual(r.alocacoes, []);
  assert.deepStrictEqual(r.extras, [{ codigo: '9999', qtd: 5 }]);
});

test('item extra: veio na NF mas ninguém pediu', () => {
  const r = conciliar([{ codigo: '8412', qtd: 4 }], [L(1, '8412', 1)]);
  assert.deepStrictEqual(r.alocacoes, [{ demanda_item_id: 1, qtd: 1 }]);
  assert.deepStrictEqual(r.extras, [{ codigo: '8412', qtd: 3 }]);
});

test('aloca entre 2 clientes por ordem de chegada (pedem 2+1, chega 2 → 2/0)', () => {
  const linhas = [L(10, '8412', 2, 0, 100), L(11, '8412', 1, 0, 200)];
  const r = conciliar([{ codigo: '8412', qtd: 2 }], linhas);
  assert.deepStrictEqual(r.alocacoes, [{ demanda_item_id: 10, qtd: 2 }]);
  assert.deepStrictEqual(r.extras, []);
});

test('acúmulo: linha já com recebido parcial só ganha o que falta', () => {
  // pediu 3, já recebeu 1 numa NF anterior; nova NF traz 5 → aloca só 2, sobra 3
  const r = conciliar([{ codigo: '8412', qtd: 5 }], [L(1, '8412', 3, 1)]);
  assert.deepStrictEqual(r.alocacoes, [{ demanda_item_id: 1, qtd: 2 }]);
  assert.deepStrictEqual(r.extras, [{ codigo: '8412', qtd: 3 }]);
});

test('código com espaços/caixa diferente ainda casa', () => {
  const r = conciliar([{ codigo: ' 8412 ' }].map(x => ({ ...x, qtd: 1 })),
                      [L(1, '8412', 1)]);
  assert.deepStrictEqual(r.alocacoes, [{ demanda_item_id: 1, qtd: 1 }]);
});
