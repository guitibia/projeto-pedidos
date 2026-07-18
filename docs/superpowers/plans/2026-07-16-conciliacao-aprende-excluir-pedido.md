# Conciliação que aprende + Excluir pedido — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a conciliação de NF casar o `cProd` da NF com o código de catálogo que o usuário usa no pedido, via uma memória de vínculos que aprende (conferência manual grava o vínculo e reconcilia), e permitir excluir um pedido criado por engano.

**Architecture:** Tabela nova `demanda_cod_vinculos (fornecedor_cnpj, cprod → codigo_pedido)`. `aplicarConciliacao` traduz o `cProd` para o código do pedido antes de chamar a função pura `conciliar` (que não muda). Endpoints novos: conferir uma NF, conciliar-manual (grava vínculo + re-roda a conciliação), e excluir pedido. UI na aba Conciliação do `demanda.html`.

**Tech Stack:** Node/Express (CommonJS), MySQL (mysql2/promise, transações), testes `node:test`, front vanilla JS + Bootstrap/SweetAlert (`Auth.apiFetch`, `esc`).

## Global Constraints

- Branch `Teste` apenas; banco `db_pedidos_teste`. NUNCA commitar/mergear em `main` sem pedido explícito.
- Migração idempotente: `CREATE TABLE IF NOT EXISTS` no bloco de migrações de `connection.js`.
- A função pura `src/services/conciliacaoNf.js` (`conciliar`) **NÃO muda** — o casamento continua por `codigo`; quem traduz `cProd → codigo_pedido` é o `aplicarConciliacao`.
- Vínculo é por **fornecedor + cProd** (`UNIQUE(fornecedor_cnpj, cprod)`). Casamento por código igual (`cProd == codigo`) continua como fallback.
- Excluir pedido: bloqueia (409) se algum item já virou venda (`order_id IS NOT NULL`); não mexe em estoque.
- Queries parametrizadas; dado no DOM via `esc()`.
- Testes: `node --test test/<arq>.test.js`. O `node --test` NÃO encerra sozinho (pool MySQL): rode com timeout/kill (`node --test test/X.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`), valide por 0 `not ok`. NÃO mate o `node` da porta 3000 (é o `npm run dev` do usuário) — só os processos de teste que você iniciou. Seeds `zz_test_` + cleanup.

---

## File Structure

- `src/database/connection.js` — **MODIFICAR**: migração de `demanda_cod_vinculos`.
- `src/controllers/demandaController.js` — **MODIFICAR**: `aplicarConciliacao` traduz cProd; + `conferirNf`, `conciliarManual`, `excluirPedido`.
- `src/routes/demanda.js` — **MODIFICAR**: rotas novas.
- `src/public/demanda.html` — **MODIFICAR**: tela de conferência (aba Conciliação) + botão excluir pedido.
- Testes: `test/demanda-vinculo.test.js`, `test/demanda-excluir.test.js`.

---

## ONDA 1 — Backend

### Task 1: Migração + conciliação traduz cProd→código (aprende)

**Files:**
- Modify: `src/database/connection.js` (após a migração `visivel_loja`)
- Modify: `src/controllers/demandaController.js` (`aplicarConciliacao`, ~linha 184)
- Test: `test/demanda-vinculo.test.js`

**Interfaces:**
- Produces: tabela `demanda_cod_vinculos (id, fornecedor_cnpj, cprod, codigo_pedido, created_at, UNIQUE(fornecedor_cnpj, cprod))`. `aplicarConciliacao(conn, nfId, emitenteCnpj)` passa a traduzir cada `cProd` da NF pelo vínculo do fornecedor (se houver) antes de casar; sem vínculo, usa o próprio `cProd` (fallback).

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/demanda-vinculo.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { aplicarConciliacao } = require('../src/controllers/demandaController');

