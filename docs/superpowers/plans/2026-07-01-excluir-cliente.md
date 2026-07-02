# Botão "Excluir cliente" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excluir um cliente pelo painel (só quem não tem pedidos), removendo também os favoritos dele; bloquear com 409 quem tem pedidos.

**Architecture:** Endpoint `DELETE /api/clients/:id` (`clientController.deleteClient`) transacional; botão "Excluir cliente" na página `clientes.html` agindo sobre o cliente selecionado no dropdown.

**Tech Stack:** Node 22 (Express, MySQL), Bootstrap 5 + SweetAlert2, `Auth.apiFetch`, `node:test`.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Cliente com pedidos → 409, não apaga nada. Cliente sem pedidos → apaga `favoritos` dele e o `clients`.
- Transacional; rollback em erro; `finally` libera conexão. `/api/clients` já está atrás de `auth` (admin-only).
- Resposta de sucesso: `{ ok:true, nome }`. Sem mudança de schema.

---

### Task 1: Endpoint `DELETE /api/clients/:id`

**Files:**
- Modify: `src/controllers/clientController.js` (nova `deleteClient` + export)
- Modify: `src/routes/clients.js` (importar + registrar a rota DELETE)
- Test: `test/excluir-cliente.test.js`

**Interfaces:**
- Produces: `deleteClient(req, res)` — handler para `DELETE /api/clients/:id`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/excluir-cliente.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { deleteClient } = require('../src/controllers/clientController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}

async function seedClient() {
  const [c] = await db.query(
    "INSERT INTO clients (name, address, house_number, neighborhood) VALUES ('ZZ Del Cliente', 'Rua X', '1', 'Centro')");
  return c.insertId;
}

test('deleteClient: cliente sem pedidos é excluído (e favoritos limpos)', async () => {
  const id = await seedClient();
  // um favorito qualquer (product_id fictício)
  await db.query('INSERT INTO favoritos (client_id, product_id) VALUES (?, ?)', [id, 999999]);
  const res = mockRes();
  await deleteClient({ params: { id: String(id) } }, res);
  assert.strictEqual(res.body.ok, true);
  const [[c]] = await db.query('SELECT COUNT(*) n FROM clients WHERE id=?', [id]);
  assert.strictEqual(c.n, 0);
  const [[f]] = await db.query('SELECT COUNT(*) n FROM favoritos WHERE client_id=?', [id]);
  assert.strictEqual(f.n, 0);
});

test('deleteClient: cliente com pedido → 409 e permanece', async () => {
  const id = await seedClient();
  const [o] = await db.query(
    "INSERT INTO orders (client_id, payment_method, total_cost, status) VALUES (?, 'Dinheiro', 0, 'Pendente')",
    [id]);
  const res = mockRes();
  await deleteClient({ params: { id: String(id) } }, res);
  assert.strictEqual(res.statusCode, 409);
  const [[c]] = await db.query('SELECT COUNT(*) n FROM clients WHERE id=?', [id]);
  assert.strictEqual(c.n, 1);
  // cleanup
  await db.query('DELETE FROM orders WHERE id=?', [o.insertId]);
  await db.query('DELETE FROM clients WHERE id=?', [id]);
});

test('deleteClient: id inexistente → 404', async () => {
  const res = mockRes();
  await deleteClient({ params: { id: '999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/excluir-cliente.test.js`
Expected: FAIL — `deleteClient` não existe (import undefined → TypeError). (`--test-force-exit` porque o require do controller abre o pool MySQL.)

> Se algum INSERT do seed falhar por coluna NOT NULL em `clients`/`orders`/`favoritos`, inspecionar as colunas reais e ajustar SOMENTE as listas de colunas dos INSERTs do seed; manter as asserções e a lógica de `deleteClient` como especificado.

- [ ] **Step 3: Implementar `deleteClient`**

Em `src/controllers/clientController.js`, adicionar (após `listClientOrders`):

```js
// DELETE /api/clients/:id  — exclui cliente sem pedidos (limpa favoritos)
async function deleteClient(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[cli]] = await conn.query('SELECT id, name FROM clients WHERE id = ?', [id]);
    if (!cli) { await conn.rollback(); return res.status(404).json({ error: 'Cliente não encontrado.' }); }

    const [[{ c }]] = await conn.query('SELECT COUNT(*) c FROM orders WHERE client_id = ?', [id]);
    if (c > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Este cliente tem ' + c + ' pedido(s) e não pode ser excluído.' });
    }

    await conn.query('DELETE FROM favoritos WHERE client_id = ?', [id]);
    await conn.query('DELETE FROM clients WHERE id = ?', [id]);
    await conn.commit();
    return res.json({ ok: true, nome: cli.name });
  } catch (e) {
    await conn.rollback();
    console.error('Erro ao excluir cliente:', e);
    return res.status(500).json({ error: 'Erro ao excluir o cliente.' });
  } finally {
    conn.release();
  }
}
```

No `module.exports`, acrescentar `deleteClient`.

- [ ] **Step 4: Registrar a rota**

Em `src/routes/clients.js`, incluir `deleteClient` no `require(...)` do controller e adicionar:

```js
router.delete('/:id', deleteClient);
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/excluir-cliente.test.js`
Expected: PASS — 3 verdes. Encerrar node pendente (liberar porta 3000).

- [ ] **Step 6: Commit**

```bash
git add src/controllers/clientController.js src/routes/clients.js test/excluir-cliente.test.js
git commit -m "feat(clientes): DELETE /api/clients/:id exclui cliente sem pedidos (409 se tiver)"
```

---

### Task 2: Botão "Excluir cliente" em `clientes.html`

**Files:**
- Modify: `src/public/clientes.html` (controls-bar ~185-194; nova função `excluirCliente`)

**Interfaces:**
- Consumes (da Task 1): `DELETE /api/clients/:id` → 200 `{ ok, nome }` | 409 `{ error }` | 404.

- [ ] **Step 1: Botão "Excluir cliente" na controls-bar**

Em `src/public/clientes.html`, logo após o `field-wrap` do dropdown de cliente (fecha em ~linha 194, antes do `field-wrap` de Status ~195), inserir:

```html
        <div class="field-wrap" style="flex:0 0 auto">
          <label>&nbsp;</label>
          <button type="button" class="btn btn-outline-danger" onclick="excluirCliente()" style="white-space:nowrap">
            <i class="bi bi-trash me-1"></i>Excluir cliente
          </button>
        </div>
```

- [ ] **Step 2: Implementar `excluirCliente`**

Adicionar no `<script>` (perto de `loadClients`):

```js
  async function excluirCliente() {
    const sel = document.getElementById('clientSelect');
    const id  = sel.value;
    if (!id) { Swal.fire('Selecione um cliente', 'Escolha um cliente no campo acima primeiro.', 'info'); return; }
    const nome = sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].text : 'este cliente';
    const r = await Swal.fire({
      title: 'Excluir cliente?',
      html: 'Excluir <b>' + esc(nome) + '</b>? Os favoritos dele também serão removidos.<br>Não dá pra desfazer.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sim, excluir', cancelButtonText: 'Cancelar', confirmButtonColor: '#dc3545'
    });
    if (!r.isConfirmed) return;
    try {
      const res  = await Auth.apiFetch('/api/clients/' + id, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) return Swal.fire('Não é possível excluir', data.error || 'Cliente tem pedidos.', 'warning');
      if (!res.ok) return Swal.fire('Erro', data.error || 'Falha ao excluir.', 'error');
      await loadClients();
      sel.value = '';
      loadClientOrders();
      Swal.fire({ icon: 'success', title: 'Cliente excluído!', timer: 1600, showConfirmButton: false });
    } catch (e) {
      Swal.fire('Erro', 'Falha ao excluir o cliente.', 'error');
    }
  }
```

- [ ] **Step 3: Verificar o parse do HTML/JS**

```bash
node -e "const h=require('fs').readFileSync('src/public/clientes.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; excluirCliente:', h.includes('async function excluirCliente'), '| botao:', h.includes('onclick=\"excluirCliente()\"'));"
```
Expected: `parse OK; excluirCliente: true | botao: true`.

- [ ] **Step 4: Commit**

```bash
git add src/public/clientes.html
git commit -m "feat(painel): botao Excluir cliente (selecionado) na pagina Clientes"
```

---

## Verificação final (após as 2 tasks)

- [ ] `node --test --test-force-exit test/excluir-cliente.test.js` → 3 verdes; encerrar node (porta 3000 livre).
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
