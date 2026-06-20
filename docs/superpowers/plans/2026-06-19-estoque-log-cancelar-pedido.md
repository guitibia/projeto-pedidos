# Estoque Log Geral + Cancelar Pedido Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar console/log geral de movimentações no estoque e botão para cancelar pedidos com restauração automática de estoque e registro do motivo.

**Architecture:** Novo endpoint `GET /api/estoque/log` retorna movimentações de todos os produtos com JOIN em products. `updateOrderStatus` para Cancelado vira transacional: restaura estoque + registra motivo. `deleteOrder` ganha o mesmo registro de motivo. Frontend: painel colapsável no estoque e botão "Cancelar" no modal de pedidos.

**Tech Stack:** Node.js/Express, MySQL (mysql2/promise pool), Bootstrap 5, SweetAlert2, JS vanilla

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- CommonJS (`require`/`module.exports`) — sem ES modules
- Dark theme via CSS custom properties (`var(--border)`, `var(--text-muted)`, etc.)
- `esc(v)` já existe em todas as páginas HTML para XSS escaping — usar sempre em innerHTML com dados do banco
- `Auth.apiFetch` para todas as chamadas de API no frontend
- Sem testes automatizados — verificar via curl + browser

---

### Task 1: Backend — GET /api/estoque/log

**Files:**
- Modify: `src/controllers/estoqueController.js`
- Modify: `src/routes/estoque.js`

**Interfaces:**
- Produz: `GET /api/estoque/log?limit=N` → `[{ id, product_name, franchise, code, tipo, quantidade, observacao, created_at }]`

- [ ] **Step 1: Adicionar função `logGeral` no controller**

Em `src/controllers/estoqueController.js`, adicionar antes do `module.exports`:

```js
// GET /api/estoque/log
async function logGeral(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    const [rows] = await db.query(
      `SELECT m.id, p.name AS product_name, p.franchise, p.code,
              m.tipo, m.quantidade, m.observacao, m.created_at
       FROM estoque_movimentacoes m
       JOIN products p ON p.id = m.product_id
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar log geral:', err);
    return res.status(500).json({ error: 'Erro ao buscar log.' });
  }
}
```

Atualizar `module.exports`:
```js
module.exports = { listEstoque, movimentar, historico, logGeral };
```

- [ ] **Step 2: Registrar rota no router**

Em `src/routes/estoque.js`, importar `logGeral` e adicionar a rota **antes** das rotas com `/:id` (para `/log` não ser interpretado como um ID):

```js
const { listEstoque, movimentar, historico, logGeral } = require('../controllers/estoqueController');
router.get('/',                  listEstoque);
router.get('/log',               logGeral);        // ← nova linha, antes de /:id
router.post('/:id/movimentacao', movimentar);
router.get('/:id/historico',     historico);
```

- [ ] **Step 3: Testar endpoint**

```bash
# 1. Obter token
TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. Chamar endpoint
curl -s "http://localhost:3000/api/estoque/log?limit=5" \
  -H "Authorization: Bearer $TOKEN" | head -c 400
```

Esperado: array JSON com campos `product_name`, `franchise`, `code`, `tipo`, `quantidade`, `observacao`, `created_at`.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/estoqueController.js src/routes/estoque.js
git commit -m "feat(estoque): endpoint GET /api/estoque/log retorna log geral de movimentações"
```

---

### Task 2: Backend — deleteOrder registra motivo + updateOrderStatus cancela com restauração

**Files:**
- Modify: `src/controllers/orderController.js`

**Interfaces:**
- `deleteOrder`: sem mudança de assinatura; agora insere em `estoque_movimentacoes` com `observacao = "Pedido #ID excluído"`
- `updateOrderStatus`: quando `status === 'Cancelado'`, usa transação, restaura estoque e insere em `estoque_movimentacoes` com `observacao = "Pedido #ID cancelado"`

- [ ] **Step 1: Atualizar `deleteOrder` para registrar motivo**