const CNPJ = '71673990005136'; // Natura (exemplo)
async function seedClient(){ const [r]=await db.query('INSERT INTO clients (name) VALUES (?)',['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedPedidoItem(clientId, codigo, qtd){
  const [p]=await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)',[clientId]);
  const [i]=await db.query('INSERT INTO demanda_itens (pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, qtd_pedida) VALUES (?,?,?,?,?)',[p.insertId, CNPJ, 'ZZ Natura', codigo, qtd]);
  return { pedidoId:p.insertId, itemId:i.insertId };
}
async function seedNf(cprod, qtd){
  const chave='zzv'+Date.now()+Math.floor(Math.random()*1e9);
  const [n]=await db.query('INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero) VALUES (?,?,?,?)',[String(chave).slice(0,44),'ZZ Natura',CNPJ,'1']);
  await db.query('INSERT INTO nf_entrada_itens (nf_id, cprod, quantidade) VALUES (?,?,?)',[n.insertId, cprod, qtd]);
  return n.insertId;
}
async function cleanup(){
  await db.query('DELETE FROM demanda_cod_vinculos WHERE fornecedor_cnpj = ?',[CNPJ]);
  await db.query('DELETE FROM demanda_conciliacoes WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)',[CNPJ]);
  await db.query('DELETE FROM nf_entrada_itens WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)',[CNPJ]);
  await db.query('DELETE FROM nf_entradas WHERE emitente_cnpj = ?',[CNPJ]);
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('sem vínculo: cProd diferente do código NÃO casa', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',2);         // código de catálogo
  const nfId=await seedNf('000000000050512547',2);              // cProd da NF (diferente)
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),0,'sem vínculo não casa');
  await cleanup();
});

test('com vínculo cProd→código: casa (aprendeu)', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',2);
  const nfId=await seedNf('000000000050512547',2);
  await db.query('INSERT INTO demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido) VALUES (?,?,?)',[CNPJ,'000000000050512547','160380']);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),2,'com vínculo casa');
  assert.strictEqual(row.status,'veio');
  await cleanup();
});

test('fallback: cProd == código casa mesmo sem vínculo', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'ABC123',1);
  const nfId=await seedNf('ABC123',1);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),1);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-vinculo.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL — a tabela `demanda_cod_vinculos` não existe (INSERT do teste quebra) e/ou o 2º teste não casa.

- [ ] **Step 3: Migração da tabela**

Em `src/database/connection.js`, logo após o bloco `// Migração: visibilidade do produto na loja` (o `ALTER TABLE products ADD COLUMN visivel_loja ...`), inserir:

```js
    // Migração: memória de vínculos da conciliação (cProd da NF -> código do pedido, por fornecedor)
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS demanda_cod_vinculos (id INT AUTO_INCREMENT PRIMARY KEY, fornecedor_cnpj VARCHAR(14) NOT NULL, cprod VARCHAR(60) NOT NULL, codigo_pedido VARCHAR(60) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_forn_cprod (fornecedor_cnpj, cprod))',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 4: `aplicarConciliacao` traduz cProd→código**

Em `src/controllers/demandaController.js`, na função `aplicarConciliacao`, substituir o trecho que monta `nfItens` e `prodPorCod`. Localize:

```js
  const nfItens = nfItensRows.map(r => ({ codigo: r.codigo, qtd: Number(r.qtd) }));
  const { alocacoes } = conciliar(nfItens, linhas);

  const prodPorCod = new Map(nfItensRows.map(r => [String(r.codigo).trim().toLowerCase(), r.product_id]));
```

e troque por:

```js
  // vínculos aprendidos: traduz o cProd da NF -> código do pedido (se houver vínculo p/ este fornecedor)
  const [vincs] = await conn.query('SELECT cprod, codigo_pedido FROM demanda_cod_vinculos WHERE fornecedor_cnpj = ?', [emitenteCnpj]);
  const mapCprod = new Map(vincs.map(v => [String(v.cprod).trim().toLowerCase(), v.codigo_pedido]));
  const traduz = (cprod) => mapCprod.get(String(cprod).trim().toLowerCase()) || cprod;

  const nfItens = nfItensRows.map(r => ({ codigo: traduz(r.codigo), qtd: Number(r.qtd) }));
  const { alocacoes } = conciliar(nfItens, linhas);

  // product_id chaveado pelo código TRADUZIDO, para o backfill cair na linha certa
  const prodPorCod = new Map(nfItensRows.map(r => [String(traduz(r.codigo)).trim().toLowerCase(), r.product_id]));
