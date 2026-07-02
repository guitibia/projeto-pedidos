# Perfil do cliente (histórico + métricas) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Painel de perfil do cliente (dados cadastrais + métricas de compra + top produtos) na página Clientes, alimentado por um endpoint de resumo somente-leitura.

**Architecture:** `GET /api/clients/:id/summary` (`clientController.clientSummary`) agrega orders/order_products; `clientes.html` renderiza um painel `#client-profile` ao selecionar o cliente.

**Tech Stack:** Node 22 (Express, MySQL), Bootstrap 5, `Auth.apiFetch`, `node:test`.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Somente leitura (nenhum INSERT/UPDATE/DELETE). Sem mudança de schema. `/api/clients` já é admin-only (auth).
- Total gasto e ticket médio **excluem** `status = 'Cancelado'`; total de pedidos conta todos.
- Top produtos excluem pedidos cancelados. Valores monetários convertidos com `Number(...)`.

---

### Task 1: Endpoint `GET /api/clients/:id/summary`

**Files:**
- Modify: `src/controllers/clientController.js` (nova `clientSummary` + export)
- Modify: `src/routes/clients.js` (importar + `router.get('/:id/summary', clientSummary)`)
- Test: `test/perfil-cliente.test.js`

**Interfaces:**
- Produces: `clientSummary(req, res)` → `{ client, stats, topProdutos }` (ver spec).

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/perfil-cliente.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { clientSummary } = require('../src/controllers/clientController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}

async function seed() {
  const [c] = await db.query(
    "INSERT INTO clients (name, address, house_number, neighborhood) VALUES ('ZZ Perfil Cliente', 'Rua X', '1', 'Centro')");
  const cid = c.insertId;
  const [pr] = await db.query(
    "INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES ('ZZ Perfil Prod', 1, 10, 'Outros', ?, 0)",
    ['ZZP' + Date.now() + Math.random().toString(36).slice(2, 6)]);
  const pid = pr.insertId;
  const [o1] = await db.query(
    "INSERT INTO orders (client_id, payment_method, total_cost, status, origin) VALUES (?, 'PIX', 100, 'Entregue', 'Site')", [cid]);
  const [o2] = await db.query(
    "INSERT INTO orders (client_id, payment_method, total_cost, status, origin) VALUES (?, 'DINHEIRO', 50, 'Cancelado', 'Presencial')", [cid]);
  await db.query("INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES (?, ?, 10, 3, 1)", [o1.insertId, pid]);
  await db.query("INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES (?, ?, 10, 5, 1)", [o2.insertId, pid]);
  return { cid, pid, o1: o1.insertId, o2: o2.insertId };
}
async function cleanup(s) {
  await db.query('DELETE FROM order_products WHERE order_id IN (?, ?)', [s.o1, s.o2]);
  await db.query('DELETE FROM orders WHERE id IN (?, ?)', [s.o1, s.o2]);
  await db.query('DELETE FROM products WHERE id = ?', [s.pid]);
  await db.query('DELETE FROM clients WHERE id = ?', [s.cid]);
}

test('clientSummary: agrega pedidos e exclui cancelados do financeiro', async () => {
  const s = await seed();
  const res = mockRes();
  await clientSummary({ params: { id: String(s.cid) } }, res);
  const b = res.body;
  assert.strictEqual(b.client.name, 'ZZ Perfil Cliente');
  assert.strictEqual(b.stats.totalPedidos, 2);
  assert.strictEqual(Number(b.stats.totalGasto), 100);      // exclui o cancelado (50)
  assert.strictEqual(Number(b.stats.ticketMedio), 100);     // 100 / 1 pedido válido
  // topProdutos: só o pedido não-cancelado (qtd 3, total 30)
  assert.strictEqual(b.topProdutos.length, 1);
  assert.strictEqual(Number(b.topProdutos[0].qtd), 3);
  assert.strictEqual(Number(b.topProdutos[0].total), 30);
  const statuses = b.stats.porStatus.map(r => r.status).sort();
  assert.deepStrictEqual(statuses, ['Cancelado', 'Entregue']);
  await cleanup(s);
});

test('clientSummary: id inexistente → 404', async () => {
  const res = mockRes();
  await clientSummary({ params: { id: '999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/perfil-cliente.test.js`
Expected: FAIL — `clientSummary` não existe (TypeError). (`--test-force-exit` porque o require abre o pool MySQL.)

> Se um INSERT do seed falhar por coluna NOT NULL (ex.: `order_products.not_came`, colunas de `orders`), inspecionar as colunas reais e ajustar SOMENTE as listas de colunas do seed; manter asserções e a lógica de `clientSummary`.

- [ ] **Step 3: Implementar `clientSummary`**

Em `src/controllers/clientController.js`, adicionar (após `deleteClient`):

```js
// GET /api/clients/:id/summary  — dados cadastrais + métricas de compra (somente leitura)
async function clientSummary(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[client]] = await db.query(
      'SELECT id, name, email, email_verified, cpf, phone, birthdate, cep, address, house_number, neighborhood, city, created_at FROM clients WHERE id = ?',
      [id]);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const [[tot]] = await db.query(
      'SELECT COUNT(*) totalPedidos, MIN(created_at) primeiraCompra, MAX(created_at) ultimaCompra FROM orders WHERE client_id = ?',
      [id]);
    const [[fin]] = await db.query(
      "SELECT COALESCE(SUM(total_cost),0) totalGasto, COUNT(*) validos FROM orders WHERE client_id = ? AND status <> 'Cancelado'",
      [id]);
    const totalGasto = Number(fin.totalGasto) || 0;
    const ticketMedio = fin.validos > 0 ? totalGasto / fin.validos : 0;

    const [porStatus] = await db.query(
      'SELECT status, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY status', [id]);
    const [porOrigem] = await db.query(
      'SELECT origin, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY origin', [id]);
    const [[pref]] = await db.query(
      'SELECT payment_method, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY payment_method ORDER BY n DESC LIMIT 1', [id]);
    const [topProdutos] = await db.query(
      `SELECT op.product_id, p.name, SUM(op.quantity) qtd, SUM(op.quantity * op.sale_price) total
       FROM order_products op
       JOIN orders o ON o.id = op.order_id
       JOIN products p ON p.id = op.product_id
       WHERE o.client_id = ? AND o.status <> 'Cancelado'
       GROUP BY op.product_id, p.name
       ORDER BY qtd DESC
       LIMIT 5`, [id]);

    return res.json({
      client,
      stats: {
        totalPedidos: tot.totalPedidos,
        totalGasto,
        ticketMedio,
        primeiraCompra: tot.primeiraCompra,
        ultimaCompra: tot.ultimaCompra,
        porStatus,
        porOrigem,
        pagamentoPreferido: pref ? pref.payment_method : null
      },
      topProdutos: topProdutos.map(r => ({ product_id: r.product_id, name: r.name, qtd: Number(r.qtd), total: Number(r.total) }))
    });
  } catch (e) {
    console.error('Erro no resumo do cliente:', e);
    return res.status(500).json({ error: 'Erro ao buscar o resumo do cliente.' });
  }
}
```

No `module.exports`, acrescentar `clientSummary`.

- [ ] **Step 4: Registrar a rota**

Em `src/routes/clients.js`, incluir `clientSummary` no `require(...)` e adicionar (pode ser após a linha do `/:clientId/orders`):

```js
router.get('/:id/summary', clientSummary);
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/perfil-cliente.test.js`
Expected: PASS — 2 verdes. Encerrar node pendente (liberar porta 3000).

- [ ] **Step 6: Commit**

```bash
git add src/controllers/clientController.js src/routes/clients.js test/perfil-cliente.test.js
git commit -m "feat(clientes): GET /api/clients/:id/summary (metricas + dados do cliente)"
```

---

### Task 2: Painel de perfil em `clientes.html`

**Files:**
- Modify: `src/public/clientes.html` (contêiner `#client-profile` + `loadClientSummary` + chamada no `loadClientOrders`)

**Interfaces:**
- Consumes (da Task 1): `GET /api/clients/:id/summary` → `{ client, stats, topProdutos }`.

- [ ] **Step 1: Contêiner do painel**

Em `src/public/clientes.html`, adicionar um contêiner vazio logo acima da seção que lista os pedidos (a `<table>`/card do histórico). Ex.: inserir antes do bloco do histórico:

```html
      <div id="client-profile" style="display:none;margin-bottom:1rem"></div>
```

- [ ] **Step 2: Buscar/renderizar o resumo**

Adicionar no `<script>` (perto de `loadClientOrders`):

```js
  async function loadClientSummary(clientId) {
    const box = document.getElementById('client-profile');
    if (!clientId) { box.style.display = 'none'; box.innerHTML = ''; return; }
    try {
      const res = await Auth.apiFetch('/api/clients/' + clientId + '/summary');
      if (!res.ok) { box.style.display = 'none'; box.innerHTML = ''; return; }
      const d = await res.json();
      const c = d.client, s = d.stats;
      const dt   = v => v ? new Date(v).toLocaleDateString('pt-BR') : '—';
      const mesAno = v => v ? new Date(v).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : '—';
      const origemTop = (s.porOrigem && s.porOrigem.length)
        ? s.porOrigem.slice().sort((a, b) => b.n - a.n)[0].origin : null;
      const statusChips = (s.porStatus || [])
        .map(r => `<span style="display:inline-block;padding:.15rem .5rem;border-radius:20px;background:var(--hover-tint);border:1px solid var(--border);font-size:.72rem;margin:.1rem">${esc(r.status)}: <b>${r.n}</b></span>`).join('');
      const top = (d.topProdutos || [])
        .map((p, i) => `<div style="display:flex;justify-content:space-between;gap:.5rem;font-size:.8rem;padding:.2rem 0"><span>${i + 1}. ${esc(p.name)}</span><span style="color:var(--text-muted);white-space:nowrap">${p.qtd}un · ${fmt(p.total)}</span></div>`).join('') || '<span style="color:var(--text-muted);font-size:.8rem">Sem produtos.</span>';
      const kpi = (label, val) => `<div style="flex:1;min-width:120px;background:var(--card-bg,#fff);border:1px solid var(--border);border-radius:10px;padding:.6rem .8rem"><div style="font-size:.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">${label}</div><div style="font-size:1.15rem;font-weight:700">${val}</div></div>`;

      box.innerHTML = `
        <div style="border:1px solid var(--border);border-radius:14px;padding:1rem 1.1rem;background:var(--card-bg,#fff)">
          <div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap;margin-bottom:.5rem">
            <span style="font-size:1.15rem;font-weight:800">${esc(c.name)}</span>
            <span style="font-size:.78rem;color:var(--text-muted)">cliente desde ${mesAno(c.created_at)}</span>
            ${c.email_verified ? '<span style="font-size:.7rem;color:#2ea043"><i class="bi bi-patch-check-fill"></i> e-mail verificado</span>' : ''}
            ${origemTop ? `<span style="font-size:.7rem;color:var(--text-muted)"><i class="bi bi-shop"></i> ${esc(origemTop)}</span>` : ''}
          </div>
          <div style="font-size:.82rem;color:var(--text-muted);margin-bottom:.8rem">
            <i class="bi bi-envelope"></i> ${esc(c.email || '—')} &nbsp;·&nbsp;
            <i class="bi bi-telephone"></i> ${esc(c.phone || '—')} &nbsp;·&nbsp;
            CPF ${esc(c.cpf || '—')} &nbsp;·&nbsp;
            Nasc. ${dt(c.birthdate)}<br>
            <i class="bi bi-geo-alt"></i> ${esc([c.address, c.house_number].filter(Boolean).join(', ') || '—')}${c.neighborhood ? ' — ' + esc(c.neighborhood) : ''}${c.city ? ', ' + esc(c.city) : ''}${c.cep ? ' (CEP ' + esc(c.cep) + ')' : ''}
          </div>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.8rem">
            ${kpi('Total de pedidos', s.totalPedidos)}
            ${kpi('Total gasto', fmt(s.totalGasto))}
            ${kpi('Ticket médio', fmt(s.ticketMedio))}
            ${kpi('Última compra', dt(s.ultimaCompra))}
          </div>
          <div style="font-size:.78rem;color:var(--text-muted);margin-bottom:.6rem">
            Primeira compra: ${dt(s.primeiraCompra)} &nbsp;·&nbsp; Pagamento preferido: <b>${esc(s.pagamentoPreferido || '—')}</b>
          </div>
          <div style="margin-bottom:.7rem">${statusChips}</div>
          <div>
            <div style="font-size:.72rem;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:.3rem">Produtos mais comprados</div>
            ${top}
          </div>
        </div>`;
      box.style.display = 'block';
    } catch (e) {
      box.style.display = 'none'; box.innerHTML = '';
    }
  }
```

- [ ] **Step 3: Chamar ao selecionar o cliente**

Em `loadClientOrders()`, no ponto em que já se tem `clientId` (início da função), adicionar a chamada ao resumo — inclusive quando não há cliente selecionado (esconde o painel). Concretamente, logo após `const clientId = document.getElementById('clientSelect').value;`, inserir:

```js
    loadClientSummary(clientId);
```

- [ ] **Step 4: Verificar o parse do HTML/JS**

```bash
node -e "const h=require('fs').readFileSync('src/public/clientes.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; summary:', h.includes('async function loadClientSummary'), '| chamada:', h.includes('loadClientSummary(clientId)'), '| box:', h.includes('id=\"client-profile\"'));"
```
Expected: `parse OK; summary: true | chamada: true | box: true`.

- [ ] **Step 5: Commit**

```bash
git add src/public/clientes.html
git commit -m "feat(painel): painel de perfil do cliente (dados + metricas + top produtos)"
```

---

## Verificação final (após as 2 tasks)

- [ ] `node --test --test-force-exit test/perfil-cliente.test.js` → 2 verdes; encerrar node (porta 3000 livre).
- [ ] Teste manual (opcional): subir o app, abrir Clientes, escolher um cliente com pedidos e conferir o painel; encerrar node.
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