No bloco `for (const p of produtos)` dentro de `deleteOrder`, adicionar o INSERT após o UPDATE:

```js
for (const p of produtos) {
  if (!p.not_came) {
    await conn.query(
      'UPDATE products SET estoque = estoque + ? WHERE id = ?',
      [p.quantity, p.product_id]
    );
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
      [p.product_id, 'Entrada', p.quantity, `Pedido #${id} excluído`]
    );
  }
}
```

- [ ] **Step 2: Substituir `updateOrderStatus` pela versão transacional para Cancelado**

Substituir a função inteira:

```js
async function updateOrderStatus(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { status } = req.body;
  const statusValidos = ['Pendente', 'Entregue', 'Cancelado'];
  if (!status || !statusValidos.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${statusValidos.join(', ')}.` });
  }

  // Pendente/Entregue: atualização simples sem transação
  if (status !== 'Cancelado') {
    try {
      const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
      return res.json({ message: 'Status atualizado com sucesso!' });
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      return res.status(500).json({ error: 'Erro ao atualizar status.' });
    }
  }

  // Cancelado: transação — atualiza status + restaura estoque + registra motivo
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const [produtos] = await conn.query(
      'SELECT product_id, quantity, not_came FROM order_products WHERE order_id = ?',
      [id]
    );

    for (const p of produtos) {
      if (!p.not_came) {
        await conn.query(
          'UPDATE products SET estoque = estoque + ? WHERE id = ?',
          [p.quantity, p.product_id]
        );
        await conn.query(
          'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
          [p.product_id, 'Entrada', p.quantity, `Pedido #${id} cancelado`]
        );
      }
    }

    await conn.commit();
    return res.json({ message: 'Pedido cancelado e estoque restaurado.' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Erro ao cancelar pedido:', err);
    return res.status(500).json({ error: 'Erro ao cancelar pedido.' });
  } finally {
    if (conn) conn.release();
  }
}
```

- [ ] **Step 3: Testar cancelamento via curl**

```bash
TOKEN=$(curl -s http://localhost:3000/api/auth/login \
  -X POST -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# Substituir 1 pelo ID de um pedido Pendente existente
curl -s http://localhost:3000/api/orders/1/status \
  -X PUT -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"status":"Cancelado"}'
```

Esperado: `{"message":"Pedido cancelado e estoque restaurado."}`

Verificar log:
```bash
curl -s "http://localhost:3000/api/estoque/log?limit=5" \
  -H "Authorization: Bearer $TOKEN"
```

Esperado: entradas com `observacao = "Pedido #1 cancelado"`.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/orderController.js
git commit -m "feat(orders): cancelar pedido restaura estoque e registra motivo; deleteOrder registra motivo"
```

---

### Task 3: Frontend — painel colapsável de log no estoque.html

**Files:**
- Modify: `src/public/estoque.html`

**Interfaces:**
- Consome: `GET /api/estoque/log?limit=100` (Task 1)
- Produz: painel colapsável com tabela de movimentações

- [ ] **Step 1: Adicionar botão "Log Geral" no hero**

Na seção hero do estoque.html, onde existe o `d-flex align-items-center justify-content-between`, adicionar o botão no lado direito:

```html
<div class="d-flex align-items-center justify-content-between mb-4 gap-3 flex-wrap">
  <div class="d-flex align-items-center gap-3">
    <div class="page-hero-icon"><i class="bi bi-archive-fill"></i></div>
    <div>
      <div class="page-hero-title">Estoque</div>
      <div class="page-hero-sub" id="estoque-sub">Carregando...</div>
    </div>
  </div>
  <button id="btnLogGeral" onclick="toggleLog()"
    style="border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;padding:.45rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .15s">
    <i class="bi bi-journal-text me-1"></i> Log Geral
  </button>
</div>
```

- [ ] **Step 2: Adicionar painel colapsável entre o hero e o resumo**

