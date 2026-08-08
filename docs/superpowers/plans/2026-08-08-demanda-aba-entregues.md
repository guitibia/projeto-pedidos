# Aba "Entregues" em Pedidos das Clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separar os pedidos já entregues numa aba nova em `demanda.html`, derivando o estado do status da venda gerada, sem passo novo na rotina do usuário.

**Architecture:** Uma coluna `orders.delivered_at` carimbada em `updateOrderStatus` (único ponto que altera `orders.status`). `GET /api/demanda` faz JOIN `demanda_itens.order_id` → `orders` e devolve `entregue`, `itens_pendentes` e `entregue_em` calculados; o frontend usa esses campos para dividir os cards entre as abas Pedidos e Entregues.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML + Bootstrap 5 vanilla (sem framework), testes com `node:test`.

**Spec:** `docs/superpowers/specs/2026-08-08-demanda-aba-entregues-design.md`

## Global Constraints

- Branch: **Teste**. Nada de merge para `main` ou deploy para produção.
- Banco local da branch Teste: `db_pedidos_teste` (resolvido automaticamente por `src/database/connection.js`).
- Migrações seguem o padrão do projeto: `ALTER TABLE` dentro de `try { } catch (_) {}` no bloco de boot de `src/database/connection.js`. Não existe ferramenta de migração.
- Comando de teste: `node --test test/ARQ.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`. O pool MySQL não fecha sozinho, então o processo precisa ser morto — isso é esperado, não é falha do teste.
- Testes limpam o que criam usando o prefixo `zz_test_cli_` em `clients.name`, como nos testes existentes.
- `demanda_pedidos.status` (aberto/parcial/concluido) **não** pode ser alterado por este trabalho.
- Texto de interface em português, seguindo o tom das telas existentes.

## File Structure

| Arquivo | Responsabilidade | Ação |
|---|---|---|
| `src/database/connection.js` | migração da coluna `delivered_at` | Modificar (fim do bloco de migrações) |
| `src/controllers/orderController.js` | carimbar/limpar `delivered_at` ao mudar status | Modificar (linhas 185 e 201) |
| `src/controllers/demandaController.js` | `listarPedidos` com campos derivados e filtros | Modificar (linhas 20-30) |
| `src/public/demanda.html` | aba Entregues, busca, selo de pendência | Modificar (linhas 61-64, 67-79, 103-109, 122-141) |
| `test/orders-delivered-at.test.js` | testes do carimbo | Criar |
| `test/demanda-entregues.test.js` | testes da separação de abas | Criar |

---

### Task 1: Coluna `delivered_at` e carimbo no status da venda

**Files:**
- Modify: `src/database/connection.js` (junto do último bloco `for (const sql of [...])`)
- Modify: `src/controllers/orderController.js:185` e `:201`
- Test: `test/orders-delivered-at.test.js` (criar)

**Interfaces:**
- Consumes: nada (primeira task)
- Produces: coluna `orders.delivered_at DATETIME NULL`, preenchida com a data/hora em que a venda passou para `Entregue`, nula quando o status é `Pendente` ou `Cancelado`. As Tasks 2 e 3 leem essa coluna via `COALESCE(o.delivered_at, o.created_at)`.

- [ ] **Step 1: Adicionar a migração**

Em `src/database/connection.js`, logo após o bloco da migração de `delivery_method` (o `for` que contém `ALTER TABLE payment_intents ADD COLUMN delivery_method ...`), acrescentar:

```js
    // Migração: data em que a venda foi entregue (usada pela aba Entregues dos pedidos das clientes)
    for (const sql of [
      'ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 2: Escrever o teste que falha**

Criar `test/orders-delivered-at.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { updateOrderStatus } = require('../src/controllers/orderController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

async function seedClient(){
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]);
  return r.insertId;
}

