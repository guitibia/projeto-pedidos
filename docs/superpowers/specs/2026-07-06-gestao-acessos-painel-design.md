# Gestão de acessos do painel (trocar senha + criar/remover logins) — Design

**Data:** 2026-07-06
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

No painel admin, permitir: **trocar a própria senha** (qualquer usuário logado) e, para **admins**, **criar novos logins** (com papel Admin ou Limitado), **listar** os logins e **remover** algum — tudo com segurança (bcrypt, verificação de papel no servidor, travas contra se auto-remover / remover o último admin).

## Decisões (aprovadas)

- Papel ao criar: **Admin** (gerencia acessos) ou **Limitado** (`role='user'` — usa o painel, mas não gerencia acessos).
- Incluir **lista + remover** logins, com travas: não remover o próprio login nem o último admin.
- Autoridade no **servidor**: criar/listar/remover exigem `role==='admin'` (checado no backend, não só na UI). Trocar a própria senha exige apenas estar logado.

## Estado atual (já existe)

- Tabela `users` (colunas: id, username, password_hash, role, e provavelmente created_at).
- `authController.login` (bcrypt.compare, JWT com {id, username, role}) e `authController.register` (admin-only via rota; cria user com bcrypt.hash, role padrão 'user').
- `routes/auth.js`: `POST /login` (público) e `POST /register` (authMiddleware + guarda inline `role==='admin'`).
- `middleware/auth.js`: injeta `req.user` (id, username, role); rejeita tokens de cliente da loja.
- `app.js:37`: `app.use('/api/auth', loginLimiter, authRoutes)` — **loginLimiter = 10 req/15min** (apertado p/ as telas de gestão).
- Frontend `js/auth.js`: `Auth.getUser()` (tem `role`), `Auth.apiFetch`, `Auth.getToken`.

## Arquitetura / Componentes

### `app.js` — separar o rate limit
Trocar a linha `app.use('/api/auth', loginLimiter, authRoutes);` por (espelha o padrão da loja em app.js:52-53):
```js
app.use('/api/auth/login', loginLimiter);        // limite restrito só no login
app.use('/api/auth', apiLimiter, authRoutes);
```
Assim login continua protegido (10/15min) e as rotas de gestão ficam sob `apiLimiter` (120/min).

### `routes/auth.js`
- Extrair a guarda de admin num middleware reutilizável:
  ```js
  function soAdmin(req, res, next) {
    if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores.' });
    next();
  }
  ```
- Rotas:
  - `router.post('/login', login);`
  - `router.post('/register', authMiddleware, soAdmin, register);` (mantém o comportamento atual)
  - `router.post('/change-password', authMiddleware, changePassword);` (qualquer logado)
  - `router.get('/users', authMiddleware, soAdmin, listUsers);`
  - `router.delete('/users/:id', authMiddleware, soAdmin, deleteUser);`

### `controllers/authController.js` — novas funções + ajuste no register
- **`register`** (ajuste): validar senha com **mín. 6** caracteres; normalizar papel: `const papel = role === 'admin' ? 'admin' : 'user';` e usar `papel` no INSERT. (Resto igual: 409 se username existe.)
- **`changePassword(req, res)`** (autenticado):
  - `const { currentPassword, newPassword } = req.body;`
  - se faltar algum → 400. Se `String(newPassword).length < 6` → 400 'A nova senha deve ter ao menos 6 caracteres.'.
  - `SELECT password_hash FROM users WHERE id = ?` com `req.user.id`; se não achar → 404.
  - `bcrypt.compare(currentPassword, hash)`; se falso → 400 'Senha atual incorreta.'.
  - `UPDATE users SET password_hash = ? WHERE id = ?` com `bcrypt.hash(newPassword, 10)`.
  - 200 `{ message: 'Senha alterada com sucesso.' }`.
- **`listUsers(req, res)`** (admin-only via rota):
  - `SELECT id, username, role, created_at FROM users ORDER BY username` — **sem** password_hash. Retorna o array.
- **`deleteUser(req, res)`** (admin-only via rota):
  - `const id = parseInt(req.params.id, 10);` inválido → 400.
  - se `id === req.user.id` → 400 'Você não pode remover o seu próprio login.'.
  - `SELECT role FROM users WHERE id = ?`; se não achar → 404.
  - se o alvo é `admin`: `SELECT COUNT(*) c FROM users WHERE role='admin'`; se `c <= 1` → 400 'Não é possível remover o último administrador.'.
  - `DELETE FROM users WHERE id = ?`. 200 `{ message: 'Login removido.' }`.
- Exportar `login, register, changePassword, listUsers, deleteUser`.

### Frontend — `src/public/painel.html`
- **Botão "Gerenciar acessos"** na barra lateral (perto de Tema/Sair) — abre o modal `#acessosModal`.
- **Modal `#acessosModal`** com:
  - **Seção "Trocar minha senha"** (sempre visível): senha atual, nova, confirmar; botão Salvar → `POST /api/auth/change-password`. Valida no cliente que nova === confirmar e tem ≥ 6.
  - **Seção "Logins do painel"** (só se `Auth.getUser().role === 'admin'`; senão escondida):
    - **Lista** dos logins (`GET /api/auth/users`): usuário · papel (Admin/Limitado) · criado; botão **Remover** por linha → `DELETE /api/auth/users/:id` (confirm SweetAlert). O próprio login e o(s) admin(s) exibem sem risco (o backend barra). Recarrega a lista ao remover/criar.
    - **Criar novo login**: usuário, senha, papel (select Admin/Limitado) → `POST /api/auth/register` (envia `role: 'admin'|'user'`). Recarrega a lista.
  - Mensagens de erro do backend exibidas via SweetAlert; sucesso via toast.
- Usa `Auth.apiFetch` (injeta o token). Escapar textos dinâmicos (username) com o `esc()` da página.

## Erros / segurança

| Situação | Resposta |
|---|---|
| change-password sem token | 401 (middleware) |
| register/users/delete sem papel admin | 403 |
| senha atual incorreta | 400 |
| nova senha < 6 | 400 |
| username duplicado (criar) | 409 |
| remover a si mesmo | 400 |
| remover o último admin | 400 |

Senhas sempre com **bcrypt** (custo 10); `listUsers` nunca retorna hash; papel validado no servidor.

## Testes (`node:test`, `db_pedidos_teste`)

Chamando os controllers com `req` mockado (`req.user`, `req.params`, `req.body`) e `res` mock; semeia usuários próprios e limpa:
- `changePassword`: senha atual correta → 200 e o novo hash bate com a nova senha; senha atual errada → 400; nova < 6 → 400.
- `deleteUser`: remover a si mesmo → 400; remover o **último admin** (1 admin no banco, caller admin com outro id) → 400; remover um 'user' comum → 200 e some do banco.
- `listUsers`: retorna os campos esperados e **não** inclui `password_hash`.
- `register`: senha < 6 → 400; papel 'x' vira 'user'; username duplicado → 409.
- Cleanup: apaga os usuários semeados (prefixo de teste, ex.: 'zz_test_...').
