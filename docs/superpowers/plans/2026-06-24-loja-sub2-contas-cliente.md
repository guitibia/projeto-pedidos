# Loja — Sub-projeto 2: Contas de Cliente + LGPD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cadastro de cliente com verificação de e-mail (duplo opt-in), login, gestão de dados (LGPD) e integração de login/conta ao header da loja.

**Architecture:** Estende `clients` com campos de conta. JWT de cliente (`type:'customer'`) separado do admin via novo middleware. Mailer com Gmail SMTP + fallback dev. Páginas da loja em `src/public/loja/` + `account.js`. Header reflete login via `loja.js`.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), bcryptjs + jsonwebtoken (já no projeto), nodemailer (novo), HTML/CSS/JS vanilla

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- CommonJS; migrações no startup de `connection.js`, cada uma em `try { } catch (_) {}`
- Conta da loja = linha de `clients` com `email`+`password_hash`; clientes do admin continuam sem login (email NULL)
- CPF armazenado só com dígitos (11), validado com dígitos verificadores; e-mail e CPF únicos
- JWT do cliente: `{ id, email, type:'customer' }`, `JWT_SECRET`, expira `7d`; middleware exige `type==='customer'`
- Senha: mínimo 8 caracteres, hash `bcrypt` (10 rounds)
- Verificação: token `crypto.randomBytes(32).toString('hex')`, expira 24h; login bloqueado até `email_verified=1`
- Mailer: se `SMTP_USER`+`SMTP_PASS` no env → Gmail; senão modo dev (loga link). `APP_URL` (default `http://localhost:3000`) compõe links
- Rotas da loja em `/api/loja/auth` (públicas: register/verify/resend/login; protegidas: me/update/password/delete) — login com limiter mais restrito
- Páginas do cliente em `/loja/` (login do cliente em `/loja/entrar.html`, **não** colide com `/login.html` do admin); Clean Boutique; reusam `loja.css`
- `esc()`/escape em dados renderizados; sem testes automatizados — verificar via curl + browser

---

### Task 1: Migrações + nodemailer + .env

**Files:**
- Modify: `src/database/connection.js`, `.env`, `package.json` (via npm)

- [ ] **Step 1: Instalar nodemailer**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
npm install nodemailer
```

- [ ] **Step 2: Migrações em clients**

Em `src/database/connection.js`, após a migração de `image`/`description` dos produtos, adicionar:
```js
    // Migração: contas de cliente da loja
    for (const sql of [
      'ALTER TABLE clients ADD COLUMN email VARCHAR(255) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN cpf VARCHAR(11) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN birthdate DATE DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0',
      'ALTER TABLE clients ADD COLUMN verification_token VARCHAR(64) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN verification_expires DATETIME DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN lgpd_consent_at DATETIME DEFAULT NULL',
      'CREATE UNIQUE INDEX uq_clients_email ON clients(email)',
      'CREATE UNIQUE INDEX uq_clients_cpf ON clients(cpf)',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 3: Variáveis de e-mail no .env**

Adicionar ao `.env` (gitignored), comentadas (modo dev até você preencher a App Password do Gmail):
```
# Envio de e-mail (Gmail SMTP). Preencha com seu e-mail + App Password do Google.
# Sem estas duas, a loja roda em "modo dev" e apenas loga o link de verificação no console.
# SMTP_USER=gui.14.2006@gmail.com
# SMTP_PASS=sua_app_password_de_16_digitos
APP_URL=http://localhost:3000
```

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [c]=await db.query('SHOW COLUMNS FROM clients');console.log(c.map(x=>x.Field).filter(f=>['email','cpf','birthdate','password_hash','email_verified','verification_token','verification_expires','lgpd_consent_at'].includes(f)));process.exit(0)})()" 2>/dev/null
```
Esperado: array com as 8 colunas novas.

- [ ] **Step 5: Commit**

```bash
git add src/database/connection.js package.json package-lock.json
git commit -m "feat(loja): migrações de conta de cliente em clients + nodemailer"
```

---

### Task 2: Mailer (Gmail SMTP + fallback dev)

**Files:**
- Create: `src/utils/mailer.js`

**Interfaces:**
- Produz: `sendVerificationEmail(to, name, link)` (async; nunca lança — loga falha)

- [ ] **Step 1: Criar `src/utils/mailer.js`**

```js
const nodemailer = require('nodemailer');

