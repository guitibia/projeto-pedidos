# Pedidos das Clientes + Conciliação com a NF — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registrar o que cada cliente pede (por cliente), agrupar por fornecedor para comprar, e ao importar a NF conciliar automaticamente pelo código do fornecedor — mostrando o que veio/faltou por cliente e por fornecedor, com geração de venda (rascunho) e aviso no WhatsApp.

**Architecture:** Três tabelas novas (`demanda_pedidos`, `demanda_itens`, `demanda_conciliacoes`). O casamento fica numa função pura (`src/services/conciliacaoNf.js`) testável sozinha; um controller (`demandaController.js`) faz o CRUD/relatórios e um helper (`aplicarConciliacao`) é chamado por `nfController.importar` atrás de uma flag `conciliar`. A tela (`demanda.html`) segue o padrão do painel. A venda reusa o fluxo atual de pedidos/estoque.

**Tech Stack:** Node/Express (CommonJS), MySQL (`mysql2/promise`), testes com `node:test` + `node:assert`, front vanilla JS + Bootstrap 5 + SweetAlert2 (`Auth.apiFetch`, `esc`).

## Global Constraints

- Branch `Teste` apenas; banco `db_pedidos_teste`. NUNCA commitar/mergear em `main` sem pedido explícito do usuário.
- Migrações são idempotentes: só `CREATE TABLE IF NOT EXISTS` (e `ALTER` dentro de `try/catch` quando houver), no bloco de migrações de `src/database/connection.js`.
- Casamento SEMPRE escopo por fornecedor (`fornecedor_cnpj`), nunca por código solto.
- Conciliação NUNCA pode derrubar a importação da NF: fica atrás da flag `conciliar` e num `try/catch` que loga e segue (o estoque já somado permanece).
- Sem novas dependências npm. Reusar `authMiddleware`, `Auth.apiFetch`, `esc`, `orderController`, `nf_entrada_itens`/`nf_item_vinculos`.
- Testes usam seeds com prefixo `zz_test_` e fazem cleanup ao final.
- Rodar testes: `node --test test/<arquivo>.test.js` (precisa `.env` com credenciais do banco de teste; o `connection.js` escolhe `db_pedidos_teste` na branch `Teste`).
- Libere a porta 3000 (mate o `node`) após qualquer teste que suba o servidor, para não quebrar o `npm run dev` do usuário.

---

## File Structure

- `src/services/conciliacaoNf.js` — **NOVO**. Função pura `conciliar(nfItens, linhasPendentes)`.
- `src/controllers/demandaController.js` — **NOVO**. CRUD de pedidos/itens, lista de compra, fornecedores, relatório, `aplicarConciliacao`, rascunho-venda, marcar venda, remanejo.
- `src/routes/demanda.js` — **NOVO**. Rotas REST.
- `src/database/connection.js` — **MODIFICAR**. Bloco de migração das 3 tabelas.
- `src/app.js` — **MODIFICAR**. Registrar `/api/demanda`.
- `src/controllers/nfController.js` — **MODIFICAR**. Gancho de conciliação atrás da flag.
- `src/public/demanda.html` — **NOVO**. Tela (abas Pedidos / Comprar / Conciliação).
- `src/public/notas.html` — **MODIFICAR**. Checkbox "Conciliar com pedidos das clientes".
- `src/public/painel.html` — **MODIFICAR**. Item de menu para a nova tela.
- Testes: `test/conciliacao-service.test.js`, `test/demanda-controller.test.js`, `test/demanda-conciliacao-nf.test.js`, `test/demanda-venda.test.js`.

---

## ONDA 1 — Núcleo (registro + lista de compra + conciliação + relatório)

### Task 1: Migração das 3 tabelas

**Files:**
- Modify: `src/database/connection.js` (após o bloco de migração de EAN, ~linha 206)
- Test: `test/demanda-controller.test.js` (um teste de fumaça de existência das tabelas; o restante do arquivo cresce na Task 3)

**Interfaces:**
- Produces: tabelas `demanda_pedidos(id, client_id, observacao, status, created_at)`,
  `demanda_itens(id, pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, nome, qtd_pedida, qtd_recebida, preco_venda, product_id, status, order_id, created_at)`,
  `demanda_conciliacoes(id, nf_id, demanda_item_id, qtd, created_at, UNIQUE(nf_id, demanda_item_id))`.

- [ ] **Step 1: Escrever o teste de fumaça (falha primeiro)**

Criar `test/demanda-controller.test.js` com:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');

test('migração criou as tabelas de demanda', async () => {
  for (const t of ['demanda_pedidos', 'demanda_itens', 'demanda_conciliacoes']) {
    const [rows] = await db.query('SHOW TABLES LIKE ?', [t]);
    assert.strictEqual(rows.length, 1, `tabela ${t} deve existir`);
  }
});
```

- [ ] **Step 2: Rodar o teste e ver falhar**

Run: `node --test test/demanda-controller.test.js`
Expected: FAIL (tabelas ainda não existem) — a asserção de `demanda_pedidos` falha.

- [ ] **Step 3: Adicionar o bloco de migração**

Em `src/database/connection.js`, logo após o bloco `// Migração: EAN nos produtos e itens de NF` (o `for (const sql of [...])` que termina na linha ~206), inserir:

```js
    // Migração: pedidos das clientes + conciliação com a NF
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS demanda_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, observacao VARCHAR(255) NULL, status VARCHAR(12) NOT NULL DEFAULT 'aberto', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (client_id))",
      "CREATE TABLE IF NOT EXISTS demanda_itens (id INT AUTO_INCREMENT PRIMARY KEY, pedido_id INT NOT NULL, fornecedor_cnpj VARCHAR(14) NULL, fornecedor_nome VARCHAR(160) NULL, codigo VARCHAR(60) NOT NULL, nome VARCHAR(200) NULL, qtd_pedida INT NOT NULL, qtd_recebida INT NOT NULL DEFAULT 0, preco_venda DECIMAL(10,2) NULL, product_id INT NULL, status VARCHAR(12) NOT NULL DEFAULT 'pendente', order_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (pedido_id), INDEX (fornecedor_cnpj, codigo))",
      "CREATE TABLE IF NOT EXISTS demanda_conciliacoes (id INT AUTO_INCREMENT PRIMARY KEY, nf_id INT NOT NULL, demanda_item_id INT NOT NULL, qtd INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_nf_item (nf_id, demanda_item_id))",
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 4: Rodar o teste e ver passar**

Run: `node --test test/demanda-controller.test.js`
Expected: PASS (a migração roda no boot do pool ao dar `require('../src/database/connection')`).

- [ ] **Step 5: Commit**

```bash
git add src/database/connection.js test/demanda-controller.test.js
git commit -m "feat(demanda): migração das tabelas de pedidos das clientes e conciliação"
```

---

### Task 2: Serviço puro de conciliação

**Files:**
- Create: `src/services/conciliacaoNf.js`
- Test: `test/conciliacao-service.test.js`

**Interfaces:**
- Produces: `conciliar(nfItens, linhasPendentes)` →
  - `nfItens`: `Array<{codigo:string, qtd:number}>`
  - `linhasPendentes`: `Array<{id:number, codigo:string, qtd_pedida:number, qtd_recebida:number, created_at:(string|number|Date)}>`
  - retorna `{ alocacoes: Array<{demanda_item_id:number, qtd:number}>, extras: Array<{codigo:string, qtd:number}> }`
  - Regra: por código, distribui a qtd recebida entre as linhas em ordem de `created_at` (mais antiga primeiro; `id` desempata), respeitando `qtd_pedida - qtd_recebida`. Sobra vai para `extras`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `test/conciliacao-service.test.js`:

```js
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
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/conciliacao-service.test.js`
Expected: FAIL ("Cannot find module '../src/services/conciliacaoNf'").

- [ ] **Step 3: Implementar o serviço**

Criar `src/services/conciliacaoNf.js`:

```js
'use strict';