```

(O restante da função — laço de `alocacoes`, `demanda_conciliacoes`, `recalcularStatusPedido` — não muda.)

- [ ] **Step 5: Rodar e ver passar**

Run: `node --test test/demanda-vinculo.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (3/3). Mate o node de teste depois (NÃO o da porta 3000).

- [ ] **Step 6: Commit**

```bash
git add src/database/connection.js src/controllers/demandaController.js test/demanda-vinculo.test.js
git commit -m "feat(demanda): conciliação aprende (vínculo cProd->código do pedido por fornecedor)"
```

---

### Task 2: Endpoints de conferência (conferir NF + conciliar manual)

**Files:**
- Modify: `src/controllers/demandaController.js` (`conferirNf`, `conciliarManual`, export)
- Modify: `src/routes/demanda.js`
- Test: `test/demanda-vinculo.test.js` (adicionar)

**Interfaces:**
- Consumes: `aplicarConciliacao` (Task 1).
- Produces:
  - `conferirNf` → `GET /api/demanda/nf/:nfId/conferir` retorna `{ nf:{id,emitente_nome,emitente_cnpj,numero}, itens:[{cprod,descricao,quantidade,product_id,produto_nome,codigo_vinculado}], pendentes:[{demanda_item_id,codigo,nome,cliente,qtd_pedida,qtd_recebida}] }`.
  - `conciliarManual` → `POST /api/demanda/conciliar-manual` body `{ nf_id, cprod, codigo_pedido }`: grava o vínculo (ON DUPLICATE), aprende o fornecedor nas linhas com aquele código sem CNPJ, re-roda `aplicarConciliacao`. `{ ok:true }`.

- [ ] **Step 1: Escrever os testes (falham primeiro)**

Adicionar ao final de `test/demanda-vinculo.test.js`:

```js
const { conferirNf, conciliarManual } = require('../src/controllers/demandaController');
function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

test('conferirNf devolve itens da NF e pendentes do fornecedor', async () => {
  const cli=await seedClient();
  await seedPedidoItem(cli,'160380',2);
  const nfId=await seedNf('000000000050512547',2);
  const res=mockRes();
  await conferirNf({ params:{ nfId } }, res);
  assert.strictEqual(res.statusCode,200);
  assert.ok(res.body.itens.some(i => i.cprod==='000000000050512547'));
  assert.ok(res.body.pendentes.some(p => p.codigo==='160380'));
  await cleanup();
});

test('conciliarManual grava vínculo, reconcilia e aprende p/ a próxima NF', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',3);
  const nf1=await seedNf('000000000050512547',2);
  let res=mockRes();
  await conciliarManual({ body:{ nf_id:nf1, cprod:'000000000050512547', codigo_pedido:'160380' } }, res);
  assert.strictEqual(res.statusCode,200);
  let [[row]]=await db.query('SELECT qtd_recebida,status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),2,'reconciliou o que veio');
  assert.strictEqual(row.status,'parcial');
  // 2ª NF do mesmo cProd casa AUTOMÁTICO (sem manual), pelo vínculo aprendido
  const nf2=await seedNf('000000000050512547',1);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nf2,CNPJ); await conn.commit(); } finally { conn.release(); }
  [[row]]=await db.query('SELECT qtd_recebida,status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),3,'2ª NF casou sozinha');
  assert.strictEqual(row.status,'veio');
  await cleanup();
});

test('conciliarManual: cprod que não está na NF → 400', async () => {
  const nfId=await seedNf('AAA',1);
  const res=mockRes();
  await conciliarManual({ body:{ nf_id:nfId, cprod:'NAO_EXISTE', codigo_pedido:'160380' } }, res);
  assert.strictEqual(res.statusCode,400);
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-vinculo.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL (`conferirNf is not a function`).

- [ ] **Step 3: Implementar os endpoints**

Em `src/controllers/demandaController.js`, antes do `module.exports`, adicionar:

```js
// GET /api/demanda/nf/:nfId/conferir — itens da NF + pedidos pendentes do fornecedor (p/ ligar na mão)
async function conferirNf(req, res) {
  const nfId = parseInt(req.params.nfId, 10);
  if (!Number.isInteger(nfId)) return res.status(400).json({ error: 'NF inválida.' });
  try {
    const [[nf]] = await db.query('SELECT id, emitente_nome, emitente_cnpj, numero FROM nf_entradas WHERE id = ?', [nfId]);
    if (!nf) return res.status(404).json({ error: 'NF não encontrada.' });
    const cnpj = nf.emitente_cnpj;
    const [itens] = await db.query(
      `SELECT i.cprod, MAX(i.descricao) AS descricao, SUM(i.quantidade) AS quantidade,
              MAX(i.product_id) AS product_id, MAX(p.name) AS produto_nome,
              (SELECT v.codigo_pedido FROM demanda_cod_vinculos v WHERE v.fornecedor_cnpj = ? AND v.cprod = i.cprod) AS codigo_vinculado
       FROM nf_entrada_itens i LEFT JOIN products p ON p.id = i.product_id
       WHERE i.nf_id = ? GROUP BY i.cprod ORDER BY i.cprod`, [cnpj, nfId]);
    const [pendentes] = await db.query(
      `SELECT di.id AS demanda_item_id, di.codigo, di.nome, c.name AS cliente, di.qtd_pedida, di.qtd_recebida
       FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id = di.pedido_id JOIN clients c ON c.id = dp.client_id
       WHERE di.fornecedor_cnpj = ? AND di.status IN ('pendente','parcial') ORDER BY di.codigo, di.created_at`, [cnpj]);
    return res.json({ nf, itens, pendentes });
  } catch (e) { console.error('conferirNf', e); return res.status(500).json({ error: 'Erro ao conferir NF.' }); }
}