async function seedOrder(clientId, status){
  const [r] = await db.query(
    'INSERT INTO orders (client_id, payment_method, total_cost, status) VALUES (?,?,?,?)',
    [clientId, 'DINHEIRO', 10, status || 'Pendente']);
  return r.insertId;
}

async function delivered(orderId){
  const [[o]] = await db.query('SELECT delivered_at FROM orders WHERE id = ?', [orderId]);
  return o.delivered_at;
}

async function cleanup(){
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('marcar Entregue grava delivered_at', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    assert.strictEqual(await delivered(ord), null);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Entregue' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.ok(await delivered(ord), 'delivered_at deveria estar preenchido');
  } finally { await cleanup(); }
});

test('remarcar Entregue nao reescreve a data original', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    await db.query("UPDATE orders SET status='Entregue', delivered_at='2020-01-01 10:00:00' WHERE id = ?", [ord]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Entregue' } }, res);
    const d = await delivered(ord);
    assert.strictEqual(new Date(d).getFullYear(), 2020);
  } finally { await cleanup(); }
});

test('voltar para Pendente limpa delivered_at', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    await db.query("UPDATE orders SET status='Entregue', delivered_at=NOW() WHERE id = ?", [ord]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Pendente' } }, res);
    assert.strictEqual(await delivered(ord), null);
  } finally { await cleanup(); }
});

test('cancelar limpa delivered_at', async () => {
  try {
    const cli = await seedClient();
    const ord = await seedOrder(cli);
    await db.query("UPDATE orders SET status='Entregue', delivered_at=NOW() WHERE id = ?", [ord]);
    const res = mockRes();
    await updateOrderStatus({ params: { id: String(ord) }, body: { status: 'Cancelado', motivo: 'teste' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(await delivered(ord), null);
  } finally { await cleanup(); }
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node --test test/orders-delivered-at.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`

Expected: os dois primeiros testes falham em `delivered_at deveria estar preenchido`. Se aparecer `Unknown column 'delivered_at'`, a migração do Step 1 não foi salva — o teste abre o pool e roda o bloco de boot, então a coluna deveria existir na primeira execução.

- [ ] **Step 4: Carimbar no caminho Pendente/Entregue**

Em `src/controllers/orderController.js`, trocar a linha 185:

```js
      const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
```

por:

```js
      // Entregue carimba a data (sem reescrever se ja houver); Pendente limpa.
      const [result] = status === 'Entregue'
        ? await db.query('UPDATE orders SET status = ?, delivered_at = COALESCE(delivered_at, NOW()) WHERE id = ?', [status, id])
        : await db.query('UPDATE orders SET status = ?, delivered_at = NULL WHERE id = ?', [status, id]);
```

- [ ] **Step 5: Limpar no caminho Cancelado**

No mesmo arquivo, trocar a linha 201:

```js
      "UPDATE orders SET status = ? WHERE id = ? AND status != 'Cancelado'",
```

por:

```js
      "UPDATE orders SET status = ?, delivered_at = NULL WHERE id = ? AND status != 'Cancelado'",
```

- [ ] **Step 6: Rodar o teste e confirmar que passa**

Run: `node --test test/orders-delivered-at.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 7: Rodar os testes de venda existentes**

Run: `node --test test/demanda-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`

Expected: `# fail 0` — mesmo resultado de antes da mudança.

- [ ] **Step 8: Commit**

```bash
git add src/database/connection.js src/controllers/orderController.js test/orders-delivered-at.test.js
git commit -m "feat(orders): gravar delivered_at ao marcar a venda como entregue"
```

---

### Task 2: `GET /api/demanda` com estado de entrega e filtros

**Files:**
- Modify: `src/controllers/demandaController.js:20-30` (função `listarPedidos`)
- Test: `test/demanda-entregues.test.js` (criar)

**Interfaces:**
- Consumes: `orders.delivered_at` da Task 1.
- Produces: cada item do array devolvido por `GET /api/demanda` ganha três campos, consumidos pela Task 3:
  - `entregue` — `boolean`
  - `itens_pendentes` — `number`, itens do pedido com `order_id IS NULL`
  - `entregue_em` — `string | null` (datetime), `MAX(COALESCE(o.delivered_at, o.created_at))` das vendas entregues

  A rota passa a aceitar `?entregues=1` e `?q=<texto>`. Os campos já existentes (`id`, `client_id`, `client_name`, `observacao`, `status`, `created_at`, `qtd_itens`) continuam iguais.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/demanda-entregues.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { listarPedidos } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

async function seedClient(){
  const nome = 'zz_test_cli_'+Date.now()+Math.floor(Math.random()*1e6);
  const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', [nome]);
  return { id: r.insertId, nome };
}

async function seedOrder(clientId, status, deliveredAt){
  const [r] = await db.query(
    'INSERT INTO orders (client_id, payment_method, total_cost, status, delivered_at) VALUES (?,?,?,?,?)',
    [clientId, 'DINHEIRO', 10, status, deliveredAt || null]);
  return r.insertId;
}

async function seedPedido(clientId){
  const [r] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [clientId]);
  return r.insertId;
}

async function seedItem(pedidoId, orderId){
  const [r] = await db.query(
    'INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status, order_id) VALUES (?,?,?,?,?,?)',
    [pedidoId, 'K'+Math.floor(Math.random()*1e6), 1, 1, 'veio', orderId || null]);
  return r.insertId;
}

async function listar(query){
  const res = mockRes();
  await listarPedidos({ query: query || {} }, res);
  assert.strictEqual(res.statusCode, 200);
  return res.body;
}

const achar = (lista, pedidoId) => lista.find(p => p.id === pedidoId);

async function cleanup(){
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('pedido sem venda gerada fica na aba Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, null);
    assert.ok(achar(await listar(), ped), 'deveria estar em Pedidos');
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined);
  } finally { await cleanup(); }
});

test('pedido com venda Pendente fica na aba Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Pendente'));
    assert.ok(achar(await listar(), ped));
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined);
  } finally { await cleanup(); }
});