function norm(s) { return String(s == null ? '' : s).trim().toLowerCase(); }

/**
 * Concilia itens recebidos numa NF contra as linhas de demanda pendentes de UM fornecedor.
 * Função pura: sem banco, sem HTTP.
 */
function conciliar(nfItens, linhasPendentes) {
  const alocacoes = [];
  const extras = [];

  const porCodigo = new Map();
  for (const l of linhasPendentes) {
    const cod = norm(l.codigo);
    if (!porCodigo.has(cod)) porCodigo.set(cod, []);
    // cópia local para não mutar o input do chamador
    porCodigo.get(cod).push({ id: l.id, qtd_pedida: Number(l.qtd_pedida) || 0,
      qtd_recebida: Number(l.qtd_recebida) || 0, created_at: l.created_at });
  }
  for (const arr of porCodigo.values()) {
    arr.sort((a, b) => {
      const ta = new Date(a.created_at).getTime() || 0;
      const tb = new Date(b.created_at).getTime() || 0;
      if (ta !== tb) return ta - tb;
      return (a.id || 0) - (b.id || 0);
    });
  }

  for (const item of nfItens) {
    let disponivel = Math.max(0, Math.floor(Number(item.qtd) || 0));
    const linhas = porCodigo.get(norm(item.codigo)) || [];
    for (const l of linhas) {
      if (disponivel <= 0) break;
      const falta = Math.max(0, l.qtd_pedida - l.qtd_recebida);
      if (falta <= 0) continue;
      const dar = Math.min(falta, disponivel);
      if (dar > 0) {
        alocacoes.push({ demanda_item_id: l.id, qtd: dar });
        l.qtd_recebida += dar;
        disponivel -= dar;
      }
    }
    if (disponivel > 0) extras.push({ codigo: item.codigo, qtd: disponivel });
  }

  return { alocacoes, extras };
}

module.exports = { conciliar };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/conciliacao-service.test.js`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add src/services/conciliacaoNf.js test/conciliacao-service.test.js
git commit -m "feat(demanda): serviço puro de conciliação NF x pedidos (com testes)"
```

---

### Task 3: CRUD de pedidos/itens + fornecedores (controller + rotas)

**Files:**
- Create: `src/controllers/demandaController.js`
- Create: `src/routes/demanda.js`
- Modify: `src/app.js` (registrar a rota)
- Test: `test/demanda-controller.test.js` (adicionar testes)

**Interfaces:**
- Produces (controller exporta): `criarPedido, listarPedidos, getPedido, addItem, updateItem, deleteItem, listarFornecedores` (as demais funções entram nas Tasks 4/5/7/8).
- Consumes: `db = require('../database/connection')`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Adicionar ao final de `test/demanda-controller.test.js`:

```js
const {
  criarPedido, getPedido, addItem, updateItem, deleteItem, listarPedidos, listarFornecedores
} = require('../src/controllers/demandaController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; } };
}
async function seedClient() {
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_' + Date.now()]);
  return r.insertId;
}
async function cleanupDemanda() {
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('criarPedido + addItem + getPedido devolve itens', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId, observacao: 'teste' } }, res);
  assert.strictEqual(res.statusCode, 201);
  const pedidoId = res.body.id;

  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { fornecedor_nome: 'Natura', fornecedor_cnpj: '12345678000199', codigo: '8412', nome: 'Batom', qtd_pedida: 2, preco_venda: 30 } }, res);
  assert.strictEqual(res.statusCode, 201);

  res = mockRes();
  await getPedido({ params: { id: pedidoId } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.itens.length, 1);
  assert.strictEqual(res.body.itens[0].codigo, '8412');
  await cleanupDemanda();
});

test('addItem rejeita qtd inválida (400)', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId } }, res);
  const pedidoId = res.body.id;
  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { codigo: '1', qtd_pedida: 0 } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanupDemanda();
});

test('criarPedido rejeita cliente inexistente (400)', async () => {
  const res = mockRes();
  await criarPedido({ body: { client_id: 999999999 } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('deleteItem remove o item', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId } }, res);
  const pedidoId = res.body.id;
  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { codigo: '8412', qtd_pedida: 1 } }, res);
  const itemId = res.body.id;
  res = mockRes();
  await deleteItem({ params: { itemId } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mockRes();
  await getPedido({ params: { id: pedidoId } }, res);
  assert.strictEqual(res.body.itens.length, 0);
  await cleanupDemanda();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-controller.test.js`
Expected: FAIL ("Cannot find module '../src/controllers/demandaController'").

- [ ] **Step 3: Implementar o controller (parte 1) e as rotas**

Criar `src/controllers/demandaController.js`:

```js
const db = require('../database/connection');
const { conciliar } = require('../services/conciliacaoNf');

// POST /api/demanda
async function criarPedido(req, res) {
  const clientId = parseInt(req.body.client_id, 10);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'Cliente inválido.' });
  const obs = req.body.observacao ? String(req.body.observacao).slice(0, 255) : null;
  try {
    const [[cli]] = await db.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!cli) return res.status(400).json({ error: 'Cliente não encontrado.' });
    const [r] = await db.query('INSERT INTO demanda_pedidos (client_id, observacao) VALUES (?, ?)', [clientId, obs]);
    return res.status(201).json({ id: r.insertId });
  } catch (e) { console.error('criarPedido', e); return res.status(500).json({ error: 'Erro ao criar pedido.' }); }
}

// GET /api/demanda
async function listarPedidos(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT dp.id, dp.client_id, c.name AS client_name, dp.observacao, dp.status, dp.created_at,
              (SELECT COUNT(*) FROM demanda_itens i WHERE i.pedido_id = dp.id) AS qtd_itens
       FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id
       ORDER BY dp.created_at DESC LIMIT 300`);
    return res.json(rows);
  } catch (e) { console.error('listarPedidos', e); return res.status(500).json({ error: 'Erro ao listar.' }); }
}

// GET /api/demanda/:id
async function getPedido(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[ped]] = await db.query(
      'SELECT dp.id, dp.client_id, c.name AS client_name, c.phone, dp.observacao, dp.status, dp.created_at FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id WHERE dp.id = ?', [id]);
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [itens] = await db.query(
      'SELECT id, fornecedor_cnpj, fornecedor_nome, codigo, nome, qtd_pedida, qtd_recebida, preco_venda, product_id, status, order_id FROM demanda_itens WHERE pedido_id = ? ORDER BY id', [id]);
    return res.json(Object.assign({}, ped, { itens }));
  } catch (e) { console.error('getPedido', e); return res.status(500).json({ error: 'Erro.' }); }
}

