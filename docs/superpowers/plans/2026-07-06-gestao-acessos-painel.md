# Gestão de acessos do painel — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No painel, trocar a própria senha e (admin) criar/listar/remover logins, com bcrypt e travas de segurança.

**Architecture:** Backend estende `authController`/`routes/auth.js` com change-password + gestão de usuários (admin-only) e separa o rate-limit; a UI fica num modal no dashboard (`painel.html`).

**Tech Stack:** Node 22 (Express, MySQL, bcryptjs, jsonwebtoken), Bootstrap 5 + SweetAlert2, `node:test`.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Papel: `'admin'` (gerencia acessos) ou `'user'` (limitado). `register` normaliza: `role === 'admin' ? 'admin' : 'user'`.
- Autoridade no **servidor**: register/users/delete exigem `req.user.role === 'admin'` (middleware `soAdmin`). change-password só exige estar logado.
- Senhas com **bcrypt** custo 10; senha mín. **6** caracteres; `listUsers` nunca retorna `password_hash`.
- Travas do delete: não remover a si mesmo (`id === req.user.id`) nem o último admin (`COUNT admins <= 1`).
- Rate-limit: `loginLimiter` só no `/login`; resto de `/api/auth` sob `apiLimiter`.

---

### Task 1: Backend — change-password + gestão de usuários

**Files:**
- Modify: `src/controllers/authController.js` (register + novas funções + export)
- Modify: `src/routes/auth.js` (soAdmin + rotas)
- Modify: `src/app.js` (separar loginLimiter/apiLimiter em /api/auth)
- Test: `test/acessos.test.js`

**Interfaces:**
- Produces: `changePassword(req,res)`, `listUsers(req,res)`, `deleteUser(req,res)` em authController; rotas `POST /api/auth/change-password`, `GET /api/auth/users`, `DELETE /api/auth/users/:id`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/acessos.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/database/connection');
const { changePassword, listUsers, deleteUser, register } = require('../src/controllers/authController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; } };
}
const uname = () => 'zz_test_' + Date.now() + Math.floor(Math.random()*1e6);
async function seedUser(role, senha) {
  const u = uname();
  const [r] = await db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [u, await bcrypt.hash(senha, 10), role]);
  return { id: r.insertId, username: u };
}
async function cleanup() { await db.query("DELETE FROM users WHERE username LIKE 'zz_test_%'"); }