// POST /api/demanda/conciliar-manual — grava o vínculo cProd->código e reconcilia a NF
async function conciliarManual(req, res) {
  const nfId = parseInt(req.body.nf_id, 10);
  const cprod = String(req.body.cprod || '').trim();
  const codigoPedido = String(req.body.codigo_pedido || '').trim();
  if (!Number.isInteger(nfId) || !cprod || !codigoPedido) return res.status(400).json({ error: 'Dados inválidos.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[nf]] = await conn.query('SELECT emitente_cnpj FROM nf_entradas WHERE id = ? FOR UPDATE', [nfId]);
    if (!nf) { await conn.rollback(); return res.status(404).json({ error: 'NF não encontrada.' }); }
    const cnpj = nf.emitente_cnpj;
    const [[temItem]] = await conn.query('SELECT 1 AS ok FROM nf_entrada_itens WHERE nf_id = ? AND cprod = ? LIMIT 1', [nfId, cprod]);
    if (!temItem) { await conn.rollback(); return res.status(400).json({ error: 'Esse código não está nesta NF.' }); }
    await conn.query(
      'INSERT INTO demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE codigo_pedido = VALUES(codigo_pedido)',
      [cnpj, cprod, codigoPedido]);
    // aprende o fornecedor nas linhas com esse código que ainda não tinham CNPJ (entram no escopo)
    await conn.query("UPDATE demanda_itens SET fornecedor_cnpj = ? WHERE codigo = ? AND (fornecedor_cnpj IS NULL OR fornecedor_cnpj = '')", [cnpj, codigoPedido]);
    await aplicarConciliacao(conn, nfId, cnpj);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('conciliarManual', e); return res.status(500).json({ error: 'Erro ao conciliar.' }); }
  finally { conn.release(); }
}
```

Acrescentar `conferirNf, conciliarManual` ao `module.exports`.

Em `src/routes/demanda.js`, adicionar (rotas fixas, antes do `router.get('/:id', ...)`):

```js
router.get('/nf/:nfId/conferir', c.conferirNf);
router.post('/conciliar-manual', c.conciliarManual);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-vinculo.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (6/6). Mate o node de teste depois.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js test/demanda-vinculo.test.js
git commit -m "feat(demanda): conferir NF + conciliar manual (grava vínculo e reconcilia)"
```

---

### Task 3: Excluir pedido

**Files:**
- Modify: `src/controllers/demandaController.js` (`excluirPedido`, export)
- Modify: `src/routes/demanda.js`
- Test: `test/demanda-excluir.test.js`

**Interfaces:**
- Produces: `excluirPedido` → `DELETE /api/demanda/:id`: 404 se não existe; 409 se algum item tem `order_id` (já vendido); senão apaga `demanda_conciliacoes` dos itens + `demanda_itens` + `demanda_pedidos` numa transação. `{ ok:true }`.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/demanda-excluir.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { excluirPedido } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r]=await db.query('INSERT INTO clients (name) VALUES (?)',['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedPedido(clientId, orderId){
  const [p]=await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)',[clientId]);
  await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, order_id) VALUES (?,?,?,?)',[p.insertId,'X',1, orderId || null]);
  return p.insertId;
}
async function cleanup(){
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('excluirPedido apaga pedido sem venda', async () => {
  const cli=await seedClient();
  const pedidoId=await seedPedido(cli, null);
  const res=mockRes();
  await excluirPedido({ params:{ id: pedidoId } }, res);
  assert.strictEqual(res.statusCode,200);
  const [[p]]=await db.query('SELECT COUNT(*) c FROM demanda_pedidos WHERE id = ?',[pedidoId]);
  const [[it]]=await db.query('SELECT COUNT(*) c FROM demanda_itens WHERE pedido_id = ?',[pedidoId]);
  assert.strictEqual(Number(p.c),0);
  assert.strictEqual(Number(it.c),0);
  await cleanup();
});

test('excluirPedido com item já vendido → 409', async () => {
  const cli=await seedClient();
  const pedidoId=await seedPedido(cli, 99999);
  const res=mockRes();
  await excluirPedido({ params:{ id: pedidoId } }, res);
  assert.strictEqual(res.statusCode,409);
  const [[p]]=await db.query('SELECT COUNT(*) c FROM demanda_pedidos WHERE id = ?',[pedidoId]);
  assert.strictEqual(Number(p.c),1,'não apagou');
  await cleanup();
});

test('excluirPedido inexistente → 404', async () => {
  const res=mockRes();
  await excluirPedido({ params:{ id: 999999999 } }, res);
  assert.strictEqual(res.statusCode,404);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/demanda-excluir.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL (`excluirPedido is not a function`).

- [ ] **Step 3: Implementar**

Em `src/controllers/demandaController.js`, antes do `module.exports`, adicionar:

```js
// DELETE /api/demanda/:id — exclui um pedido criado por engano (bloqueia se já virou venda)
async function excluirPedido(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[ped]] = await conn.query('SELECT id FROM demanda_pedidos WHERE id = ? FOR UPDATE', [id]);
    if (!ped) { await conn.rollback(); return res.status(404).json({ error: 'Pedido não encontrado.' }); }
    const [[vend]] = await conn.query('SELECT COUNT(*) c FROM demanda_itens WHERE pedido_id = ? AND order_id IS NOT NULL', [id]);
    if (vend.c > 0) { await conn.rollback(); return res.status(409).json({ error: 'Este pedido já gerou venda; não pode ser excluído.' }); }
    await conn.query('DELETE c FROM demanda_conciliacoes c JOIN demanda_itens di ON di.id = c.demanda_item_id WHERE di.pedido_id = ?', [id]);
    await conn.query('DELETE FROM demanda_itens WHERE pedido_id = ?', [id]);
    await conn.query('DELETE FROM demanda_pedidos WHERE id = ?', [id]);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('excluirPedido', e); return res.status(500).json({ error: 'Erro ao excluir.' }); }
  finally { conn.release(); }
}
```

Acrescentar `excluirPedido` ao `module.exports`.

Em `src/routes/demanda.js`, adicionar (após `router.delete('/itens/:itemId', ...)`):

```js
router.delete('/:id', c.excluirPedido);
```

- [ ] **Step 4: Rodar e ver passar**

Run: `node --test test/demanda-excluir.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (3/3). Mate o node de teste depois.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js test/demanda-excluir.test.js
git commit -m "feat(demanda): excluir pedido (bloqueia se já virou venda)"
```

---

## ONDA 2 — UI (`demanda.html`)

### Task 4: Tela de conferência + botão excluir pedido

**Files:**
- Modify: `src/public/demanda.html`
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/nf` (lista NFs), `GET /api/demanda/nf/:nfId/conferir`, `POST /api/demanda/conciliar-manual`, `DELETE /api/demanda/:id`.