// POST /api/demanda/:id/itens
async function addItem(req, res) {
  const pedidoId = parseInt(req.params.id, 10);
  if (!Number.isInteger(pedidoId)) return res.status(400).json({ error: 'Pedido inválido.' });
  const b = req.body || {};
  const codigo = String(b.codigo || '').trim();
  const qtd = parseInt(b.qtd_pedida, 10);
  if (!codigo) return res.status(400).json({ error: 'Informe o código do produto.' });
  if (!Number.isInteger(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const preco = b.preco_venda == null || b.preco_venda === '' ? null : Number(b.preco_venda);
  if (preco != null && (isNaN(preco) || preco < 0)) return res.status(400).json({ error: 'Preço inválido.' });
  const cnpj = b.fornecedor_cnpj ? String(b.fornecedor_cnpj).replace(/\D/g, '').slice(0, 14) : null;
  try {
    const [[ped]] = await db.query('SELECT id FROM demanda_pedidos WHERE id = ?', [pedidoId]);
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [r] = await db.query(
      'INSERT INTO demanda_itens (pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, nome, qtd_pedida, preco_venda) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pedidoId, cnpj || null, b.fornecedor_nome ? String(b.fornecedor_nome).slice(0, 160) : null,
       codigo.slice(0, 60), b.nome ? String(b.nome).slice(0, 200) : null, qtd, preco]);
    return res.status(201).json({ id: r.insertId });
  } catch (e) { console.error('addItem', e); return res.status(500).json({ error: 'Erro ao adicionar item.' }); }
}

// PUT /api/demanda/itens/:itemId
async function updateItem(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  const b = req.body || {};
  const qtd = parseInt(b.qtd_pedida, 10);
  if (!Number.isInteger(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const preco = b.preco_venda == null || b.preco_venda === '' ? null : Number(b.preco_venda);
  if (preco != null && (isNaN(preco) || preco < 0)) return res.status(400).json({ error: 'Preço inválido.' });
  try {
    const [r] = await db.query(
      'UPDATE demanda_itens SET fornecedor_nome = ?, fornecedor_cnpj = ?, codigo = ?, nome = ?, qtd_pedida = ?, preco_venda = ? WHERE id = ?',
      [b.fornecedor_nome ? String(b.fornecedor_nome).slice(0, 160) : null,
       b.fornecedor_cnpj ? String(b.fornecedor_cnpj).replace(/\D/g, '').slice(0, 14) : null,
       String(b.codigo || '').trim().slice(0, 60), b.nome ? String(b.nome).slice(0, 200) : null, qtd, preco, itemId]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Item não encontrado.' });
    return res.json({ ok: true });
  } catch (e) { console.error('updateItem', e); return res.status(500).json({ error: 'Erro ao atualizar item.' }); }
}

// DELETE /api/demanda/itens/:itemId
async function deleteItem(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  try {
    const [r] = await db.query('DELETE FROM demanda_itens WHERE id = ?', [itemId]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Item não encontrado.' });
    return res.json({ ok: true });
  } catch (e) { console.error('deleteItem', e); return res.status(500).json({ error: 'Erro ao remover item.' }); }
}

// GET /api/demanda/fornecedores  — do histórico de NFs
async function listarFornecedores(req, res) {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT emitente_nome AS nome, emitente_cnpj AS cnpj FROM nf_entradas WHERE emitente_cnpj IS NOT NULL AND emitente_cnpj <> '' ORDER BY emitente_nome");
    return res.json(rows);
  } catch (e) { console.error('listarFornecedores', e); return res.status(500).json({ error: 'Erro.' }); }
}

module.exports = {
  criarPedido, listarPedidos, getPedido, addItem, updateItem, deleteItem, listarFornecedores,
};
```

Criar `src/routes/demanda.js` (a ordem importa: rotas fixas antes de `/:id`):

```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/demandaController');

// rotas fixas ANTES de /:id para não serem capturadas pelo parâmetro
router.get('/fornecedores', c.listarFornecedores);

router.post('/', c.criarPedido);
router.get('/', c.listarPedidos);
router.post('/:id/itens', c.addItem);
router.get('/:id', c.getPedido);
router.put('/itens/:itemId', c.updateItem);
router.delete('/itens/:itemId', c.deleteItem);

module.exports = router;
```

Em `src/app.js`, junto aos outros `app.use('/api/...', apiLimiter, auth, ...)` (após a linha do `/api/nf`, ~linha 77), adicionar:

```js
const demandaRoutes = require('./routes/demanda');
app.use('/api/demanda', apiLimiter, auth, demandaRoutes);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-controller.test.js`
Expected: PASS (todos, incluindo o de fumaça da Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js src/app.js test/demanda-controller.test.js
git commit -m "feat(demanda): CRUD de pedidos das clientes + fornecedores"
```

---

### Task 4: Lista de compra e relatório veio×faltou

**Files:**
- Modify: `src/controllers/demandaController.js` (adicionar `listaCompra`, `relatorio`)
- Modify: `src/routes/demanda.js` (registrar as rotas fixas)
- Test: `test/demanda-controller.test.js` (adicionar testes)

**Interfaces:**
- Produces: `listaCompra(req,res)` → `GET /api/demanda/compra` retorna
  `[{ fornecedor_nome, fornecedor_cnpj, itens: [{ codigo, nome, qtd_total, clientes: [{ client_name, qtd }] }] }]`
  (só linhas com `status IN ('pendente','parcial')`).
  `relatorio(req,res)` → `GET /api/demanda/relatorio` retorna
  `{ porCliente: [...], porFornecedor: [...] }`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Adicionar a `test/demanda-controller.test.js`:

```js
const { listaCompra, relatorio } = require('../src/controllers/demandaController');

test('listaCompra agrupa linhas pendentes por fornecedor', async () => {
  const clientId = await seedClient();
  let res = mockRes();
  await criarPedido({ body: { client_id: clientId } }, res);
  const pedidoId = res.body.id;
  res = mockRes();
  await addItem({ params: { id: pedidoId }, body: { fornecedor_nome: 'Natura', fornecedor_cnpj: '11111111000191', codigo: 'AA1', nome: 'Batom', qtd_pedida: 2 } }, res);

  res = mockRes();
  await listaCompra({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  const forn = res.body.find(f => f.fornecedor_cnpj === '11111111000191');
  assert.ok(forn, 'fornecedor presente');
  const it = forn.itens.find(i => i.codigo === 'AA1');
  assert.strictEqual(it.qtd_total, 2);
  assert.strictEqual(it.clientes.length, 1);
  await cleanupDemanda();
});

test('relatorio devolve visões por cliente e por fornecedor', async () => {
  const res = mockRes();
  await relatorio({ query: {} }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.porCliente));
  assert.ok(Array.isArray(res.body.porFornecedor));
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-controller.test.js`
Expected: FAIL ("listaCompra is not a function").

- [ ] **Step 3: Implementar `listaCompra` e `relatorio`**

Adicionar em `src/controllers/demandaController.js` (antes do `module.exports`):

```js
// GET /api/demanda/compra
async function listaCompra(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT di.fornecedor_cnpj, di.fornecedor_nome, di.codigo, di.nome,
              (di.qtd_pedida - di.qtd_recebida) AS falta, c.name AS client_name
       FROM demanda_itens di
       JOIN demanda_pedidos dp ON dp.id = di.pedido_id
       JOIN clients c ON c.id = dp.client_id
       WHERE di.status IN ('pendente','parcial') AND (di.qtd_pedida - di.qtd_recebida) > 0
       ORDER BY di.fornecedor_nome, di.codigo, di.id`);
    const mapF = new Map();
    for (const r of rows) {
      const fk = r.fornecedor_cnpj || ('nome:' + (r.fornecedor_nome || '?'));
      if (!mapF.has(fk)) mapF.set(fk, { fornecedor_cnpj: r.fornecedor_cnpj, fornecedor_nome: r.fornecedor_nome, itens: new Map() });
      const forn = mapF.get(fk);
      const ck = String(r.codigo);
      if (!forn.itens.has(ck)) forn.itens.set(ck, { codigo: r.codigo, nome: r.nome, qtd_total: 0, clientes: [] });
      const it = forn.itens.get(ck);
      it.qtd_total += Number(r.falta) || 0;
      it.clientes.push({ client_name: r.client_name, qtd: Number(r.falta) || 0 });
    }
    const out = [...mapF.values()].map(f => ({ fornecedor_cnpj: f.fornecedor_cnpj, fornecedor_nome: f.fornecedor_nome, itens: [...f.itens.values()] }));
    return res.json(out);
  } catch (e) { console.error('listaCompra', e); return res.status(500).json({ error: 'Erro na lista de compra.' }); }
}

// GET /api/demanda/relatorio
async function relatorio(req, res) {
  try {
    const [porCliente] = await db.query(
      `SELECT c.name AS client_name, dp.id AS pedido_id,
              SUM(CASE WHEN di.status='veio' THEN 1 ELSE 0 END) AS itens_veio,
              SUM(CASE WHEN di.status='parcial' THEN 1 ELSE 0 END) AS itens_parcial,
              SUM(CASE WHEN di.status IN ('pendente','faltou') THEN 1 ELSE 0 END) AS itens_faltou,
              COUNT(*) AS itens_total
       FROM demanda_itens di
       JOIN demanda_pedidos dp ON dp.id = di.pedido_id
       JOIN clients c ON c.id = dp.client_id
       GROUP BY dp.id, c.name
       ORDER BY dp.created_at DESC LIMIT 300`);
    const [porFornecedor] = await db.query(
      `SELECT COALESCE(fornecedor_nome, '(sem fornecedor)') AS fornecedor_nome, fornecedor_cnpj,
              SUM(qtd_pedida) AS qtd_pedida, SUM(qtd_recebida) AS qtd_recebida,
              SUM(qtd_pedida - qtd_recebida) AS qtd_faltou
       FROM demanda_itens
       GROUP BY fornecedor_nome, fornecedor_cnpj
       ORDER BY fornecedor_nome LIMIT 300`);
    return res.json({ porCliente, porFornecedor });
  } catch (e) { console.error('relatorio', e); return res.status(500).json({ error: 'Erro no relatório.' }); }
}
```

Acrescentar ao `module.exports`: `listaCompra, relatorio`.

Em `src/routes/demanda.js`, adicionar entre as rotas fixas (antes de `/:id`):

```js
router.get('/compra', c.listaCompra);
router.get('/relatorio', c.relatorio);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-controller.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js test/demanda-controller.test.js
git commit -m "feat(demanda): lista de compra por fornecedor + relatório veio x faltou"
```

---

### Task 5: Gancho de conciliação na importação da NF

**Files:**
- Modify: `src/controllers/demandaController.js` (adicionar `aplicarConciliacao` + `recalcularStatusPedido`)
- Modify: `src/controllers/nfController.js` (chamar o gancho atrás da flag, dentro da transação)
- Test: `test/demanda-conciliacao-nf.test.js`

**Interfaces:**
- Produces: `aplicarConciliacao(conn, nfId, emitenteCnpj)` — usa a MESMA conexão/transação da importação; grava em `demanda_conciliacoes` (idempotente), atualiza `qtd_recebida`/`status` das linhas e o `status` do pedido pai. Não retorna valor.
- Consumes: `conciliar(...)` da Task 2; itens em `nf_entrada_itens(nf_id, cprod, quantidade, product_id)`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/demanda-conciliacao-nf.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { aplicarConciliacao } = require('../src/controllers/demandaController');

const CNPJ = '22222222000122';
async function seedClient() {
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_' + Date.now() + Math.random()]);
  return r.insertId;
}
async function seedPedidoComItem(clientId, codigo, qtd) {
  const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [clientId]);
  const [i] = await db.query(
    'INSERT INTO demanda_itens (pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, qtd_pedida) VALUES (?, ?, ?, ?, ?)',
    [p.insertId, CNPJ, 'ZZ Fornecedor', codigo, qtd]);
  return { pedidoId: p.insertId, itemId: i.insertId };
}
async function seedNf(itens) { // itens: [{cprod, qtd}]
  const chave = 'zz' + Date.now() + Math.floor(Math.random()*1e9);
  const [n] = await db.query('INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero) VALUES (?, ?, ?, ?)',
    [String(chave).slice(0,44), 'ZZ Fornecedor', CNPJ, '1']);
  for (const it of itens) {
    await db.query('INSERT INTO nf_entrada_itens (nf_id, cprod, quantidade) VALUES (?, ?, ?)', [n.insertId, it.cprod, it.qtd]);
  }
  return n.insertId;
}
async function cleanup() {
  await db.query("DELETE FROM demanda_conciliacoes WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)", [CNPJ]);
  await db.query("DELETE FROM nf_entrada_itens WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)", [CNPJ]);
  await db.query("DELETE FROM nf_entradas WHERE emitente_cnpj = ?", [CNPJ]);
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('conciliação marca veio/parcial e é idempotente', async () => {
  const cli = await seedClient();
  const { itemId } = await seedPedidoComItem(cli, 'K10', 3);
  const nfId = await seedNf([{ cprod: 'K10', qtd: 2 }]);

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    await aplicarConciliacao(conn, nfId, CNPJ);
    await conn.commit();
  } finally { conn.release(); }

  let [[row]] = await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?', [itemId]);
  assert.strictEqual(Number(row.qtd_recebida), 2);
  assert.strictEqual(row.status, 'parcial');

  // reprocessar a MESMA NF não conta em dobro
  const conn2 = await db.getConnection();
  try {
    await conn2.beginTransaction();
    await aplicarConciliacao(conn2, nfId, CNPJ);
    await conn2.commit();
  } finally { conn2.release(); }
  [[row]] = await db.query('SELECT qtd_recebida FROM demanda_itens WHERE id = ?', [itemId]);
  assert.strictEqual(Number(row.qtd_recebida), 2, 'idempotente: continua 2');
  await cleanup();
});

test('conciliação fecha o item (veio) e conclui o pedido', async () => {
  const cli = await seedClient();
  const { pedidoId, itemId } = await seedPedidoComItem(cli, 'K20', 2);
  const nfId = await seedNf([{ cprod: 'K20', qtd: 2 }]);
  const conn = await db.getConnection();
  try { await conn.beginTransaction(); await aplicarConciliacao(conn, nfId, CNPJ); await conn.commit(); }
  finally { conn.release(); }
  const [[item]] = await db.query('SELECT status FROM demanda_itens WHERE id = ?', [itemId]);
  const [[ped]] = await db.query('SELECT status FROM demanda_pedidos WHERE id = ?', [pedidoId]);
  assert.strictEqual(item.status, 'veio');
  assert.strictEqual(ped.status, 'concluido');
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-conciliacao-nf.test.js`
Expected: FAIL ("aplicarConciliacao is not a function").

- [ ] **Step 3: Implementar `aplicarConciliacao` + `recalcularStatusPedido`**

Adicionar em `src/controllers/demandaController.js` (antes do `module.exports`):

```js
// Helper: recalcula o status do pedido pai a partir das suas linhas.
async function recalcularStatusPedido(conn, pedidoId) {
  const [itens] = await conn.query('SELECT qtd_recebida, status FROM demanda_itens WHERE pedido_id = ?', [pedidoId]);
  if (!itens.length) return;
  const algumRecebido = itens.some(i => Number(i.qtd_recebida) > 0);
  const todosVieram = itens.every(i => i.status === 'veio');
  const status = todosVieram ? 'concluido' : (algumRecebido ? 'parcial' : 'aberto');
  await conn.query('UPDATE demanda_pedidos SET status = ? WHERE id = ?', [status, pedidoId]);
}

// Chamado por nfController.importar, DENTRO da mesma transação, atrás da flag `conciliar`.
async function aplicarConciliacao(conn, nfId, emitenteCnpj) {
  if (!emitenteCnpj) return;
  const [nfItensRows] = await conn.query(
    'SELECT cprod AS codigo, SUM(quantidade) AS qtd, MAX(product_id) AS product_id FROM nf_entrada_itens WHERE nf_id = ? GROUP BY cprod', [nfId]);
  const [linhas] = await conn.query(
    "SELECT id, codigo, qtd_pedida, qtd_recebida, created_at, product_id, pedido_id FROM demanda_itens WHERE fornecedor_cnpj = ? AND status IN ('pendente','parcial') ORDER BY created_at, id", [emitenteCnpj]);
  if (!linhas.length || !nfItensRows.length) return;

  const nfItens = nfItensRows.map(r => ({ codigo: r.codigo, qtd: Number(r.qtd) }));
  const { alocacoes } = conciliar(nfItens, linhas);

  const prodPorCod = new Map(nfItensRows.map(r => [String(r.codigo).trim().toLowerCase(), r.product_id]));
  const linhaPorId = new Map(linhas.map(l => [l.id, l]));
  const pedidosAfetados = new Set();

  for (const a of alocacoes) {
    const [ins] = await conn.query('INSERT IGNORE INTO demanda_conciliacoes (nf_id, demanda_item_id, qtd) VALUES (?, ?, ?)', [nfId, a.demanda_item_id, a.qtd]);
    if (ins.affectedRows === 0) continue; // já contado numa importação anterior (idempotência)
    const linha = linhaPorId.get(a.demanda_item_id);
    const novoRecebido = (Number(linha.qtd_recebida) || 0) + a.qtd;
    const novoStatus = novoRecebido >= Number(linha.qtd_pedida) ? 'veio' : 'parcial';
    const pid = linha.product_id || prodPorCod.get(String(linha.codigo).trim().toLowerCase()) || null;
    await conn.query('UPDATE demanda_itens SET qtd_recebida = ?, status = ?, product_id = COALESCE(product_id, ?) WHERE id = ?',
      [novoRecebido, novoStatus, pid, a.demanda_item_id]);
    linha.qtd_recebida = novoRecebido;
    pedidosAfetados.add(linha.pedido_id);
  }
  for (const pid of pedidosAfetados) await recalcularStatusPedido(conn, pid);
}
```

Acrescentar ao `module.exports`: `aplicarConciliacao`.

Em `src/controllers/nfController.js`, dentro de `importar`, logo APÓS o `for (const it of nf.itens) { ... }` fechar (linha ~106) e ANTES do `await conn.commit();` (linha ~108), inserir:

```js
        // Conciliação opcional com os pedidos das clientes (não pode derrubar a importação).
        if (String(req.body.conciliar) === 'true' || String(req.body.conciliar) === '1') {
          try {
            const { aplicarConciliacao } = require('./demandaController');
            await aplicarConciliacao(conn, nfId, nf.emitente.cnpj);
          } catch (e) {
            console.error('Conciliação falhou (NF importada mesmo assim):', e);
          }
        }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-conciliacao-nf.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/controllers/nfController.js test/demanda-conciliacao-nf.test.js
git commit -m "feat(demanda): conciliação automática ao importar NF (idempotente, atrás de flag)"
```

---

### Task 6: Tela `demanda.html` (Onda 1) + menu + checkbox na NF

**Files:**
- Create: `src/public/demanda.html`
- Modify: `src/public/painel.html` (item de menu apontando para `demanda.html`)
- Modify: `src/public/notas.html` (checkbox "Conciliar com pedidos das clientes" no form de importar; enviar `conciliar` no FormData)
- Test: verificação manual no navegador (o projeto não tem testes de UI) + `node -c` de sanidade não se aplica a HTML; validar via smoke abaixo.

**Interfaces:**
- Consumes: endpoints `POST/GET /api/demanda`, `GET /api/demanda/:id`, `POST /api/demanda/:id/itens`, `PUT/DELETE /api/demanda/itens/:itemId`, `GET /api/demanda/compra`, `GET /api/demanda/fornecedores`, `GET /api/demanda/relatorio`, e `GET /api/clients` (lista de clientes).
- Reusa: `/js/auth.js` (`Auth.apiFetch`, `Auth.getUser`), `esc()`, Bootstrap 5, SweetAlert2, `/css/styles.css`.

- [ ] **Step 1: Criar `src/public/demanda.html`**

Copiar a casca (sidebar + `<head>` com Bootstrap/SweetAlert/`/js/auth.js`/`/css/styles.css`) de uma tela existente como `src/public/notas.html` para manter o padrão, e usar este corpo/scripts (3 abas). Conteúdo completo:

```html
<!-- Reaproveite a MESMA estrutura de <head>, sidebar e proteção de auth de notas.html.
     Abaixo, apenas o conteúdo principal (dentro de <main>) e o <script> da página. -->
<ul class="nav nav-tabs mb-3" id="demandaTabs">
  <li class="nav-item"><button class="nav-link active" data-tab="pedidos">Pedidos</button></li>
  <li class="nav-item"><button class="nav-link" data-tab="comprar">Comprar</button></li>
  <li class="nav-item"><button class="nav-link" data-tab="relatorio">Conciliação / Relatório</button></li>
</ul>

<section id="tab-pedidos">
  <div class="d-flex gap-2 mb-3">
    <select id="novo-cliente" class="form-select" style="max-width:320px"></select>
    <input id="novo-obs" class="form-control" placeholder="Observação (opcional)" style="max-width:280px">
    <button id="btn-novo-pedido" class="btn btn-primary">Novo pedido</button>
  </div>
  <div id="lista-pedidos"></div>
</section>

<section id="tab-comprar" class="d-none"><div id="lista-compra"></div></section>
<section id="tab-relatorio" class="d-none"><div id="conteudo-relatorio"></div></section>

<script>
const $ = s => document.querySelector(s);
function show(tab){
  for (const s of ['pedidos','comprar','relatorio']) $('#tab-'+s).classList.toggle('d-none', s!==tab);
  document.querySelectorAll('#demandaTabs .nav-link').forEach(b => b.classList.toggle('active', b.dataset.tab===tab));
  if (tab==='comprar') carregarCompra();
  if (tab==='relatorio') carregarRelatorio();
}
document.querySelectorAll('#demandaTabs .nav-link').forEach(b => b.onclick = () => show(b.dataset.tab));

let clientes = [];
async function carregarClientes(){
  const r = await Auth.apiFetch('/api/clients'); clientes = await r.json();
  $('#novo-cliente').innerHTML = '<option value="">Escolha a cliente…</option>' +
    clientes.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
}
let fornecedores = [];
async function carregarFornecedores(){
  const r = await Auth.apiFetch('/api/demanda/fornecedores'); fornecedores = await r.json();
}

async function carregarPedidos(){
  const r = await Auth.apiFetch('/api/demanda'); const pedidos = await r.json();
  $('#lista-pedidos').innerHTML = pedidos.map(p => `
    <div class="card mb-2"><div class="card-body">
      <div class="d-flex justify-content-between">
        <strong>${esc(p.client_name)}</strong>
        <span class="badge bg-secondary">${esc(p.status)} · ${p.qtd_itens} itens</span>
      </div>
      ${p.observacao ? `<div class="text-muted small">${esc(p.observacao)}</div>` : ''}
      <button class="btn btn-sm btn-outline-primary mt-2" onclick="abrirPedido(${p.id})">Abrir</button>
    </div></div>`).join('') || '<p class="text-muted">Nenhum pedido ainda.</p>';
}

$('#btn-novo-pedido').onclick = async () => {
  const client_id = $('#novo-cliente').value;
  if (!client_id) return Swal.fire('Escolha a cliente', '', 'warning');
  const r = await Auth.apiFetch('/api/demanda', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ client_id, observacao: $('#novo-obs').value }) });
  if (!r.ok) return Swal.fire('Erro', (await r.json()).error || '', 'error');
  $('#novo-obs').value = '';
  await carregarPedidos();
  abrirPedido((await r.json()).id);
};

async function abrirPedido(id){
  const r = await Auth.apiFetch('/api/demanda/'+id); const p = await r.json();
  const fornOpts = fornecedores.map(f => `<option value="${esc(f.cnpj)}" data-nome="${esc(f.nome)}">${esc(f.nome)}</option>`).join('');
  const linhas = p.itens.map(i => `
    <tr>
      <td>${esc(i.fornecedor_nome||'')}</td><td>${esc(i.codigo)}</td><td>${esc(i.nome||'')}</td>
      <td>${i.qtd_pedida}</td><td>${i.qtd_recebida}</td><td>${esc(i.status)}</td>
      <td><button class="btn btn-sm btn-outline-danger" onclick="removerItem(${i.id}, ${id})">×</button></td>
    </tr>`).join('');
  Swal.fire({
    title: esc(p.client_name), width: 800,
    html: `
      <table class="table table-sm"><thead><tr><th>Fornecedor</th><th>Cód.</th><th>Produto</th><th>Ped.</th><th>Rec.</th><th>Status</th><th></th></tr></thead>
      <tbody>${linhas || '<tr><td colspan=7 class="text-muted">Sem itens</td></tr>'}</tbody></table>
      <hr>
      <div class="row g-2">
        <div class="col"><select id="it-forn" class="form-select form-select-sm"><option value="">Fornecedor…</option>${fornOpts}</select></div>
        <div class="col"><input id="it-cod" class="form-control form-control-sm" placeholder="Código"></div>
        <div class="col"><input id="it-nome" class="form-control form-control-sm" placeholder="Produto"></div>
        <div class="col"><input id="it-qtd" type="number" min="1" value="1" class="form-control form-control-sm" placeholder="Qtd"></div>
        <div class="col"><input id="it-preco" type="number" min="0" step="0.01" class="form-control form-control-sm" placeholder="Preço"></div>
        <div class="col-auto"><button id="it-add" class="btn btn-sm btn-primary">+</button></div>
      </div>`,
    showConfirmButton: false, showCloseButton: true,
    didOpen: () => {
      document.getElementById('it-add').onclick = async () => {
        const sel = document.getElementById('it-forn');
        const body = {
          fornecedor_cnpj: sel.value,
          fornecedor_nome: sel.selectedOptions[0] ? sel.selectedOptions[0].dataset.nome : '',
          codigo: document.getElementById('it-cod').value,
          nome: document.getElementById('it-nome').value,
          qtd_pedida: document.getElementById('it-qtd').value,
          preco_venda: document.getElementById('it-preco').value,
        };
        const rr = await Auth.apiFetch('/api/demanda/'+id+'/itens', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
        if (!rr.ok) return Swal.fire('Erro', (await rr.json()).error || '', 'error');
        abrirPedido(id);
      };
    }
  });
}
async function removerItem(itemId, pedidoId){
  const rr = await Auth.apiFetch('/api/demanda/itens/'+itemId, { method:'DELETE' });
  if (rr.ok) abrirPedido(pedidoId);
}

async function carregarCompra(){
  const r = await Auth.apiFetch('/api/demanda/compra'); const forns = await r.json();
  $('#lista-compra').innerHTML = forns.map(f => `
    <div class="card mb-3"><div class="card-body">
      <h5>${esc(f.fornecedor_nome||'(sem fornecedor)')}</h5>
      <table class="table table-sm"><thead><tr><th>Cód.</th><th>Produto</th><th>Qtd</th><th>Clientes</th></tr></thead>
      <tbody>${f.itens.map(i => `<tr><td>${esc(i.codigo)}</td><td>${esc(i.nome||'')}</td><td>${i.qtd_total}</td>
        <td>${i.clientes.map(c => esc(c.client_name)+' ('+c.qtd+')').join(', ')}</td></tr>`).join('')}</tbody></table>
    </div></div>`).join('') || '<p class="text-muted">Nada pendente para comprar.</p>';
}

async function carregarRelatorio(){
  const r = await Auth.apiFetch('/api/demanda/relatorio'); const d = await r.json();
  $('#conteudo-relatorio').innerHTML = `
    <h5>Por cliente</h5>
    <table class="table table-sm"><thead><tr><th>Cliente</th><th>Veio</th><th>Parcial</th><th>Faltou</th><th>Total</th></tr></thead>
    <tbody>${d.porCliente.map(c => `<tr><td>${esc(c.client_name)}</td><td>${c.itens_veio}</td><td>${c.itens_parcial}</td><td>${c.itens_faltou}</td><td>${c.itens_total}</td></tr>`).join('')}</tbody></table>
    <h5 class="mt-4">Por fornecedor</h5>
    <table class="table table-sm"><thead><tr><th>Fornecedor</th><th>Pedido</th><th>Recebido</th><th>Faltou</th></tr></thead>
    <tbody>${d.porFornecedor.map(f => `<tr><td>${esc(f.fornecedor_nome)}</td><td>${f.qtd_pedida}</td><td>${f.qtd_recebida}</td><td>${f.qtd_faltou}</td></tr>`).join('')}</tbody></table>`;
}

(async function init(){ await carregarClientes(); await carregarFornecedores(); await carregarPedidos(); })();
</script>
```

- [ ] **Step 2: Adicionar o item de menu em `painel.html`**

No mesmo bloco da sidebar onde ficam os links das outras telas (ex.: o link para `notas.html`), adicionar um `<a>` seguindo o padrão visual existente (ícone Bootstrap + label), apontando para `demanda.html`:

```html
<a href="demanda.html" class="nav-link"><i class="bi bi-people"></i><span>Pedidos das Clientes</span></a>
```

- [ ] **Step 3: Adicionar o checkbox na `notas.html`**

No formulário que envia o XML da NF, adicionar antes do botão de importar:

```html
<div class="form-check my-2">
  <input class="form-check-input" type="checkbox" id="conciliar-pedidos" checked>
  <label class="form-check-label" for="conciliar-pedidos">Conciliar com pedidos das clientes</label>
</div>
```

E no ponto onde o `FormData` da importação é montado (a função que faz `POST /api/nf/importar`), adicionar:

```js
formData.append('conciliar', document.getElementById('conciliar-pedidos')?.checked ? 'true' : 'false');
```

- [ ] **Step 4: Smoke manual**

Run: `npm run dev` (sobe em :3000). No navegador, logar no painel, abrir "Pedidos das Clientes":
1. Criar um pedido para uma cliente, adicionar 1 item (fornecedor, código, qtd) — deve aparecer na lista.
2. Aba "Comprar" — o item aparece agrupado sob o fornecedor.
3. Importar uma NF de teste com a caixa marcada — na aba "Conciliação/Relatório" o item deve refletir veio/parcial.
Depois **matar o node** para liberar a porta 3000.

Expected: as 3 abas carregam sem erro no console; o fluxo básico funciona.

- [ ] **Step 5: Commit**

```bash
git add src/public/demanda.html src/public/painel.html src/public/notas.html
git commit -m "feat(demanda): tela de pedidos das clientes (abas Pedidos/Comprar/Relatório) + checkbox conciliar na NF"
```

---

## ONDA 2 — Venda (rascunho) + remanejo + aviso WhatsApp

### Task 7: Rascunho de venda + marcar venda

**Files:**
- Modify: `src/controllers/demandaController.js` (`rascunhoVenda`, `marcarVenda`)
- Modify: `src/routes/demanda.js`
- Test: `test/demanda-venda.test.js`

**Interfaces:**
- Produces:
  - `rascunhoVenda(req,res)` → `GET /api/demanda/:id/rascunho-venda` retorna
    `{ client_id, client_name, itens: [{ demanda_item_id, product_id, nome, qtd, preco }] }`
    (só linhas com `qtd_recebida > 0`, `product_id` não nulo e `order_id` nulo; `qtd` = `qtd_recebida`;
    `preco` = `preco_venda` da linha, senão `products.sale_value`).
  - `marcarVenda(req,res)` → `PUT /api/demanda/itens/:itemId/venda` body `{ order_id }`; grava `order_id` na linha; 409 se já tiver `order_id`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Criar `test/demanda-venda.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { rascunhoVenda, marcarVenda } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedProduct(){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,0)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()]); return r.insertId; }
async function cleanup(){
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
}

test('rascunhoVenda devolve só recebidos com product_id; preço cai pro sale_value', async () => {
  const cli = await seedClient(); const prod = await seedProduct();
  const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
  await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'K1', 2, 2, prod, 'veio']);
  await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K2', 1, 0, 'pendente']);
  const res = mockRes();
  await rascunhoVenda({ params: { id: p.insertId } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.itens.length, 1);
  assert.strictEqual(res.body.itens[0].product_id, prod);
  assert.strictEqual(Number(res.body.itens[0].preco), 40);
  await cleanup();
});

test('marcarVenda grava order_id e bloqueia segunda venda (409)', async () => {
  const cli = await seedClient();
  const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
  const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K1', 1, 1, 'veio']);
  let res = mockRes();
  await marcarVenda({ params: { itemId: i.insertId }, body: { order_id: 12345 } }, res);
  assert.strictEqual(res.statusCode, 200);
  res = mockRes();
  await marcarVenda({ params: { itemId: i.insertId }, body: { order_id: 999 } }, res);
  assert.strictEqual(res.statusCode, 409);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-venda.test.js`
Expected: FAIL ("rascunhoVenda is not a function").

- [ ] **Step 3: Implementar**

Adicionar em `src/controllers/demandaController.js` (antes do `module.exports`):

```js
// GET /api/demanda/:id/rascunho-venda
async function rascunhoVenda(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[ped]] = await db.query('SELECT dp.id, dp.client_id, c.name AS client_name FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id WHERE dp.id = ?', [id]);
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [itens] = await db.query(
      `SELECT di.id AS demanda_item_id, di.product_id, di.nome, di.qtd_recebida AS qtd,
              COALESCE(di.preco_venda, p.sale_value) AS preco
       FROM demanda_itens di LEFT JOIN products p ON p.id = di.product_id
       WHERE di.pedido_id = ? AND di.qtd_recebida > 0 AND di.product_id IS NOT NULL AND di.order_id IS NULL`, [id]);
    return res.json({ client_id: ped.client_id, client_name: ped.client_name, itens });
  } catch (e) { console.error('rascunhoVenda', e); return res.status(500).json({ error: 'Erro.' }); }
}

// PUT /api/demanda/itens/:itemId/venda
async function marcarVenda(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  const orderId = parseInt(req.body.order_id, 10);
  if (!Number.isInteger(itemId) || !Number.isInteger(orderId)) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    const [[item]] = await db.query('SELECT order_id FROM demanda_itens WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
    if (item.order_id) return res.status(409).json({ error: 'Este item já foi vendido.' });
    await db.query('UPDATE demanda_itens SET order_id = ? WHERE id = ?', [orderId, itemId]);
    return res.json({ ok: true });
  } catch (e) { console.error('marcarVenda', e); return res.status(500).json({ error: 'Erro.' }); }
}
```

Acrescentar ao `module.exports`: `rascunhoVenda, marcarVenda`.

Em `src/routes/demanda.js`, adicionar:

```js
router.get('/:id/rascunho-venda', c.rascunhoVenda);
router.put('/itens/:itemId/venda', c.marcarVenda);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-venda.test.js`
Expected: PASS (2/2).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js test/demanda-venda.test.js
git commit -m "feat(demanda): rascunho de venda do que veio + marcar venda (order_id)"
```

---

### Task 8: Remanejo manual de alocação

**Files:**
- Modify: `src/controllers/demandaController.js` (`remanejarAlocacao`)
- Modify: `src/routes/demanda.js`
- Test: `test/demanda-venda.test.js` (adicionar teste)

**Interfaces:**
- Produces: `remanejarAlocacao(req,res)` → `PUT /api/demanda/itens/:itemId/alocacao` body `{ qtd_recebida }`.
  Ajusta `qtd_recebida` da linha (recalcula `status` da linha e do pedido). Valida: inteiro ≥ 0 e ≤ `qtd_pedida`. Não mexe em estoque (só reflete o que o usuário confirma manualmente).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Adicionar a `test/demanda-venda.test.js`:

```js
const { remanejarAlocacao } = require('../src/controllers/demandaController');

test('remanejarAlocacao ajusta recebido e rejeita acima do pedido (400)', async () => {
  const cli = await seedClient();
  const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
  const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K1', 3, 3, 'veio']);
  let res = mockRes();
  await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 1 } }, res);
  assert.strictEqual(res.statusCode, 200);
  let [[row]] = await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?', [i.insertId]);
  assert.strictEqual(Number(row.qtd_recebida), 1);
  assert.strictEqual(row.status, 'parcial');
  res = mockRes();
  await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 99 } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-venda.test.js`
Expected: FAIL ("remanejarAlocacao is not a function").

- [ ] **Step 3: Implementar**

Adicionar em `src/controllers/demandaController.js` (antes do `module.exports`):

```js
// PUT /api/demanda/itens/:itemId/alocacao
async function remanejarAlocacao(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  const nova = parseInt(req.body.qtd_recebida, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  if (!Number.isInteger(nova) || nova < 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[item]] = await conn.query('SELECT pedido_id, qtd_pedida FROM demanda_itens WHERE id = ? FOR UPDATE', [itemId]);
    if (!item) { await conn.rollback(); return res.status(404).json({ error: 'Item não encontrado.' }); }
    if (nova > Number(item.qtd_pedida)) { await conn.rollback(); return res.status(400).json({ error: 'Não pode receber mais do que foi pedido.' }); }
    const status = nova >= Number(item.qtd_pedida) ? 'veio' : (nova > 0 ? 'parcial' : 'pendente');
    await conn.query('UPDATE demanda_itens SET qtd_recebida = ?, status = ? WHERE id = ?', [nova, status, itemId]);
    await recalcularStatusPedido(conn, item.pedido_id);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('remanejarAlocacao', e); return res.status(500).json({ error: 'Erro.' }); }
  finally { conn.release(); }
}
```

Acrescentar ao `module.exports`: `remanejarAlocacao`.

Em `src/routes/demanda.js`, adicionar:

```js
router.put('/itens/:itemId/alocacao', c.remanejarAlocacao);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-venda.test.js`
Expected: PASS (3/3).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js test/demanda-venda.test.js
git commit -m "feat(demanda): remanejo manual de alocação recebida"
```