function getTransport() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return null; // modo dev
}

async function sendVerificationEmail(to, name, link) {
  const subject = 'Confirme seu cadastro — Beleza Multi Marcas';
  const html =
    `<div style="font-family:Arial,sans-serif;color:#2B2B2B">` +
    `<h2 style="color:#B76E79">Beleza Multi Marcas</h2>` +
    `<p>Olá, ${name}!</p>` +
    `<p>Falta pouco para ativar sua conta. Confirme seu e-mail clicando no botão abaixo:</p>` +
    `<p><a href="${link}" style="display:inline-block;background:#B76E79;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirmar meu e-mail</a></p>` +
    `<p style="font-size:13px;color:#6B6B6B">Ou copie e cole no navegador: <br>${link}</p>` +
    `<p style="font-size:13px;color:#6B6B6B">Se você não criou esta conta, ignore este e-mail. O link expira em 24 horas.</p>` +
    `</div>`;
  const transport = getTransport();
  if (!transport) {
    console.log('\n[mailer:dev] Link de verificação para ' + to + ':\n  ' + link + '\n');
    return;
  }
  try {
    await transport.sendMail({ from: process.env.SMTP_USER, to, subject, html });
  } catch (e) {
    console.error('[mailer] falha ao enviar para ' + to + ':', e.message);
    console.log('[mailer] link (fallback): ' + link);
  }
}

module.exports = { sendVerificationEmail };
```

- [ ] **Step 2: Verificar (modo dev loga link)**

```bash
node -e "require('dotenv').config(); const {sendVerificationEmail}=require('./src/utils/mailer'); sendVerificationEmail('teste@x.com','Teste','http://localhost:3000/loja/verificar.html?token=abc').then(()=>console.log('ok'))"
```
Esperado: imprime `[mailer:dev] Link de verificação para teste@x.com: ...` e `ok` (sem SMTP configurado).

- [ ] **Step 3: Commit**

```bash
git add src/utils/mailer.js
git commit -m "feat(loja): mailer (Gmail SMTP com fallback dev que loga o link)"
```

---

### Task 3: Middleware customerAuth

**Files:**
- Create: `src/middleware/customerAuth.js`

**Interfaces:**
- Produz: middleware que injeta `req.customer = { id, email }`; exige JWT `type:'customer'`

- [ ] **Step 1: Criar `src/middleware/customerAuth.js`**

```js
const jwt = require('jsonwebtoken');

function customerAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'customer') return res.status(403).json({ error: 'Token inválido.' });
    req.customer = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Sessão inválida ou expirada.' });
  }
}

module.exports = customerAuth;
```

- [ ] **Step 2: Verificar sintaxe**

```bash
node -e "require('./src/middleware/customerAuth'); console.log('customerAuth OK')"
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware/customerAuth.js
git commit -m "feat(loja): middleware de autenticação do cliente (JWT type customer)"
```

---

### Task 4: storeAuthController (cadastro/verificação) + rotas públicas

**Files:**
- Create: `src/controllers/storeAuthController.js`, `src/routes/lojaAuth.js`
- Modify: `src/app.js`

**Interfaces:**
- Produz: `POST /api/loja/auth/register`, `GET /api/loja/auth/verify?token=`, `POST /api/loja/auth/resend`; (login/me/etc. na Task 5, mesmo controller/rotas)

- [ ] **Step 1: Criar `src/controllers/storeAuthController.js` (cadastro/verificação)**

```js
const db = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/mailer');

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }
function validCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}
function verifyLink(token) {
  return (process.env.APP_URL || 'http://localhost:3000') + '/loja/verificar.html?token=' + token;
}