- [ ] **Step 1: Bloco de conferência na aba Conciliação**

Em `src/public/demanda.html`, dentro da seção `#tab-relatorio` (que hoje tem só `<div id="conteudo-relatorio">`), adicionar ANTES do `#conteudo-relatorio` um bloco de conferência:

```html
<div class="card mb-3"><div class="card-body">
  <h5>Conferir NF importada</h5>
  <div class="d-flex gap-2 mb-2">
    <select id="conf-nf" class="form-select" style="max-width:420px"><option value="">Escolha uma NF…</option></select>
    <button id="conf-carregar" class="btn btn-outline-primary">Conferir</button>
  </div>
  <div id="conf-resultado"></div>
</div></div>
```

- [ ] **Step 2: Carregar a lista de NFs e a conferência**

No `<script>` da página, adicionar as funções e popular o select ao entrar na aba. A função `show(tab)` já chama `carregarRelatorio()` quando `tab==='relatorio'`; adicione `carregarNfsConferencia()` junto:

```js
async function carregarNfsConferencia(){
  const r = await Auth.apiFetch('/api/nf');
  const nfs = await r.json();
  const sel = document.getElementById('conf-nf');
  sel.innerHTML = '<option value="">Escolha uma NF…</option>' +
    nfs.map(n => `<option value="${n.id}">#${n.id} — ${esc(n.emitente_nome||'')} (nota ${esc(String(n.numero||''))})</option>`).join('');
}
document.getElementById('conf-carregar').onclick = carregarConferencia;