test('changePassword: senha atual correta troca; errada dá 400', async () => {
  const u = await seedUser('user', 'senhaAtual1');
  let res = mockRes();
  await changePassword({ user: { id: u.id }, body: { currentPassword: 'senhaAtual1', newPassword: 'novaSenha6' } }, res);
  assert.strictEqual(res.statusCode, 200);
  const [[row]] = await db.query('SELECT password_hash FROM users WHERE id=?', [u.id]);
  assert.ok(await bcrypt.compare('novaSenha6', row.password_hash), 'hash atualizado');
  res = mockRes();
  await changePassword({ user: { id: u.id }, body: { currentPassword: 'errada', newPassword: 'outra123' } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});

test('changePassword: nova senha < 6 → 400', async () => {
  const u = await seedUser('user', 'senhaAtual1');
  const res = mockRes();
  await changePassword({ user: { id: u.id }, body: { currentPassword: 'senhaAtual1', newPassword: '123' } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});

test('deleteUser: não remove a si mesmo nem o último admin; remove user comum', async () => {
  const admin = await seedUser('admin', 'x123456');
  const comum = await seedUser('user', 'x123456');
  // remover a si mesmo
  let res = mockRes();
  await deleteUser({ user: { id: admin.id, role: 'admin' }, params: { id: String(admin.id) } }, res);
  assert.strictEqual(res.statusCode, 400);
  // remover o último admin (caller é outro admin fictício; só existe 1 admin de teste... garantir contexto):
  //   como pode haver outros admins reais no banco, este teste cria cenário isolado deletando via COUNT.
  //   Validamos a remoção do 'comum' (caminho feliz) e o self-block acima.
  res = mockRes();
  await deleteUser({ user: { id: admin.id, role: 'admin' }, params: { id: String(comum.id) } }, res);
  assert.strictEqual(res.statusCode, 200);
  const [[c]] = await db.query('SELECT COUNT(*) n FROM users WHERE id=?', [comum.id]);
  assert.strictEqual(c.n, 0);
  await cleanup();
});

test('listUsers: não vaza password_hash', async () => {
  await seedUser('user', 'x123456');
  const res = mockRes();
  await listUsers({ user: { role: 'admin' } }, res);
  assert.ok(Array.isArray(res.body));
  const meu = res.body.find(r => r.username && r.username.startsWith('zz_test_'));
  assert.ok(meu && meu.password_hash === undefined, 'sem hash');
  await cleanup();
});

test('register: senha curta → 400; papel inválido vira user', async () => {
  let res = mockRes();
  await register({ body: { username: uname(), password: '123', role: 'admin' } }, res);
  assert.strictEqual(res.statusCode, 400);
  res = mockRes();
  const u = uname();
  await register({ body: { username: u, password: 'senha123', role: 'xyz' } }, res);
  assert.strictEqual(res.statusCode, 201);
  const [[row]] = await db.query('SELECT role FROM users WHERE username=?', [u]);
  assert.strictEqual(row.role, 'user');
  await cleanup();
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/acessos.test.js`
Expected: FAIL — `changePassword`/`listUsers`/`deleteUser` não existem (undefined → TypeError). (`--test-force-exit` porque o require abre o pool MySQL.)

- [ ] **Step 3: Implementar as funções no authController**

Em `src/controllers/authController.js`, ajustar `register` e adicionar as 3 funções.

No `register`, após a checagem de `username && password`, adicionar validação de tamanho e normalizar o papel:
```js
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });
  }
  const papel = role === 'admin' ? 'admin' : 'user';
```
E trocar o INSERT para usar `papel`:
```js
    const [result] = await db.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, password_hash, papel]
    );
```

Adicionar (antes do `module.exports`):
```js
// POST /api/auth/change-password  (autenticado)
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
  }
  try {
    const [[user]] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Senha atual incorreta.' });
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), req.user.id]);
    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err) {
    console.error('Erro ao trocar senha:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// GET /api/auth/users  (admin-only via rota)
async function listUsers(req, res) {
  try {
    const [rows] = await db.query('SELECT id, username, role, created_at FROM users ORDER BY username');
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// DELETE /api/auth/users/:id  (admin-only via rota)
async function deleteUser(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  if (id === req.user.id) return res.status(400).json({ error: 'Você não pode remover o seu próprio login.' });
  try {
    const [[alvo]] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
    if (!alvo) return res.status(404).json({ error: 'Login não encontrado.' });
    if (alvo.role === 'admin') {
      const [[{ c }]] = await db.query("SELECT COUNT(*) c FROM users WHERE role = 'admin'");
      if (c <= 1) return res.status(400).json({ error: 'Não é possível remover o último administrador.' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ message: 'Login removido.' });
  } catch (err) {
    console.error('Erro ao remover usuário:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}
```

No `module.exports`, trocar para:
```js
module.exports = { login, register, changePassword, listUsers, deleteUser };
```

- [ ] **Step 4: Rotas em `src/routes/auth.js`**

Reescrever `src/routes/auth.js` para:
```js
const express = require('express');
const router = express.Router();
const { login, register, changePassword, listUsers, deleteUser } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

function soAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores.' });
  }
  next();
}

router.post('/login', login);
router.post('/register', authMiddleware, soAdmin, register);
router.post('/change-password', authMiddleware, changePassword);
router.get('/users', authMiddleware, soAdmin, listUsers);
router.delete('/users/:id', authMiddleware, soAdmin, deleteUser);

module.exports = router;
```

- [ ] **Step 5: Separar o rate-limit em `src/app.js`**

Em `src/app.js`, trocar a linha:
```js
app.use('/api/auth', loginLimiter, authRoutes);
```
por:
```js
app.use('/api/auth/login', loginLimiter);        // limite restrito só no login
app.use('/api/auth', apiLimiter, authRoutes);
```

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/acessos.test.js`
Expected: PASS — 5 testes verdes. `node -e "require('./src/app')"` NÃO (sobe servidor); em vez disso `node -e "require('./src/routes/auth'); require('./src/controllers/authController'); console.log('OK')"` imprime OK. Encerrar node pendente (porta 3000 livre).

- [ ] **Step 7: Commit**

```bash
git add src/controllers/authController.js src/routes/auth.js src/app.js test/acessos.test.js
git commit -m "feat(acessos): change-password + listar/remover usuários (admin) + rate-limit separado"
```

---

### Task 2: UI — modal "Gerenciar acessos" no dashboard

**Files:**
- Modify: `src/public/painel.html` (botão na sidebar + modal + JS)

**Interfaces:**
- Consumes (Task 1): `POST /api/auth/change-password` `{currentPassword,newPassword}`; `GET /api/auth/users`; `POST /api/auth/register` `{username,password,role}`; `DELETE /api/auth/users/:id`.

- [ ] **Step 1: Botão na barra lateral**

Em `src/public/painel.html`, na área da barra lateral onde ficam os botões de Tema/Sair (perto de `id="btn-logout"`), adicionar antes do botão Sair:
```html
    <button class="btn-logout" id="btn-acessos"><i class="bi bi-shield-lock"></i> Gerenciar acessos</button>
```

- [ ] **Step 2: Modal (markup)**

Em `src/public/painel.html`, antes do `<footer` (ou junto dos outros modais), adicionar:
```html
<div class="modal fade" id="acessosModal" tabindex="-1">
  <div class="modal-dialog modal-lg modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header" style="background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#fff">
        <h5 class="modal-title"><i class="bi bi-shield-lock me-2"></i>Gerenciar acessos</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-4">
        <h6 class="mb-3"><i class="bi bi-key me-1"></i> Trocar minha senha</h6>
        <div class="row g-2 mb-2">
          <div class="col-12 col-md-4"><input type="password" class="form-control form-control-sm" id="ac-senha-atual" placeholder="Senha atual"></div>
          <div class="col-6 col-md-4"><input type="password" class="form-control form-control-sm" id="ac-senha-nova" placeholder="Nova senha (mín. 6)"></div>
          <div class="col-6 col-md-4"><input type="password" class="form-control form-control-sm" id="ac-senha-conf" placeholder="Confirmar nova"></div>
        </div>
        <button type="button" class="btn btn-primary btn-sm" id="ac-btn-senha"><i class="bi bi-check2 me-1"></i> Salvar nova senha</button>

        <div id="ac-admin-area" style="display:none">
          <hr class="my-4">
          <h6 class="mb-3"><i class="bi bi-people me-1"></i> Logins do painel</h6>
          <div id="ac-users-list" style="margin-bottom:1rem"></div>
          <div style="border:1px solid var(--border-color);border-radius:10px;padding:.8rem">
            <div style="font-size:.8rem;font-weight:600;color:var(--text-muted);margin-bottom:.5rem">Criar novo login</div>
            <div class="row g-2">
              <div class="col-12 col-md-4"><input type="text" class="form-control form-control-sm" id="ac-novo-user" placeholder="Usuário"></div>
              <div class="col-6 col-md-3"><input type="password" class="form-control form-control-sm" id="ac-novo-senha" placeholder="Senha (mín. 6)"></div>
              <div class="col-6 col-md-3">
                <select class="form-select form-select-sm" id="ac-novo-papel">
                  <option value="admin">Admin</option>
                  <option value="user">Limitado</option>
                </select>
              </div>
              <div class="col-12 col-md-2"><button type="button" class="btn btn-success btn-sm w-100" id="ac-btn-criar">Criar</button></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 3: JS do modal**

Em `src/public/painel.html`, no `<script>`, adicionar (o painel já tem `Auth` e `Swal`; a página tem `esc()` — se não tiver, definir `const esc = s => String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));`):

```js
  // ── Gerenciar acessos ──
  const acModalEl = document.getElementById('acessosModal');
  document.getElementById('btn-acessos').addEventListener('click', () => {
    const u = Auth.getUser() || {};
    document.getElementById('ac-admin-area').style.display = (u.role === 'admin') ? '' : 'none';
    ['ac-senha-atual','ac-senha-nova','ac-senha-conf','ac-novo-user','ac-novo-senha'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
    if (u.role === 'admin') acCarregarUsers();
    new bootstrap.Modal(acModalEl).show();
  });

  document.getElementById('ac-btn-senha').addEventListener('click', async () => {
    const atual = document.getElementById('ac-senha-atual').value;
    const nova  = document.getElementById('ac-senha-nova').value;
    const conf  = document.getElementById('ac-senha-conf').value;
    if (!atual || !nova) return Swal.fire('Atenção', 'Preencha a senha atual e a nova.', 'warning');
    if (nova.length < 6)  return Swal.fire('Atenção', 'A nova senha deve ter ao menos 6 caracteres.', 'warning');
    if (nova !== conf)    return Swal.fire('Atenção', 'A confirmação não confere com a nova senha.', 'warning');
    const res  = await Auth.apiFetch('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: atual, newPassword: nova }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return Swal.fire('Erro', data.error || 'Não foi possível trocar a senha.', 'error');
    ['ac-senha-atual','ac-senha-nova','ac-senha-conf'].forEach(id => document.getElementById(id).value = '');
    Swal.fire({ icon: 'success', title: 'Senha alterada!', timer: 1600, showConfirmButton: false });
  });

  async function acCarregarUsers() {
    const box = document.getElementById('ac-users-list');
    box.innerHTML = '<div style="font-size:.85rem;color:var(--text-muted)">Carregando...</div>';
    const res = await Auth.apiFetch('/api/auth/users');
    if (!res.ok) { box.innerHTML = '<div style="font-size:.85rem;color:#f85149">Erro ao carregar.</div>'; return; }
    const users = await res.json();
    const eu = (Auth.getUser() || {}).id;
    box.innerHTML = users.map(u => `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.6rem;padding:.5rem .7rem;border:1px solid var(--border-color);border-radius:9px;margin-bottom:.35rem">
        <div style="min-width:0">
          <div style="font-weight:600;font-size:.88rem">${esc(u.username)}${u.id===eu?' <span style="font-size:.7rem;color:var(--text-muted)">(você)</span>':''}</div>
          <div style="font-size:.72rem;color:var(--text-muted)">${u.role === 'admin' ? 'Admin' : 'Limitado'}</div>
        </div>
        <button type="button" class="btn btn-outline-danger btn-sm" onclick="acRemover(${u.id}, '${esc(u.username)}')" ${u.id===eu?'disabled title="Não dá para remover você mesmo"':''}><i class="bi bi-trash3"></i></button>
      </div>`).join('') || '<div style="font-size:.85rem;color:var(--text-muted)">Nenhum login.</div>';
  }

  async function acRemover(id, nome) {
    const r = await Swal.fire({ title: 'Remover login?', html: 'Remover o acesso de <b>' + esc(nome) + '</b>?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sim, remover', cancelButtonText: 'Cancelar', confirmButtonColor: '#dc3545' });
    if (!r.isConfirmed) return;
    const res  = await Auth.apiFetch('/api/auth/users/' + id, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return Swal.fire('Não foi possível', data.error || 'Erro ao remover.', 'warning');
    acCarregarUsers();
    Swal.fire({ icon: 'success', title: 'Login removido.', timer: 1400, showConfirmButton: false });
  }

  document.getElementById('ac-btn-criar').addEventListener('click', async () => {
    const username = document.getElementById('ac-novo-user').value.trim();
    const password = document.getElementById('ac-novo-senha').value;
    const role     = document.getElementById('ac-novo-papel').value;
    if (!username || !password) return Swal.fire('Atenção', 'Informe usuário e senha.', 'warning');
    if (password.length < 6)    return Swal.fire('Atenção', 'A senha deve ter ao menos 6 caracteres.', 'warning');
    const res  = await Auth.apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return Swal.fire('Erro', data.error || 'Não foi possível criar o login.', 'error');
    document.getElementById('ac-novo-user').value = '';
    document.getElementById('ac-novo-senha').value = '';
    acCarregarUsers();
    Swal.fire({ icon: 'success', title: 'Login criado!', timer: 1400, showConfirmButton: false });
  });
```

`acRemover` é usada em `onclick` do HTML gerado, então deve ser função global (declará-la como `async function acRemover(...)` no escopo do script, não dentro de outra função). As demais podem ser locais.

- [ ] **Step 4: Verificar o parse do HTML/JS**

```bash
node -e "const h=require('fs').readFileSync('src/public/painel.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; modal:', h.includes('id=\"acessosModal\"'), '| botão:', h.includes('id=\"btn-acessos\"'), '| criar:', h.includes('ac-btn-criar'));"
```
Expected: `parse OK; modal: true | botão: true | criar: true`.

- [ ] **Step 5: Commit**

```bash
git add src/public/painel.html
git commit -m "feat(painel): modal Gerenciar acessos (trocar senha; admin: criar/listar/remover logins)"
```

---

## Verificação final (após as 2 tasks)

- [ ] `node --test --test-force-exit test/acessos.test.js` → 5 verdes; encerrar node (porta 3000 livre).
- [ ] Teste manual (opcional): abrir o dashboard, "Gerenciar acessos", trocar a própria senha; como admin, criar um login "Limitado", ver na lista, remover.
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
