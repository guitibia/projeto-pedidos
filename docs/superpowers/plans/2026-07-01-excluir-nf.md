# Botão "Excluir NF" (devolução de estoque) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Excluir uma NF pelo painel, devolvendo o estoque que ela somou, de forma transacional.

**Architecture:** Novo endpoint `DELETE /api/nf/:id` (`nfController.remover`) que devolve estoque + apaga movimentações/itens/nota numa transação; botão "Excluir" na lista e no modal de detalhe em `notas.html`.

**Tech Stack:** Node 22 (Express, MySQL), Bootstrap 5 + SweetAlert2, `Auth.apiFetch`, `node:test`.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Devolução com clamp: `UPDATE products SET estoque = GREATEST(0, estoque - ?)`. Nunca negativo.
- Escopo do delete: `estoque_movimentacoes` (origem='NF', nf_id), `nf_entrada_itens` (nf_id) e `nf_entradas` (id). **NÃO** tocar `nf_item_vinculos` nem apagar produtos.
- Resposta do endpoint: `{ ok:true, produtosAfetados, unidadesDevolvidas, algumJaMovimentado }`.
- Endpoint transacional; rollback em erro; `finally` libera a conexão. Admin-only (as rotas de NF já ficam atrás de `auth`).
- Sem mudança de schema.

---

### Task 1: Endpoint `DELETE /api/nf/:id` (`remover`)

**Files:**
- Modify: `src/controllers/nfController.js` (nova função `remover` + adicionar ao `module.exports`)
- Modify: `src/routes/nf.js` (registrar a rota DELETE)
- Test: `test/excluir-nf.test.js`

**Interfaces:**
- Produces: `remover(req, res)` — Express handler para `DELETE /api/nf/:id`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/excluir-nf.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { remover } = require('../src/controllers/nfController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; } };
}

async function seedNf(estoqueInicial, qtd) {
  const code = 'ZZDEL' + Date.now() + Math.random().toString(36).slice(2, 6);
  const [pr] = await db.query(
    "INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES ('ZZ Del Test', 1, 2, 'Outros', ?, ?)",
    [code, estoqueInicial]);
  const pid = pr.insertId;
  const chave = 'ZZDELNF' + Date.now() + Math.floor(Math.random() * 1e6);
  const [nf] = await db.query(
    "INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero, serie, valor_total, data_emissao, xml) VALUES (?, 'ZZ FORN', '00000000000000', '999', '1', 0, NULL, '')",
    [chave]);
  const nfId = nf.insertId;
  await db.query(
    "INSERT INTO nf_entrada_itens (nf_id, cprod, descricao, ncm, quantidade, valor_unit, valor_total, product_id) VALUES (?, 'C1', 'ITEM', '0', ?, 1, ?, ?)",
    [nfId, qtd, qtd, pid]);
  await db.query(
    "INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao, origem, nf_id) VALUES (?, 'Entrada', ?, 'NF 999', 'NF', ?)",
    [pid, qtd, nfId]);
  return { pid, nfId };
}
async function cleanup(pid) {
  await db.query('DELETE FROM estoque_movimentacoes WHERE product_id=?', [pid]);
  await db.query('DELETE FROM products WHERE id=?', [pid]);
}

test('remover: devolve estoque e apaga a NF', async () => {
  const { pid, nfId } = await seedNf(10, 4);
  const res = mockRes();
  await remover({ params: { id: String(nfId) } }, res);
  assert.strictEqual(res.body.ok, true);
  assert.strictEqual(res.body.produtosAfetados, 1);
  assert.strictEqual(res.body.unidadesDevolvidas, 4);
  const [[p]] = await db.query('SELECT estoque FROM products WHERE id=?', [pid]);
  assert.strictEqual(Number(p.estoque), 6);
  const [[nf]] = await db.query('SELECT COUNT(*) n FROM nf_entradas WHERE id=?', [nfId]);
  assert.strictEqual(nf.n, 0);
  const [[it]] = await db.query('SELECT COUNT(*) n FROM nf_entrada_itens WHERE nf_id=?', [nfId]);
  assert.strictEqual(it.n, 0);
  const [[mv]] = await db.query("SELECT COUNT(*) n FROM estoque_movimentacoes WHERE nf_id=?", [nfId]);
  assert.strictEqual(mv.n, 0);
  await cleanup(pid);
});