async function carregarConferencia(){
  const nfId = document.getElementById('conf-nf').value;
  if (!nfId) return;
  const r = await Auth.apiFetch('/api/demanda/nf/'+nfId+'/conferir');
  const d = await r.json();
  if (!r.ok) { document.getElementById('conf-resultado').innerHTML = '<p class="text-danger">'+esc(d.error||'Erro')+'</p>'; return; }
  const optsPend = d.pendentes.map(p => `<option value="${esc(p.codigo)}">${esc(p.codigo)} — ${esc(p.nome||'')} (${esc(p.cliente)}) [pediu ${p.qtd_pedida}, veio ${p.qtd_recebida}]</option>`).join('');
  const linhas = d.itens.map(i => {
    const casou = i.codigo_vinculado ? `<span class="badge bg-success">casa com ${esc(i.codigo_vinculado)}</span>` : '<span class="badge bg-secondary">não casou</span>';
    const seletor = i.codigo_vinculado ? '' : `
      <select class="form-select form-select-sm d-inline-block" style="max-width:340px" id="link-${esc(i.cprod)}">
        <option value="">Ligar a um pedido pendente…</option>${optsPend}
      </select>
      <button class="btn btn-sm btn-primary" onclick="ligarItem('${esc(i.cprod)}', ${nfId})">Ligar</button>`;
    return `<tr><td>${esc(i.cprod)}</td><td>${esc(i.descricao||i.produto_nome||'')}</td><td>${i.quantidade}</td><td>${casou}</td><td>${seletor}</td></tr>`;
  }).join('');
  document.getElementById('conf-resultado').innerHTML = `
    <table class="table table-sm"><thead><tr><th>Cód. NF (cProd)</th><th>Descrição</th><th>Qtd</th><th>Status</th><th>Conferir</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan=5 class="text-muted">Sem itens</td></tr>'}</tbody></table>`;
}