// POST /api/loja/auth/register
async function register(req, res) {
  const { name, email, cpf, birthdate, phone, password, consent } = req.body;
  if (!name || !email || !cpf || !birthdate || !password) return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  const cpfDigits = String(cpf).replace(/\D/g, '');
  if (!validCPF(cpfDigits)) return res.status(400).json({ error: 'CPF inválido.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });
  if (!consent) return res.status(400).json({ error: 'É necessário aceitar a Política de Privacidade.' });
  try {
    const [[dupE]] = await db.query('SELECT id FROM clients WHERE email = ?', [email]);
    if (dupE) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    const [[dupC]] = await db.query('SELECT id FROM clients WHERE cpf = ?', [cpfDigits]);
    if (dupC) return res.status(409).json({ error: 'Este CPF já está cadastrado.' });
    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO clients (name, email, cpf, birthdate, phone, password_hash, email_verified, verification_token, verification_expires, lgpd_consent_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
      [name, email, cpfDigits, birthdate, phone || null, hash, token, expires]
    );
    await sendVerificationEmail(email, name, verifyLink(token));
    return res.status(201).json({ message: 'Cadastro criado! Enviamos um link de confirmação para o seu e-mail.' });
  } catch (e) { console.error('Erro no cadastro:', e); return res.status(500).json({ error: 'Erro ao cadastrar.' }); }
}

// GET /api/loja/auth/verify?token=
async function verify(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token ausente.' });
  try {
    const [[c]] = await db.query('SELECT id, verification_expires FROM clients WHERE verification_token = ?', [token]);
    if (!c) return res.status(400).json({ error: 'Link inválido ou já utilizado.' });
    if (new Date(c.verification_expires) < new Date()) return res.status(400).json({ error: 'Link expirado. Solicite um novo.' });
    await db.query('UPDATE clients SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?', [c.id]);
    return res.json({ message: 'E-mail confirmado! Você já pode entrar.' });
  } catch (e) { console.error('Erro ao verificar:', e); return res.status(500).json({ error: 'Erro ao verificar.' }); }
}

// POST /api/loja/auth/resend
async function resend(req, res) {
  const { email } = req.body;
  try {
    if (email) {
      const [[c]] = await db.query('SELECT id, name, email_verified FROM clients WHERE email = ?', [email]);
      if (c && !c.email_verified) {
        const token = crypto.randomBytes(32).toString('hex');
        await db.query('UPDATE clients SET verification_token = ?, verification_expires = ? WHERE id = ?',
          [token, new Date(Date.now() + 24 * 60 * 60 * 1000), c.id]);
        await sendVerificationEmail(email, c.name, verifyLink(token));
      }
    }
    return res.json({ message: 'Se houver uma conta não confirmada com este e-mail, enviamos um novo link.' });
  } catch (e) { console.error('Erro no reenvio:', e); return res.status(500).json({ error: 'Erro ao reenviar.' }); }
}

module.exports = { register, verify, resend };
```

- [ ] **Step 2: Criar `src/routes/lojaAuth.js` (públicas por enquanto)**

```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/storeAuthController');

router.post('/register', c.register);
router.get('/verify', c.verify);
router.post('/resend', c.resend);

module.exports = router;
```

- [ ] **Step 3: Montar no app.js**

Em `src/app.js`, na seção de rotas públicas (após o mount de `/api/loja`), adicionar:
```js
const lojaAuthRoutes = require('./routes/lojaAuth');
app.use('/api/loja/auth/login', loginLimiter);      // limite mais restrito no login (Task 5)
app.use('/api/loja/auth', apiLimiter, lojaAuthRoutes);
```

- [ ] **Step 4: Verificar (cadastro + verificação, modo dev)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
# CPF válido de teste: 52998224725
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" \
  -d '{"name":"Cliente Teste","email":"cli@teste.com","cpf":"529.982.247-25","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}'
echo ""
# pegar o token gerado direto no banco e verificar
TOKEN=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='cli@teste.com'\");console.log(c.t);process.exit(0)})()" 2>/dev/null)
curl -s "http://localhost:3000/api/loja/auth/verify?token=$TOKEN"
echo ""
# CPF inválido deve dar 400
curl -s -o /dev/null -w "cpf inválido: %{http_code}\n" http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"X","email":"y@y.com","cpf":"11111111111","birthdate":"2000-01-01","password":"senha1234","consent":true}'
```
Esperado: register → 201 (e o link no console em modo dev); verify → "E-mail confirmado!"; cpf inválido → 400. (Apague o cliente de teste depois: `DELETE FROM clients WHERE email='cli@teste.com'`.)

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeAuthController.js src/routes/lojaAuth.js src/app.js
git commit -m "feat(loja): cadastro de cliente + verificação de e-mail (API)"
```

---

### Task 5: Login + conta (API protegida)

**Files:**
- Modify: `src/controllers/storeAuthController.js`, `src/routes/lojaAuth.js`

**Interfaces:**
- Consome: `customerAuth` (Task 3)
- Produz: `POST /login`, `GET /me`, `PUT /me`, `PUT /password`, `DELETE /me` em `/api/loja/auth`

- [ ] **Step 1: Adicionar login + endpoints de conta ao controller**

Em `src/controllers/storeAuthController.js`, adicionar antes do `module.exports` e incluir os novos nomes na exportação:
```js
// POST /api/loja/auth/login
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  try {
    const [[c]] = await db.query('SELECT id, name, email, password_hash, email_verified FROM clients WHERE email = ?', [email]);
    if (!c || !c.password_hash) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const ok = await bcrypt.compare(password, c.password_hash);
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    if (!c.email_verified) return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar.', needsVerification: true });
    const token = jwt.sign({ id: c.id, email: c.email, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: c.id, name: c.name, email: c.email } });
  } catch (e) { console.error('Erro no login do cliente:', e); return res.status(500).json({ error: 'Erro ao entrar.' }); }
}