---

### Task 9: UI da Onda 2 — gerar venda (rascunho) + aviso WhatsApp + remanejo

**Files:**
- Modify: `src/public/demanda.html` (botões na aba Conciliação/Relatório e no modal do pedido)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/demanda/:id/rascunho-venda`, `PUT /api/demanda/itens/:itemId/venda`, `PUT /api/demanda/itens/:itemId/alocacao`, e a tela/rota de novo pedido existente (`orders`).
- Reusa: `esc`, `Auth.apiFetch`, Bootstrap/SweetAlert.

- [ ] **Step 1: Botão "Gerar venda do que veio"**

No modal de `abrirPedido(id)` (Task 6), adicionar um botão que chama `rascunho-venda` e leva os itens recebidos para a tela de novo pedido. Como a criação de pedido já existe no painel, a integração mínima é: guardar o rascunho em `sessionStorage` e abrir a tela de pedido, que ao carregar detecta o rascunho e pré-preenche. Adicionar no `html` do modal:

```html
<button id="btn-gerar-venda" class="btn btn-sm btn-success mt-2">Gerar venda do que veio</button>
```

E no `didOpen`:

```js
document.getElementById('btn-gerar-venda').onclick = async () => {
  const rr = await Auth.apiFetch('/api/demanda/'+id+'/rascunho-venda');
  const rasc = await rr.json();
  if (!rasc.itens || !rasc.itens.length) return Swal.fire('Nada recebido ainda', 'Não há itens com produto e quantidade recebida para vender.', 'info');
  sessionStorage.setItem('rascunhoVenda', JSON.stringify(rasc));
  window.location.href = 'index.html'; // tela de novo pedido do painel (ajustar ao nome real do arquivo)
};
```

Na tela de novo pedido (o arquivo do painel que cria `orders` — confirmar o nome ao implementar, ex.: `index.html`/`pedidos.html`), no init, ler o rascunho e pré-preencher cliente + itens; após criar o pedido com sucesso e obter `orderId`, marcar cada linha:

```js
const rasc = JSON.parse(sessionStorage.getItem('rascunhoVenda') || 'null');
if (rasc) {
  sessionStorage.removeItem('rascunhoVenda');
  // ... pré-preencher cliente (rasc.client_id) e itens (rasc.itens: product_id, qtd, preco) na UI de pedido ...
  // Depois de criar o pedido e receber orderId:
  // for (const it of rasc.itens) await Auth.apiFetch('/api/demanda/itens/'+it.demanda_item_id+'/venda', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ order_id: orderId }) });
}
```

- [ ] **Step 2: Botão "Avisar no WhatsApp"**

No modal do pedido, com o telefone da cliente (`p.phone`), montar a mensagem a partir dos itens (veio × faltou) e abrir `wa.me`:

```html
<button id="btn-whats" class="btn btn-sm btn-outline-success mt-2">Avisar no WhatsApp</button>
```

```js
document.getElementById('btn-whats').onclick = () => {
  const veio = p.itens.filter(i => i.status==='veio' || i.status==='parcial').map(i => '• '+ (i.nome||i.codigo) + (i.status==='parcial' ? ' (parcial)' : '')).join('\n');
  const faltou = p.itens.filter(i => i.status!=='veio' && Number(i.qtd_recebida)===0).map(i => '• '+(i.nome||i.codigo)).join('\n');
  let msg = 'Oi '+p.client_name+'! ';
  if (veio) msg += 'Chegou:\n'+veio+'\n';
  if (faltou) msg += '\nInfelizmente não veio dessa vez:\n'+faltou;
  const tel = (p.phone||'').replace(/\D/g,'');
  window.open('https://wa.me/'+ (tel ? '55'+tel : '') +'?text='+encodeURIComponent(msg), '_blank');
};
```

- [ ] **Step 3: Remanejo manual (input inline)**

Na tabela de itens do modal, permitir editar o recebido de itens com `qtd_recebida > 0`: um pequeno input que chama a rota de alocação:

```js
// exemplo de célula editável (substituir a coluna "Rec." por):
// <td><input type="number" min="0" value="${i.qtd_recebida}" style="width:64px"
//     onchange="ajustarRecebido(${i.id}, this.value, ${id})"></td>
async function ajustarRecebido(itemId, val, pedidoId){
  const rr = await Auth.apiFetch('/api/demanda/itens/'+itemId+'/alocacao', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ qtd_recebida: val }) });
  if (!rr.ok) { Swal.fire('Erro', (await rr.json()).error || '', 'error'); }
  abrirPedido(pedidoId);
}
```

- [ ] **Step 4: Smoke manual**

Run: `npm run dev`. Fluxo: importar NF conciliando → abrir o pedido → "Gerar venda do que veio" (confere pré-preenchimento e, ao confirmar, que o item some do rascunho e ganha `order_id`) → "Avisar no WhatsApp" (abre o link com a mensagem certa) → ajustar recebido manualmente e ver o status mudar. Depois **matar o node** (liberar :3000).

Expected: os três botões funcionam; sem erros no console.

- [ ] **Step 5: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): UI de gerar venda (rascunho), aviso WhatsApp e remanejo de alocação"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** tabelas (T1), serviço puro (T2), CRUD+fornecedores (T3), lista de compra+relatório (T4), gancho de conciliação idempotente atrás de flag (T5), tela+menu+checkbox (T6), rascunho de venda+marcar venda (T7), remanejo (T8), UI da venda/WhatsApp/remanejo (T9). Fora de escopo (API WhatsApp, importar catálogo) permanece fora. ✔
- **Consistência de tipos:** `conciliar` retorna `{alocacoes:[{demanda_item_id,qtd}], extras:[{codigo,qtd}]}` — usado igual em T5. `aplicarConciliacao(conn, nfId, emitenteCnpj)` — assinatura idêntica em T5 e no gancho do `nfController`. `recalcularStatusPedido(conn, pedidoId)` reutilizada em T5 e T8. Status usados: pedido `aberto|parcial|concluido`; item `pendente|parcial|veio|faltou`. ✔
- **Sem placeholders de lógica:** todo passo de código traz o código real. Os únicos pontos marcados "confirmar ao implementar" são o **nome do arquivo da tela de novo pedido** do painel (T9) e a posição exata do link na sidebar (T6) — detalhes de integração que dependem do HTML existente, não lógica nova.
- **Riscos tratados:** conciliação atrás de flag + try/catch no `nfController`; idempotência por `UNIQUE(nf_id, demanda_item_id)` + `INSERT IGNORE`; match escopado por CNPJ; tudo na branch `Teste`.

## Ordem sugerida de execução

Onda 1 (T1→T6) entrega software usável (registrar, comprar, conciliar, relatório). Onda 2 (T7→T9) adiciona venda/aviso. Cada task termina testável e commitada.