test('remover: clamp em 0 quando já vendido', async () => {
  const { pid, nfId } = await seedNf(2, 4);
  const res = mockRes();
  await remover({ params: { id: String(nfId) } }, res);
  const [[p]] = await db.query('SELECT estoque FROM products WHERE id=?', [pid]);
  assert.strictEqual(Number(p.estoque), 0);
  assert.strictEqual(res.body.algumJaMovimentado, true);
  await cleanup(pid);
});

test('remover: id inexistente → 404', async () => {
  const res = mockRes();
  await remover({ params: { id: '999999999' } }, res);
  assert.strictEqual(res.statusCode, 404);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/excluir-nf.test.js`
Expected: FAIL — `remover` não existe (import undefined → TypeError ao chamar). (`--test-force-exit` porque o require do controller abre o pool MySQL.)

- [ ] **Step 3: Implementar `remover` no controller**

Em `src/controllers/nfController.js`, adicionar a função (perto das outras, ex.: após `detalhe`):

```js
// DELETE /api/nf/:id  — apaga a nota e devolve o estoque que ela somou
async function remover(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[nf]] = await conn.query('SELECT id FROM nf_entradas WHERE id = ?', [id]);
    if (!nf) { await conn.rollback(); return res.status(404).json({ error: 'Nota não encontrada.' }); }

    const [ret] = await conn.query(
      "SELECT product_id, SUM(quantidade) q FROM estoque_movimentacoes WHERE origem='NF' AND nf_id = ? AND product_id IS NOT NULL GROUP BY product_id",
      [id]);

    let unidadesDevolvidas = 0;
    let algumJaMovimentado = false;
    for (const r of ret) {
      const qtd = Number(r.q) || 0;
      unidadesDevolvidas += qtd;
      const [[p]] = await conn.query('SELECT estoque FROM products WHERE id = ?', [r.product_id]);
      if (p && Number(p.estoque) < qtd) algumJaMovimentado = true;
      await conn.query('UPDATE products SET estoque = GREATEST(0, estoque - ?) WHERE id = ?', [qtd, r.product_id]);
    }

    await conn.query("DELETE FROM estoque_movimentacoes WHERE origem='NF' AND nf_id = ?", [id]);
    await conn.query('DELETE FROM nf_entrada_itens WHERE nf_id = ?', [id]);
    await conn.query('DELETE FROM nf_entradas WHERE id = ?', [id]);

    await conn.commit();
    return res.json({ ok: true, produtosAfetados: ret.length, unidadesDevolvidas, algumJaMovimentado });
  } catch (e) {
    await conn.rollback();
    console.error('Erro ao excluir NF:', e);
    return res.status(500).json({ error: 'Erro ao excluir a nota.' });
  } finally {
    conn.release();
  }
}
```

No `module.exports` do arquivo, acrescentar `remover` à lista exportada.

- [ ] **Step 4: Registrar a rota**

Em `src/routes/nf.js`, adicionar após `router.get('/:id', c.detalhe);`:

```js
router.delete('/:id', c.remover);
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/excluir-nf.test.js`
Expected: PASS — 3 testes verdes. Encerrar node pendente (liberar porta 3000).

- [ ] **Step 6: Commit**

```bash
git add src/controllers/nfController.js src/routes/nf.js test/excluir-nf.test.js
git commit -m "feat(nf): DELETE /api/nf/:id devolve estoque e apaga a nota (transacional)"
```

---

### Task 2: Botão "Excluir" na lista e no detalhe (`notas.html`)

**Files:**
- Modify: `src/public/notas.html` (coluna de ações da lista ~823-828; `verNota` body ~851; nova função `excluirNota`)

**Interfaces:**
- Consumes (da Task 1): `DELETE /api/nf/:id` → `{ ok, produtosAfetados, unidadesDevolvidas, algumJaMovimentado }`.

- [ ] **Step 1: Botão "Excluir" na linha da lista**

Em `src/public/notas.html`, na célula de ações (hoje só o botão "Ver", ~linha 823-828), acrescentar o botão de excluir logo após o "Ver":

```html
              <button onclick="excluirNota(${esc(nf.id)})"
                style="padding:.28rem .7rem;border-radius:7px;font-size:.78rem;font-weight:600;border:1px solid rgba(248,81,73,.35);background:rgba(248,81,73,.08);color:#f85149;cursor:pointer;margin-left:.35rem">
                <i class="bi bi-trash"></i> Excluir
              </button>