// GET /api/loja/auth/me
async function me(req, res) {
  try {
    const [[c]] = await db.query(
      'SELECT id, name, email, cpf, birthdate, phone, address, house_number, neighborhood FROM clients WHERE id = ?',
      [req.customer.id]);
    if (!c) return res.status(404).json({ error: 'Conta não encontrada.' });
    return res.json(c);
  } catch (e) { console.error('Erro em me:', e); return res.status(500).json({ error: 'Erro ao buscar conta.' }); }
}

// PUT /api/loja/auth/me
async function updateMe(req, res) {
  const { name, phone, address, houseNumber, neighborhood, birthdate } = req.body;
  if (!name) return res.status(400).json({ error: 'O nome é obrigatório.' });
  try {
    await db.query(
      'UPDATE clients SET name=?, phone=?, address=?, house_number=?, neighborhood=?, birthdate=? WHERE id=?',
      [name, phone || null, address || null, houseNumber || null, neighborhood || null, birthdate || null, req.customer.id]);
    return res.json({ message: 'Dados atualizados.' });
  } catch (e) { console.error('Erro em updateMe:', e); return res.status(500).json({ error: 'Erro ao atualizar.' }); }
}

// PUT /api/loja/auth/password
async function changePassword(req, res) {
  const { current, novo } = req.body;
  if (!novo || String(novo).length < 8) return res.status(400).json({ error: 'A nova senha deve ter ao menos 8 caracteres.' });
  try {
    const [[c]] = await db.query('SELECT password_hash FROM clients WHERE id = ?', [req.customer.id]);
    const ok = await bcrypt.compare(current || '', c.password_hash || '');
    if (!ok) return res.status(400).json({ error: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(novo, 10);
    await db.query('UPDATE clients SET password_hash = ? WHERE id = ?', [hash, req.customer.id]);
    return res.json({ message: 'Senha alterada.' });
  } catch (e) { console.error('Erro em changePassword:', e); return res.status(500).json({ error: 'Erro ao alterar a senha.' }); }
}

// DELETE /api/loja/auth/me  (direito de exclusão LGPD)
async function deleteMe(req, res) {
  try {
    await db.query('DELETE FROM clients WHERE id = ?', [req.customer.id]);
    return res.json({ message: 'Conta excluída.' });
  } catch (e) { console.error('Erro em deleteMe:', e); return res.status(500).json({ error: 'Erro ao excluir a conta.' }); }
}
```
Atualizar o `module.exports` para: `{ register, verify, resend, login, me, updateMe, changePassword, deleteMe }`.

- [ ] **Step 2: Adicionar as rotas (login público + conta protegida)**

Em `src/routes/lojaAuth.js`, após `router.post('/resend', c.resend);` adicionar:
```js
router.post('/login', c.login);

const customerAuth = require('../middleware/customerAuth');
router.get('/me',        customerAuth, c.me);
router.put('/me',        customerAuth, c.updateMe);
router.put('/password',  customerAuth, c.changePassword);
router.delete('/me',     customerAuth, c.deleteMe);
```

- [ ] **Step 3: Verificar (login + me + delete)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
# recriar e verificar um cliente de teste
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Cli","email":"cli2@teste.com","cpf":"52998224725","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}' >/dev/null
TOKEN=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='cli2@teste.com'\");console.log(c.t);process.exit(0)})()" 2>/dev/null)
curl -s "http://localhost:3000/api/loja/auth/verify?token=$TOKEN" >/dev/null
# login antes de verificar deveria falhar; depois de verificar, sucesso:
JWT=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"cli2@teste.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "jwt len: ${#JWT}"
curl -s http://localhost:3000/api/loja/auth/me -H "Authorization: Bearer $JWT" | grep -o '"name":"[^"]*"\|"email":"[^"]*"'
# me sem token → 401
curl -s -o /dev/null -w "me sem token: %{http_code}\n" http://localhost:3000/api/loja/auth/me
# excluir conta (LGPD)
curl -s -X DELETE http://localhost:3000/api/loja/auth/me -H "Authorization: Bearer $JWT"
```
Esperado: jwt com tamanho > 100; `me` retorna name/email; sem token → 401; delete → "Conta excluída."

- [ ] **Step 4: Commit**

```bash
git add src/controllers/storeAuthController.js src/routes/lojaAuth.js
git commit -m "feat(loja): login do cliente + minha conta (me/editar/senha/excluir)"
```

---

### Task 6: account.js + cadastro.html + verificar.html

**Files:**
- Create: `src/public/loja/account.js`, `src/public/loja/cadastro.html`, `src/public/loja/verificar.html`

**Interfaces:**
- Consome: API `/api/loja/auth/*` (Tasks 4–5)
- Produz: `StoreAuth` (helpers de sessão do cliente) usado pelas páginas de conta

- [ ] **Step 1: Criar `src/public/loja/account.js`**

```js
const StoreAuth = (() => {
  const TKEY = 'loja_token', UKEY = 'loja_user';
  function getToken() { return localStorage.getItem(TKEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(UKEY)); } catch { return null; } }
  function isLoggedIn() { return !!getToken(); }
  function setSession(token, user) { localStorage.setItem(TKEY, token); localStorage.setItem(UKEY, JSON.stringify(user || {})); }
  function logout() { localStorage.removeItem(TKEY); localStorage.removeItem(UKEY); }
  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch('/api/loja/auth' + path, Object.assign({}, opts, { headers }));
  }
  return { getToken, getUser, isLoggedIn, setSession, logout, api };
})();
```

- [ ] **Step 2: Criar `cadastro.html`**

Mesma estrutura de header/footer das outras páginas da loja (logo, busca, carrinho, footer com Política de Privacidade e admin link). `<head>` com Bootstrap Icons + `loja.css`; fim do body: `cart.js`, `loja.js`, `account.js`, e o script da página. Conteúdo:
- Card centralizado "Criar conta" com campos: **Nome**, **E-mail**, **CPF** (com máscara `000.000.000-00` no input), **Data de nascimento** (`type="date"`), **Telefone**, **Senha** (`type="password"`, min 8), **Confirmar senha**, e checkbox **"Li e aceito a Política de Privacidade"** (link → `privacidade.html`, obrigatório).
- Validação no cliente antes de enviar: e-mail com regex, CPF (replicar `validCPF` no script da página), senha ≥8 e igual à confirmação, consentimento marcado. Erros exibidos por campo.
- Submeter via `StoreAuth.api('/register', { method:'POST', body: JSON.stringify({ name, email, cpf, birthdate, phone, password, consent:true }) })`. Em sucesso (201) → trocar o card por uma tela "Verifique seu e-mail" com o e-mail informado e botão **"Reenviar e-mail"** (chama `/resend`). Em 409/400 → mostrar a mensagem de erro do servidor.
- Link "Já tem conta? Entrar" → `entrar.html`.

- [ ] **Step 3: Criar `verificar.html`**

Header/footer da loja. Ao carregar: lê `?token=` da URL e chama `StoreAuth.api('/verify?token=' + encodeURIComponent(token))` (GET). Mostra estado:
- carregando → "Confirmando seu e-mail...";
- sucesso → "E-mail confirmado! 🎉" + botão "Entrar" → `entrar.html`;
- erro (sem token / inválido / expirado) → a mensagem do servidor + um campo de e-mail e botão "Reenviar link" (chama `/resend`).

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
for p in account.js cadastro.html verificar.html; do echo -n "$p: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/$p; done
node -e "new Function(require('fs').readFileSync('src/public/loja/account.js','utf8')); console.log('account.js OK')"
node -e "for (const f of ['cadastro','verificar']){const h=require('fs').readFileSync('src/public/loja/'+f+'.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/);if(m)new Function(m[1]);} console.log('páginas parse OK')"
```
Esperado: 200 nos três; parse OK.

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/account.js src/public/loja/cadastro.html src/public/loja/verificar.html
git commit -m "feat(loja): account.js, página de cadastro e de verificação de e-mail"
```

---

### Task 7: entrar.html + conta.html

**Files:**
- Create: `src/public/loja/entrar.html`, `src/public/loja/conta.html`

- [ ] **Step 1: Criar `entrar.html` (login do cliente)**

Header/footer da loja + scripts (`cart.js`, `loja.js`, `account.js`, script da página). Card "Entrar": campos **E-mail** e **Senha**, botão "Entrar". Submete via `StoreAuth.api('/login', { method:'POST', body: JSON.stringify({ email, password }) })`. Em sucesso: `StoreAuth.setSession(data.token, data.user)` e redireciona para `conta.html` (ou `index.html`). Em 403 com `needsVerification` → mostrar aviso "Confirme seu e-mail" + botão "Reenviar" (`/resend`). Em 401 → "E-mail ou senha inválidos." Link "Não tem conta? Cadastre-se" → `cadastro.html`.

- [ ] **Step 2: Criar `conta.html` (Minha conta — protegida)**

Header/footer da loja + scripts. Ao carregar: se `!StoreAuth.isLoggedIn()` → redireciona para `entrar.html`. Senão `StoreAuth.api('/me')` e preenche:
- **Meus dados** (form): nome, telefone, endereço, número, bairro, data de nascimento (e-mail e CPF exibidos como somente leitura). Salvar via `PUT /me`.
- **Trocar senha** (form): senha atual + nova senha (+ confirmação). `PUT /password`.
- **Sair**: botão que chama `StoreAuth.logout()` + redireciona para `index.html`.
- **Excluir minha conta** (LGPD): botão de perigo com **confirmação dupla** (ex.: SweetAlert ou um confirm com digitação) → `DELETE /me` → `StoreAuth.logout()` → `index.html`. Texto explicando que a exclusão é permanente.
- Se qualquer chamada protegida retornar 401/403 → `StoreAuth.logout()` e redireciona para `entrar.html`.

- [ ] **Step 3: Verificar**

```bash
for p in entrar.html conta.html; do echo -n "$p: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/$p; done
node -e "for (const f of ['entrar','conta']){const h=require('fs').readFileSync('src/public/loja/'+f+'.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>/);if(m)new Function(m[1]);} console.log('parse OK')"
```
Esperado: 200; parse OK. No browser: cadastrar → (modo dev) pegar link do console → verificar → entrar → editar dados → trocar senha → excluir conta.

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/entrar.html src/public/loja/conta.html
git commit -m "feat(loja): páginas de login e de Minha Conta (editar, senha, excluir)"
```

---

### Task 8: Header com estado de login

**Files:**
- Modify: `src/public/loja/loja.js`, `src/public/loja/index.html`, `produtos.html`, `produto.html`, `carrinho.html`, `privacidade.html`

**Interfaces:**
- Consome: sessão em `localStorage` (`loja_token`, `loja_user`)
- Produz: `syncAccountLink()` e `lojaLogout()` globais; o ícone de conta vira link dinâmico

- [ ] **Step 1: Adicionar sync ao loja.js**

No fim de `src/public/loja/loja.js`, adicionar:
```js
function syncAccountLink() {
  var el = document.getElementById('account-link');
  if (!el) return;
  var logged = false;
  try { logged = !!localStorage.getItem('loja_token'); } catch (e) {}
  el.setAttribute('href', logged ? '/loja/conta.html' : '/loja/entrar.html');
  el.setAttribute('title', logged ? 'Minha conta' : 'Entrar ou cadastrar');
  el.setAttribute('aria-label', logged ? 'Minha conta' : 'Entrar ou cadastrar');
}
function lojaLogout() {
  try { localStorage.removeItem('loja_token'); localStorage.removeItem('loja_user'); } catch (e) {}
  window.location = '/loja/';
}
document.addEventListener('DOMContentLoaded', syncAccountLink);
```

- [ ] **Step 2: Dar id="account-link" ao ícone de conta nas 5 páginas**

Em cada uma das 5 páginas (`index.html`, `produtos.html`, `produto.html`, `carrinho.html`, `privacidade.html`), localizar no header o elemento do ícone de conta (👤 / `bi-person`) e garantir que seja um `<a>` com `id="account-link"` e `href` para `/loja/entrar.html` (o `syncAccountLink` ajusta em runtime conforme login). Se hoje o ícone for um `<span>` ou link sem id, transformar em:
```html
<a id="account-link" href="/loja/entrar.html" class="<classe-existente-do-icone>" title="Entrar ou cadastrar" aria-label="Entrar ou cadastrar"><i class="bi bi-person"></i></a>
```
(Manter a classe/estilo que o header já usa para os ícones.)

- [ ] **Step 3: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "new Function(require('fs').readFileSync('src/public/loja/loja.js','utf8')); console.log('loja.js OK')"
for p in "" produtos.html produto.html carrinho.html privacidade.html; do echo -n "/loja/$p: "; curl -s "http://localhost:3000/loja/$p" | grep -c 'id="account-link"'; done
```
Esperado: `loja.js OK`; cada página retorna `1` (tem o `account-link`). No browser: deslogado → ícone leva a Entrar; após login → leva a Minha conta.

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/loja.js src/public/loja/index.html src/public/loja/produtos.html src/public/loja/produto.html src/public/loja/carrinho.html src/public/loja/privacidade.html
git commit -m "feat(loja): header reflete estado de login (Entrar / Minha conta)"
```