Logo após o fechamento da div do hero e antes de `<!-- Resumo -->`:

```html
<!-- Painel Log Geral -->
<div id="logPanel" style="display:none;margin-bottom:1.5rem">
  <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1.25rem">
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h6 style="margin:0;font-weight:600;color:var(--text-primary)">
        <i class="bi bi-journal-text me-2" style="color:var(--accent)"></i>Log de Movimentações
      </h6>
      <span style="font-size:.8rem;color:var(--text-muted)" id="log-count"></span>
    </div>
    <div id="log-container">
      <div class="empty-state"><i class="bi bi-hourglass-split"></i>Carregando...</div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Adicionar funções `toggleLog` e `loadLog` no bloco `<script>`**

No bloco `<script>` da página, adicionar após as funções existentes de historico/movimentação:

```js
let logVisible = false;

async function toggleLog() {
  logVisible = !logVisible;
  const panel  = document.getElementById('logPanel');
  const btnLog = document.getElementById('btnLogGeral');
  panel.style.display = logVisible ? '' : 'none';
  btnLog.innerHTML = logVisible
    ? '<i class="bi bi-x-circle me-1"></i> Fechar Log'
    : '<i class="bi bi-journal-text me-1"></i> Log Geral';
  if (logVisible) await loadLog();
}

async function loadLog() {
  const container = document.getElementById('log-container');
  container.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>Carregando...</div>';
  try {
    const res  = await Auth.apiFetch('/api/estoque/log?limit=100');
    const rows = await res.json();
    document.getElementById('log-count').textContent = `${rows.length} registros`;
    if (!rows.length) {
      container.innerHTML = '<div class="empty-state"><i class="bi bi-journal-x"></i>Nenhuma movimentação registrada.</div>';
      return;
    }
    container.innerHTML = `<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.83rem">
      <thead>
        <tr style="border-bottom:2px solid var(--border)">
          <th style="padding:.5rem .75rem;text-align:left;color:var(--text-muted);font-weight:600">Data/Hora</th>
          <th style="padding:.5rem .75rem;text-align:left;color:var(--text-muted);font-weight:600">Produto</th>
          <th style="padding:.5rem .75rem;text-align:left;color:var(--text-muted);font-weight:600">Franquia</th>
          <th style="padding:.5rem .75rem;text-align:center;color:var(--text-muted);font-weight:600">Tipo</th>
          <th style="padding:.5rem .75rem;text-align:center;color:var(--text-muted);font-weight:600">Qtd</th>
          <th style="padding:.5rem .75rem;text-align:left;color:var(--text-muted);font-weight:600">Motivo</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `<tr style="border-bottom:1px solid var(--border)">
          <td style="padding:.5rem .75rem;color:var(--text-muted);white-space:nowrap;font-size:.78rem">
            ${new Date(r.created_at).toLocaleString('pt-BR')}
          </td>
          <td style="padding:.5rem .75rem;color:var(--text-primary)">
            ${esc(r.product_name)}
            <span style="font-size:.72rem;color:var(--text-muted)">#${esc(r.code)}</span>
          </td>
          <td style="padding:.5rem .75rem;color:var(--text-muted)">${esc(r.franchise)}</td>
          <td style="padding:.5rem .75rem;text-align:center">
            <span style="font-size:.75rem;padding:.18rem .5rem;border-radius:5px;font-weight:700;
              ${r.tipo==='Entrada'
                ? 'background:rgba(63,185,80,.12);color:#3fb950;border:1px solid rgba(63,185,80,.3)'
                : 'background:rgba(248,81,73,.12);color:#f85149;border:1px solid rgba(248,81,73,.3)'}">
              ${r.tipo === 'Entrada' ? '▲' : '▼'} ${esc(r.tipo)}
            </span>
          </td>
          <td style="padding:.5rem .75rem;text-align:center;font-weight:700;color:var(--text-primary)">${r.quantidade}</td>
          <td style="padding:.5rem .75rem;color:var(--text-muted);font-size:.8rem">${esc(r.observacao || '—')}</td>
        </tr>`).join('')}
      </tbody>
    </table></div>`;
  } catch (e) {
    document.getElementById('log-container').innerHTML =
      '<div class="empty-state"><i class="bi bi-exclamation-circle"></i>Erro ao carregar log.</div>';
  }
}
```

- [ ] **Step 4: Verificar no browser**

Abrir http://localhost:3000/estoque.html, clicar em "Log Geral" e verificar que o painel expande com a tabela de movimentações. Clicar novamente fecha. Badge verde para Entrada, vermelho para Saída.

- [ ] **Step 5: Commit**

```bash
git add src/public/estoque.html
git commit -m "feat(estoque): painel colapsável Log Geral com tabela de todas as movimentações"
```

---

### Task 4: Frontend — botão "Cancelar Pedido" no pedidos.html

**Files:**
- Modify: `src/public/pedidos.html`

**Interfaces:**
- Consome: `PUT /api/orders/:id/status` com `{ status: 'Cancelado' }` (Task 2)
- Produz: botão vermelho no modal de detalhes do pedido, visível apenas quando `status === 'Pendente'`

- [ ] **Step 1: Adicionar botão no HTML do modal de detalhes**

No modal `#orderDetailsModal`, localizar o botão `markAsDeliveredButton` e adicionar o botão de cancelamento logo após:

