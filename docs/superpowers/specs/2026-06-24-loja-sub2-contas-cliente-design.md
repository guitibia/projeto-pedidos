# Loja — Sub-projeto 2: Contas de Cliente + LGPD — Design

**Data:** 2026-06-24
**Branch:** Teste
**Parte de:** Loja e-commerce pública (sub-projeto 2 de 4)

## Objetivo

Permitir que clientes se cadastrem, confirmem o e-mail (duplo opt-in), façam login e gerenciem seus dados (LGPD), integrando login/conta ao header da loja. Checkout e pagamento ficam para os sub-projetos 3 e 4.

## Decisões tomadas

- **Estender a tabela `clients`** (não criar tabela nova). Conta da loja = linha de `clients` com `email` + `password_hash`; clientes criados pelo admin continuam sem login (email NULL).
- **Envio de e-mail:** Gmail SMTP via `nodemailer` + App Password (variáveis no `.env`). Camada de envio com **fallback de dev**: sem credenciais, loga o link de verificação no console (permite construir/testar sem e-mail real).
- **Auth do cliente:** JWT próprio com claim `type:'customer'`, separado do admin; nunca dá acesso ao painel. Senha com `bcryptjs` (já no projeto).
- **CPF** e **endereço:** CPF obrigatório no cadastro (com validação de dígitos); endereço **opcional** no cadastro (pedido no checkout, sub-projeto 3).
- **"Esqueci a senha"** (reset por e-mail): **fora de escopo** deste sub-projeto (follow-up rápido depois, já que o e-mail estará pronto).

## Modelo de dados (migrações não-destrutivas em connection.js)

```sql
ALTER TABLE clients ADD COLUMN email VARCHAR(255) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN cpf VARCHAR(11) DEFAULT NULL;            -- só dígitos
ALTER TABLE clients ADD COLUMN birthdate DATE DEFAULT NULL;
ALTER TABLE clients ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN verification_token VARCHAR(64) DEFAULT NULL;
ALTER TABLE clients ADD COLUMN verification_expires DATETIME DEFAULT NULL;
ALTER TABLE clients ADD COLUMN lgpd_consent_at DATETIME DEFAULT NULL;
-- únicos (MySQL permite múltiplos NULL → não conflita com clientes do admin)
CREATE UNIQUE INDEX uq_clients_email ON clients(email);
CREATE UNIQUE INDEX uq_clients_cpf   ON clients(cpf);
```
(Cada `ALTER`/`CREATE INDEX` em seu próprio `try { } catch (_) {}`.)

## Backend

### `src/utils/mailer.js` (novo)
- `nodemailer` (nova dependência). Se `process.env.SMTP_USER` e `SMTP_PASS` existem → transport Gmail (`service:'gmail'`, auth user/pass). Senão → **modo dev**: `console.log` do destinatário + link.
- `sendVerificationEmail(to, name, link)` — assunto e corpo em pt-BR, com o link de confirmação. Retorna sem lançar em caso de falha de envio (loga o erro), para não derrubar o cadastro.
- `APP_URL` (env, default `http://localhost:3000`) compõe o link.

### `src/middleware/customerAuth.js` (novo)
- Lê `Authorization: Bearer <jwt>`, verifica com `JWT_SECRET`, exige `payload.type === 'customer'`; injeta `req.customer = { id, email }`. 401 caso contrário.