test('pedido com todas as vendas Entregue vai para a aba Entregues', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    const p = achar(await listar({ entregues: '1' }), ped);
    assert.ok(p, 'deveria estar em Entregues');
    assert.strictEqual(p.entregue, true);
    assert.strictEqual(achar(await listar(), ped), undefined);
  } finally { await cleanup(); }
});

test('pedido com duas vendas, uma Entregue e outra Pendente, fica em Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    await seedItem(ped, await seedOrder(cli.id, 'Pendente'));
    assert.ok(achar(await listar(), ped));
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined);
  } finally { await cleanup(); }
});

test('venda Entregue e outra Cancelada mantem o pedido em Pedidos', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    await seedItem(ped, await seedOrder(cli.id, 'Cancelado'));
    assert.ok(achar(await listar(), ped));
  } finally { await cleanup(); }
});

test('pedido entregue com item sem venda aparece em Entregues com itens_pendentes = 1', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', new Date()));
    await seedItem(ped, null);
    const p = achar(await listar({ entregues: '1' }), ped);
    assert.ok(p, 'deveria estar em Entregues');
    assert.strictEqual(Number(p.itens_pendentes), 1);
  } finally { await cleanup(); }
});

test('entrega de 120 dias atras so aparece na busca por nome', async () => {
  try {
    const cli = await seedClient();
    const ped = await seedPedido(cli.id);
    const antiga = new Date(Date.now() - 120*24*3600*1000);
    await seedItem(ped, await seedOrder(cli.id, 'Entregue', antiga));
    assert.strictEqual(achar(await listar({ entregues: '1' }), ped), undefined, 'deveria estar fora da janela de 90 dias');
    assert.ok(achar(await listar({ entregues: '1', q: cli.nome }), ped), 'a busca deveria ignorar a janela');
  } finally { await cleanup(); }
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `node --test test/demanda-entregues.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`

Expected: falhas a partir do terceiro teste. Hoje `listarPedidos` ignora `req.query` e devolve todos os pedidos, então nada sai da lista padrão e `p.entregue` é `undefined`.

- [ ] **Step 3: Reescrever `listarPedidos`**

Substituir a função inteira (linhas 20-30 de `src/controllers/demandaController.js`) por:

```js
// GET /api/demanda?entregues=1&q=nome
// "Entregue" e derivado do status das vendas: o pedido tem venda ligada e todas
// elas estao Entregue. Cancelada nao conta, entao cancelar devolve o card p/ Pedidos.
async function listarPedidos(req, res) {
  const somenteEntregues = String((req.query && req.query.entregues) || '') === '1';
  const busca = String((req.query && req.query.q) || '').trim();

  const params = [];
  let filtroNome = '';
  if (busca) { filtroNome = ' AND c.name LIKE ?'; params.push('%' + busca + '%'); }

  // Sem busca, a aba Entregues mostra os ultimos 90 dias. Com busca a janela e
  // ignorada de proposito: filtrar por data anularia a busca justamente quando
  // ela e usada — achar um pedido antigo.
  const filtroEntrega = somenteEntregues
    ? (busca
        ? ' HAVING entregue_flag = 1'
        : ' HAVING entregue_flag = 1 AND entregue_em >= (NOW() - INTERVAL 90 DAY)')
    : ' HAVING entregue_flag = 0';

  const ordem = somenteEntregues ? ' ORDER BY entregue_em DESC' : ' ORDER BY dp.created_at DESC';

  try {
    const [rows] = await db.query(
      `SELECT dp.id, dp.client_id, c.name AS client_name, dp.observacao, dp.status, dp.created_at,
              (SELECT COUNT(*) FROM demanda_itens i WHERE i.pedido_id = dp.id) AS qtd_itens,
              (SELECT COUNT(*) FROM demanda_itens i WHERE i.pedido_id = dp.id AND i.order_id IS NULL) AS itens_pendentes,
              (SELECT MAX(COALESCE(o.delivered_at, o.created_at))
                 FROM demanda_itens i JOIN orders o ON o.id = i.order_id
                WHERE i.pedido_id = dp.id AND o.status = 'Entregue') AS entregue_em,
              CASE WHEN
                (SELECT COUNT(DISTINCT i.order_id) FROM demanda_itens i
                  WHERE i.pedido_id = dp.id AND i.order_id IS NOT NULL) > 0
                AND
                (SELECT COUNT(DISTINCT i.order_id) FROM demanda_itens i
                  WHERE i.pedido_id = dp.id AND i.order_id IS NOT NULL)
                =
                (SELECT COUNT(DISTINCT i.order_id) FROM demanda_itens i
                   JOIN orders o ON o.id = i.order_id
                  WHERE i.pedido_id = dp.id AND o.status = 'Entregue')
              THEN 1 ELSE 0 END AS entregue_flag
       FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id
       WHERE 1=1${filtroNome}${filtroEntrega}${ordem} LIMIT 300`, params);

    return res.json(rows.map(r => ({ ...r, entregue: Number(r.entregue_flag) === 1 })));
  } catch (e) { console.error('listarPedidos', e); return res.status(500).json({ error: 'Erro ao listar.' }); }
}
```

As subconsultas do `CASE` são repetidas de propósito em vez de referenciarem aliases: o MySQL não garante o uso de um alias do `SELECT` dentro de outra coluna do mesmo `SELECT`. `HAVING` pode usar os aliases normalmente.

Um `order_id` apontando para uma venda que não existe mais entra na primeira contagem (itens com `order_id IS NOT NULL`) mas não na segunda (que faz `JOIN orders`), então as duas não batem e o pedido fica em Pedidos — o comportamento seguro.

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --test test/demanda-entregues.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Rodar os testes vizinhos**

Run: `node --test test/demanda-controller.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`

Expected: `# fail 0`. Um pedido recém-criado não tem venda ligada, logo `entregue_flag = 0` e ele continua aparecendo na chamada sem parâmetros.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/demandaController.js test/demanda-entregues.test.js
git commit -m "feat(demanda): separar pedidos entregues dos pendentes na listagem"
```

---

### Task 3: Aba "Entregues" na tela

**Files:**
- Modify: `src/public/demanda.html` (linhas 61-64, 74, 103-109, 122-141)

**Interfaces:**
- Consumes: `entregue`, `itens_pendentes` e `entregue_em` de `GET /api/demanda` (Task 2), e os parâmetros `?entregues=1&q=`.
- Produces: nada (última task de código).

- [ ] **Step 1: Adicionar a aba na navegação**

Trocar as linhas 61-64:

```html
      <ul class="nav nav-tabs mb-3" id="demandaTabs">
        <li class="nav-item"><button class="nav-link active" data-tab="pedidos">Pedidos</button></li>
        <li class="nav-item"><button class="nav-link" data-tab="comprar">Comprar</button></li>
        <li class="nav-item"><button class="nav-link" data-tab="relatorio">Relatório</button></li>
      </ul>
```

por:

```html
      <ul class="nav nav-tabs mb-3" id="demandaTabs">
        <li class="nav-item"><button class="nav-link active" data-tab="pedidos">Pedidos</button></li>
        <li class="nav-item"><button class="nav-link" data-tab="entregues">Entregues</button></li>
        <li class="nav-item"><button class="nav-link" data-tab="comprar">Comprar</button></li>
        <li class="nav-item"><button class="nav-link" data-tab="relatorio">Relatório</button></li>
      </ul>
```

- [ ] **Step 2: Adicionar a seção da aba**

Depois do `</section>` que fecha `#tab-pedidos` e antes de `<section id="tab-comprar" ...>`, inserir:

```html
      <section id="tab-entregues" class="d-none">
        <div class="d-flex gap-2 mb-3 flex-wrap">
          <input id="busca-entregues" class="form-control" placeholder="Buscar por cliente…" style="max-width:320px">
        </div>
        <div id="lista-entregues"></div>
      </section>
```

- [ ] **Step 3: Registrar a aba no `show()`**

Trocar a linha 104:

```js
    for (const s of ['pedidos','comprar','relatorio']) $('#tab-'+s).classList.toggle('d-none', s!==tab);
```

por:

```js
    for (const s of ['pedidos','entregues','comprar','relatorio']) $('#tab-'+s).classList.toggle('d-none', s!==tab);
```

e, logo depois da linha `if (tab==='comprar') carregarCompra();`, acrescentar:

```js
    if (tab==='entregues') carregarEntregues();
```

- [ ] **Step 4: Extrair a montagem do card**

Imediatamente antes de `async function carregarPedidos(){` (linha 122), inserir:

```js
  function dataBr(v){
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? '' : d.toLocaleDateString('pt-BR');
  }

  function cardPedido(p){
    const pend = Number(p.itens_pendentes) > 0
      ? `<span class="badge bg-warning text-dark ms-1"><i class="bi bi-exclamation-triangle"></i> ${p.itens_pendentes} item(ns) pendente(s)</span>`
      : '';
    const entrega = p.entregue && p.entregue_em
      ? `<div class="text-muted small">Entregue em ${dataBr(p.entregue_em)}</div>`
      : '';
    return `
      <div class="card mb-2"><div class="card-body">
        <div class="d-flex justify-content-between">
          <strong>${esc(p.client_name)}</strong>
          <div><span class="badge bg-secondary">${esc(p.status)} · ${p.qtd_itens} itens</span>${pend}</div>
        </div>
        ${p.observacao ? `<div class="text-muted small">${esc(p.observacao)}</div>` : ''}
        ${entrega}
        <button class="btn btn-sm btn-outline-primary mt-2" onclick="abrirPedido(${p.id})">Abrir</button>
        <button class="btn btn-sm btn-outline-danger mt-2 ms-1" onclick="excluirPedido(${p.id})">Excluir</button>
      </div></div>`;
  }
```

- [ ] **Step 5: Usar a função em `carregarPedidos`**

Dentro de `carregarPedidos`, trocar todo o bloco que monta `const cards = pedidos.map(p => ...).join('') || '<p class="text-muted">Nenhum pedido ainda.</p>';` por:

```js
    const cards = pedidos.map(cardPedido).join('') || '<p class="text-muted">Nenhum pedido ainda.</p>';
```

O resto da função — o `topo` com o botão "Gerar todas as vendas", o `innerHTML` e o `btnTodas.onclick` — fica exatamente como está.

- [ ] **Step 6: Escrever `carregarEntregues` e ligar a busca**

Logo depois de `carregarPedidos`, inserir:

```js
  async function carregarEntregues(){
    const q = ($('#busca-entregues').value || '').trim();
    const url = '/api/demanda?entregues=1' + (q ? '&q=' + encodeURIComponent(q) : '');
    const r = await Auth.apiFetch(url);
    const pedidos = await r.json();
    const vazio = q
      ? '<p class="text-muted">Nenhum pedido entregue para essa cliente.</p>'
      : '<p class="text-muted">Nenhum pedido entregue nos últimos 90 dias. Busque pelo nome da cliente para ver os mais antigos.</p>';
    $('#lista-entregues').innerHTML = pedidos.map(cardPedido).join('') || vazio;
  }

  let buscaEntreguesTimer = null;
  document.getElementById('busca-entregues').oninput = () => {
    clearTimeout(buscaEntreguesTimer);
    buscaEntreguesTimer = setTimeout(carregarEntregues, 300);
  };
```

- [ ] **Step 7: Conferir na tela**

Run: `npm run dev`, abrir `http://localhost:3000/demanda.html`.

Verificar nesta ordem:
1. A aba **Entregues** aparece entre Pedidos e Comprar e abre sem erro no console do navegador.
2. Um pedido cuja venda está Pendente aparece em **Pedidos**.
3. Marcar essa venda como Entregue em Listar Pedidos e recarregar: o card saiu de Pedidos e está em **Entregues**, com a data de hoje.
4. Voltar a venda para Pendente: o card volta para **Pedidos**.
5. Um pedido entregue com item que não veio mostra o selo amarelo de pendência, e esse item continua listado na aba **Comprar**.
6. Digitar um nome na busca filtra a lista.

Ao terminar, matar o processo do `npm run dev` para não deixar a porta 3000 ocupada.

- [ ] **Step 8: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): aba Entregues com busca e selo de pendencia"
```

---

### Task 4: Regressão e fechamento

**Files:** nenhum (só verificação)

**Interfaces:**
- Consumes: tudo das Tasks 1-3.
- Produces: nada.

- [ ] **Step 1: Rodar a suíte de demanda inteira**

Cada arquivo precisa do kill, porque o pool não fecha:

```bash
for f in test/demanda-*.test.js test/orders-delivered-at.test.js; do
  echo "== $f"
  node --test "$f" & TP=$!; sleep 25; kill $TP 2>/dev/null
done
```

Expected: `# fail 0` em todos os arquivos. Se algum falhar, anotar a saída real antes de seguir — não seguir com falha em aberto.

- [ ] **Step 2: Conferir que o escopo não vazou**

Run: `git diff main --stat`

Expected: apenas `src/database/connection.js`, `src/controllers/orderController.js`, `src/controllers/demandaController.js`, `src/public/demanda.html`, `test/orders-delivered-at.test.js`, `test/demanda-entregues.test.js` e os dois arquivos em `docs/superpowers/`. Nada em `nfController.js`, na aba Comprar ou no Relatório.

- [ ] **Step 3: Push da branch**

```bash
git push origin Teste
```

Não fazer merge para `main` — o usuário decide quando publicar.