async function ligarItem(cprod, nfId){
  const sel = document.getElementById('link-'+cprod);
  const codigoPedido = sel ? sel.value : '';
  if (!codigoPedido) return Swal.fire('Escolha o pedido', 'Selecione a qual código de pedido esse item corresponde.', 'warning');
  const r = await Auth.apiFetch('/api/demanda/conciliar-manual', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ nf_id: nfId, cprod, codigo_pedido: codigoPedido }) });
  const d = await r.json();
  if (!r.ok) return Swal.fire('Erro', d.error || '', 'error');
  await carregarConferencia();   // recarrega: o item passa a "casa com ..."
  carregarRelatorio();           // atualiza o relatório veio×faltou
}
```

E na função `show(tab)`, na parte de `if (tab==='relatorio')`, chamar também `carregarNfsConferencia()`:

```js
if (tab==='relatorio') { carregarRelatorio(); carregarNfsConferencia(); }
```

- [ ] **Step 3: Botão excluir pedido na lista**

Na função `carregarPedidos()`, no HTML de cada pedido (onde já tem o botão "Abrir"), acrescentar um botão de excluir:

```js
// ao lado do botão Abrir:
`<button class="btn btn-sm btn-outline-danger mt-2 ms-1" onclick="excluirPedido(${p.id})">Excluir</button>`
```

E adicionar a função:

```js
async function excluirPedido(id){
  const ok = await Swal.fire({ title:'Excluir este pedido?', text:'Some o pedido e seus itens. Não dá pra desfazer.', icon:'warning', showCancelButton:true, confirmButtonText:'Excluir', cancelButtonText:'Cancelar' });
  if (!ok.isConfirmed) return;
  const r = await Auth.apiFetch('/api/demanda/'+id, { method:'DELETE' });
  const d = await r.json();
  if (!r.ok) return Swal.fire('Não deu', d.error || '', 'error');   // 409 se já virou venda
  carregarPedidos();
}
```

- [ ] **Step 4: Smoke manual**

Run: `npm run dev` (use a porta 3000 do usuário se já estiver de pé). Em "Pedidos das Clientes" → aba Conciliação: escolher uma NF, ver os itens; num item que não casou, escolher um pedido pendente no seletor e clicar "Ligar" → o item passa a "casa com …" e o relatório atualiza; importar/abrir outra NF do mesmo fornecedor com o mesmo cProd e conferir que casou sozinho. Na aba Pedidos, "Excluir" um pedido de teste (confirmar) e ver sumir; tentar excluir um que já virou venda → aviso. Se subiu um node de teste, mate só ele.

- [ ] **Step 5: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): tela de conferência de NF (ligar item->pedido, aprende) + excluir pedido"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** tabela de vínculos (T1), conciliação traduz cProd→código com fallback (T1), conferir NF + conciliar-manual que grava vínculo e reconcilia + aprende fornecedor (T2), excluir pedido com bloqueio de venda (T3), UI de conferência + excluir (T4). Fora de escopo (casar por EAN/nome, editar vínculo) permanece fora. ✔
- **Consistência de nomes:** tabela `demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido)`; funções `conferirNf`/`conciliarManual`/`excluirPedido`; rotas `GET /nf/:nfId/conferir`, `POST /conciliar-manual`, `DELETE /:id` — idênticas entre controller, rotas, testes e UI. `aplicarConciliacao(conn,nfId,emitenteCnpj)` reusada em T2. ✔
- **Sem placeholders de lógica:** todo passo traz código real; a UI referencia as funções reais do `demanda.html` (`carregarPedidos`, `carregarRelatorio`, `show(tab)`, `esc`, `Auth.apiFetch`).
- **Riscos:** a função pura `conciliar` não muda (testes atuais seguem válidos); conciliar-manual e excluir rodam em transação com rollback; idempotência mantida (UNIQUE em `demanda_conciliacoes` e em `demanda_cod_vinculos`); excluir bloqueia venda; tudo na `Teste`.

## Ordem de execução

Onda 1 (T1→T3) entrega o backend completo (aprende, concilia manual, exclui). Onda 2 (T4) adiciona a tela. Cada task termina testável e commitada.