```

- [ ] **Step 2: Botão "Excluir esta nota" no modal de detalhe**

Em `src/public/notas.html`, dentro de `verNota`, ao montar o HTML de `nf-modal-body` (~linha 851+), adicionar ao final do conteúdo (antes de fechar a string do template) um botão:

```html
          <div style="text-align:right;margin-top:1rem">
            <button onclick="excluirNota(${esc(id)}, true)"
              style="padding:.4rem .9rem;border-radius:8px;font-size:.82rem;font-weight:600;border:1px solid rgba(248,81,73,.4);background:rgba(248,81,73,.1);color:#f85149;cursor:pointer">
              <i class="bi bi-trash"></i> Excluir esta nota
            </button>
          </div>
```

- [ ] **Step 3: Implementar `excluirNota`**

Adicionar (perto de `verNota`, dentro do `<script>`):

```js
  // Excluir NF: DELETE /api/nf/:id (devolve estoque)
  async function excluirNota(id, fromModal) {
    const r = await Swal.fire({
      title: 'Excluir esta nota?',
      html: 'As quantidades desta NF serão <b>devolvidas ao estoque</b>.<br>Os produtos e os vínculos continuam. Não dá pra desfazer.',
      icon: 'warning', showCancelButton: true,
      confirmButtonText: 'Sim, excluir', cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!r.isConfirmed) return;
    try {
      const res = await Auth.apiFetch('/api/nf/' + id, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return Swal.fire('Erro', data.error || 'Não foi possível excluir a nota.', 'error');
      let msg = 'Devolvidas ' + (data.unidadesDevolvidas || 0) + ' un. a ' + (data.produtosAfetados || 0) + ' produtos.';
      if (data.algumJaMovimentado) msg += ' (Parte do estoque já havia sido movimentada.)';
      if (fromModal) { const m = bootstrap.Modal.getInstance(document.getElementById('nfModal')); if (m) m.hide(); }
      await Swal.fire({ icon: 'success', title: 'NF excluída!', text: msg, timer: 2600, showConfirmButton: false });
      loadHistorico();
    } catch (e) {
      Swal.fire('Erro', 'Falha ao excluir a nota.', 'error');
    }
  }
```

- [ ] **Step 4: Verificar o parse do HTML/JS**

```bash
node -e "const h=require('fs').readFileSync('src/public/notas.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; excluirNota:', h.includes('async function excluirNota'), '| botao lista:', h.includes('excluirNota(${esc(nf.id)})'));"
```
Expected: `parse OK; excluirNota: true | botao lista: true`.

- [ ] **Step 5: Commit**

```bash
git add src/public/notas.html
git commit -m "feat(painel): botao Excluir NF na lista e no detalhe (devolve estoque)"
```

---

## Verificação final (após as 2 tasks)

- [ ] `node --test --test-force-exit test/excluir-nf.test.js` → 3 verdes; encerrar node (porta 3000 livre).
- [ ] Teste manual (opcional): subir o app, importar uma NF de teste, excluí-la pela lista, conferir que o estoque volta e a nota some; encerrar node.
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