```html
<button id="cancelOrderButton"
  style="border:1px solid rgba(248,81,73,.5);background:rgba(248,81,73,.08);color:#f85149;
         border-radius:8px;padding:.4rem .9rem;font-size:.82rem;font-weight:600;cursor:pointer;
         display:none;transition:all .15s">
  <i class="bi bi-x-circle me-1"></i> Cancelar Pedido
</button>
```

- [ ] **Step 2: Conectar botão na função `viewOrder`**

Na função `viewOrder`, logo após as linhas que configuram `btnDeliver`, adicionar:

```js
const btnCancel = document.getElementById('cancelOrderButton');
btnCancel.onclick = () => cancelOrder(id);
btnCancel.style.display = (order.status === 'Pendente') ? '' : 'none';
```

- [ ] **Step 3: Adicionar função `cancelOrder`**

Logo após a função `markDelivered`, adicionar:

```js
async function cancelOrder(id) {
  const result = await Swal.fire({
    title: 'Cancelar pedido?',
    text: 'O estoque dos produtos será restaurado automaticamente.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Sim, cancelar',
    cancelButtonText: 'Voltar',
    confirmButtonColor: '#f85149'
  });
  if (!result.isConfirmed) return;

  const res = await Auth.apiFetch(`/api/orders/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'Cancelado' })
  });
  if (!res.ok) return Swal.fire('Erro', 'Não foi possível cancelar o pedido.', 'error');

  bootstrap.Modal.getInstance(document.getElementById('orderDetailsModal'))?.hide();
  Swal.fire({ icon: 'success', title: 'Pedido cancelado!', text: 'Estoque restaurado.', timer: 2000, showConfirmButton: false });
  loadOrders();
}
```

- [ ] **Step 4: Verificar no browser**

1. Abrir http://localhost:3000/pedidos.html
2. Clicar num pedido com status **Pendente** → modal deve mostrar botão vermelho "Cancelar Pedido"
3. Clicar em cancelar → SweetAlert2 de confirmação aparece
4. Confirmar → pedido muda para Cancelado, modal fecha, lista atualiza
5. Clicar no mesmo pedido → botão "Cancelar Pedido" não aparece mais (status Cancelado)
6. Abrir estoque.html → Log Geral mostra entrada com "Pedido #N cancelado"

- [ ] **Step 5: Commit**

```bash
git add src/public/pedidos.html
git commit -m "feat(pedidos): botão Cancelar Pedido com confirmação e restauração de estoque"
```