### `src/controllers/storeAuthController.js` (novo)
- **`register`** — valida nome, e-mail (formato), CPF (11 dígitos + dígitos verificadores), birthdate, telefone, senha (≥8), consentimento (obrigatório). Verifica e-mail/CPF não usados. Cria a linha em `clients` com `password_hash` (bcrypt), `email_verified=0`, `verification_token` (`crypto.randomBytes(32).toString('hex')`), `verification_expires` (+24h), `lgpd_consent_at=NOW()`. Chama `sendVerificationEmail` com link `APP_URL + /loja/verificar.html?token=<token>`. Responde 201 "Cadastro criado, verifique seu e-mail".
- **`verify`** (`GET ?token=`) — acha cliente pelo token não expirado; seta `email_verified=1`, limpa token/expires; responde sucesso (JSON). Token inválido/expirado → 400.
- **`resend`** — body `{ email }`; se a conta existe e não verificada, gera novo token e reenvia. Sempre responde genérico (não revela existência do e-mail).
- **`login`** — body `{ email, password }`; valida senha (bcrypt); se `email_verified=0` → 403 "confirme seu e-mail" (com flag para a UI oferecer reenvio); senão emite JWT `{ id, email, type:'customer' }` (exp 7d). Retorna `{ token, user:{ id, name, email } }`.
- **`me`** (customerAuth) — retorna perfil (id, name, email, cpf, birthdate, phone, address, house_number, neighborhood).
- **`updateMe`** (customerAuth) — atualiza name, phone, address, house_number, neighborhood, birthdate (não troca e-mail/CPF aqui).
- **`changePassword`** (customerAuth) — body `{ current, novo }`; valida current, grava novo hash.
- **`deleteMe`** (customerAuth) — exclusão LGPD: remove a linha de `clients` (neste estágio contas da loja não têm pedidos). *Quando houver pedidos (sub-projeto 3), anonimizar em vez de apagar.*

### Rotas `src/routes/lojaAuth.js` → montadas em `app.js` como `/api/loja/auth` (com `apiLimiter`)
- Públicas: `POST /register`, `GET /verify`, `POST /resend`, `POST /login`.
- Protegidas (customerAuth): `GET /me`, `PUT /me`, `PUT /password`, `DELETE /me`.
- O login usa o `loginLimiter` (mais restrito) como o admin.

## Frontend (loja, `src/public/loja/`)

- **`cadastro.html`** — formulário Clean Boutique: nome, e-mail, CPF (máscara), data de nascimento, telefone, senha + confirmação, checkbox de **consentimento LGPD** (link → `privacidade.html`, obrigatório). Validação no cliente (CPF, e-mail, força de senha, confirmação) + mensagens de erro por campo. Ao enviar com sucesso → tela "verifique seu e-mail" com botão de reenviar.
- **`entrar.html`** — login do cliente (e-mail + senha). Link para `cadastro.html`. Em "e-mail não confirmado" → oferece reenviar. (Caminho `/loja/entrar.html` — **não** colide com o `/login.html` do admin.)
- **`verificar.html`** — lê `?token=`, chama `GET /api/loja/auth/verify`, mostra sucesso ("conta confirmada, entrar") ou erro (link/expirado → reenviar).
- **`conta.html`** — "Minha conta" (protegida; sem token → redireciona para `entrar.html`): ver/editar dados, trocar senha, **excluir conta** (confirmação dupla, LGPD), sair.
- **`account.js`** (novo, carregado nas páginas de conta) — helpers de auth do cliente: `storeFetch` (fetch com Bearer), guarda `localStorage` (`loja_token`, `loja_user`), `storeLogin/register/logout`, e a lógica dos formulários.
- **Header (em todas as páginas da loja):** o ícone "conta" (👤) recebe `id="account-link"`. O `loja.js` ganha `syncAccountLink()` (no DOMContentLoaded): se há `loja_token`, vira "Minha conta" → `conta.html`; senão "Entrar" → `entrar.html`. `lojaLogout()` limpa a sessão e atualiza o header.

## LGPD

- **Consentimento explícito** no cadastro (checkbox obrigatório + `lgpd_consent_at`), com link para a Política de Privacidade (já existe).
- **Minimização:** coleta só o necessário (endereço opcional no cadastro).
- **Direitos do titular:** acesso e correção (Minha conta), **exclusão** (excluir conta).
- **Segurança:** senha com bcrypt; verificação de e-mail confirma a titularidade do dado.

## Casos de borda

- E-mail/CPF já cadastrados → erro claro no formulário.
- Token de verificação expirado/ inválido → mensagem + reenviar.
- Login antes de confirmar → 403 com opção de reenviar.
- Falha no envio de e-mail (SMTP off/erro) → cadastro ainda é criado; no modo dev o link aparece no console (e podemos reenviar).
- `.env` ganha `SMTP_USER`, `SMTP_PASS`, `APP_URL` (gitignored). Sem elas → modo dev.

## Fora de escopo

- Checkout e pedidos do cliente (sub-projeto 3).
- Pagamento (sub-projeto 4).
- "Esqueci a senha" (follow-up).
- Login social (Google etc.).
