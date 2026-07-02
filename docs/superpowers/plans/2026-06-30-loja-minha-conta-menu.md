# Loja — Redesenho "Minha conta" (#4) + menu rápido no header (#8) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deixar a página "Minha conta" mais bonita (cabeçalho de perfil + cartões, com endereço completo editável) e adicionar um menu rápido (dropdown) no ícone de conta do header.

**Architecture:** `conta.html` é reorganizado em um cabeçalho de perfil + cartões por seção, e ganha CEP/Cidade com ViaCEP; sua lógica (load `/me`, salvar, senha, logout, excluir) é preservada, só completada com cep+city. Um novo `initAccountMenu()` em `account.js` constrói um dropdown no `#account-link` quando logado; estilos em `loja.css`; o `#account-link` é padronizado nas páginas que faltam. Backend já pronto.

**Tech Stack:** HTML/CSS/JS vanilla, ViaCEP, design Clean Boutique (tokens em `loja.css`). Para o visual, seguir o estilo existente (ui-ux-pro-max como referência de cartões/dropdown).

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Sem backend novo** — `/me` retorna `cep`/`city`; `PUT /me` aceita `cep`/`city` (entregue em #5/#6). CEP é gravado só com dígitos no servidor (o front pode enviar com ou sem máscara; envie dígitos).
- Reusar tokens do `loja.css` (`--surface`, `--border`, `--radius`, `--accent`, `--text`, `--text-soft`, `--danger`) e o helper `StoreAuth` (`account.js`).
- Preservar TODA a lógica atual do `conta.html`: guard de auth (redireciona deslogado), `loadMe`, salvar dados, trocar senha (`PUT /password`), logout, excluir conta (digitar EXCLUIR → `DELETE /me`).
- #8: deslogado → ícone vai pro `entrar.html` (sem dropdown); logado → dropdown. Fecha em clique-fora e Esc; `aria-expanded`.
- Sem testes automatizados — curl + navegador (matar `node` após testar: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`).

---

### Task 1: Redesenho do `conta.html` (cabeçalho + cartões + endereço completo)

**Files:**
- Modify: `src/public/loja/conta.html`

**Interfaces:**
- Consome: `StoreAuth.api('/me')` (GET retorna `name,email,cpf,phone,birthdate,cep,address,house_number,neighborhood,city`); `PUT /me` aceita `{name,phone,cep,address,houseNumber,neighborhood,city,birthdate}`.

- [ ] **Step 1: Reorganizar o markup em cabeçalho de perfil + cartões**

Reestruturar o `<main>` do `conta.html` mantendo TODOS os ids existentes (`#nome`, `#email-ro`, `#cpf-ro`, `#phone`, `#birthdate`, `#address`, `#houseNumber`, `#neighborhood`, `#dados-form`, `#dados-btn`, `#dados-alert`, `#senha-form`, `#senha-btn`, formulário de senha, `#logout-btn`, e todo o bloco de exclusão com `#excluir-*`). Mudanças:
- **Cabeçalho de perfil** no topo: um bloco com um círculo de iniciais (`<div class="conta-avatar" id="conta-avatar"></div>`), o saudação `#user-greeting` (já existe), e um `<div id="user-email-sub">` com o e-mail.
- Envolver cada seção num **cartão** reutilizando a classe existente `.conta-section` (que já é o cartão base) — apenas garantir título com ícone (já têm) e bom espaçamento. Adicionar dois **cartões-link**: "Meus pedidos" (já existe, link para `meus-pedidos.html`) e um novo **Favoritos** → `<a href="favoritos.html" class="btn section-btn"><i class="bi bi-heart"></i> Meus favoritos</a>` num cartão com `<h2><i class="bi bi-heart-fill"></i> Favoritos</h2>`.
- No cartão "Meus dados", DENTRO do `#dados-form`, ANTES do campo Endereço (#address), inserir CEP + Cidade:
```html
          <div class="field">
            <label for="cep">CEP</label>
            <input type="tel" id="cep" name="cep" placeholder="00000-000" maxlength="9" inputmode="numeric" autocomplete="postal-code">
            <span id="cep-hint" style="font-size:.81rem;color:var(--text-soft);display:none"></span>
          </div>
          <div class="field">
            <label for="city">Cidade</label>
            <input type="text" id="city" name="city" autocomplete="address-level2" placeholder="Sua cidade">
          </div>
```

- [ ] **Step 2: CSS do cabeçalho de perfil (estilo Clean Boutique)**

No `<style>` do `conta.html`, adicionar (usando os tokens do tema):
```css
    .conta-profile { display:flex; align-items:center; gap:1rem; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:1.2rem 1.4rem; margin-bottom:1.4rem; box-shadow:0 2px 16px rgba(60,40,35,.06); }
    .conta-avatar { width:56px; height:56px; border-radius:50%; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:1.3rem; flex:0 0 auto; }
    .conta-profile h1 { margin:0; font-size:1.4rem; }
    #user-email-sub { color:var(--text-soft); font-size:.9rem; }
```
Posicionar o `#user-greeting` dentro de `.conta-profile` (o `<h1>` antigo "Minha conta" pode virar o saudação, ou manter um `<h1>` curto acima). Mantenha o uso de `--radius`/`--surface` para os cartões coerente.

- [ ] **Step 3: Iniciais no avatar**

No `<script>`, dentro de `loadMe` (após obter `data`), preencher o avatar:
```js
          var nome = (data.name || '').trim();
          var ini = nome ? nome.trim().split(/\s+/).map(function(p){return p[0];}).slice(0,2).join('').toUpperCase() : (data.email || '?')[0].toUpperCase();
          var av = document.getElementById('conta-avatar'); if (av) av.textContent = ini;
          var sub = document.getElementById('user-email-sub'); if (sub) sub.textContent = data.email || '';
```

- [ ] **Step 4: Load `/me` — preencher cep+city e CORRIGIR house_number**

No `loadMe`, as linhas que populam os campos editáveis hoje leem `data.houseNumber` (camel) — mas o `/me` retorna `house_number` (snake), então o número nunca carrega (bug atual). Trocar/expandir:
```js
          document.getElementById('nome').value = data.name || '';
          document.getElementById('phone').value = data.phone || '';
          document.getElementById('cep').value = data.cep || '';
          document.getElementById('city').value = data.city || '';
          document.getElementById('address').value = data.address || '';
          document.getElementById('houseNumber').value = data.house_number || '';
          document.getElementById('neighborhood').value = data.neighborhood || '';
```

- [ ] **Step 5: ViaCEP no conta**

No `<script>`, adicionar o handler de CEP (preenche rua/bairro/cidade):
```js
      var inpCep = document.getElementById('cep');
      async function buscarCep(cepRaw) {
        var cep = String(cepRaw || '').replace(/\D/g, '');
        if (cep.length !== 8) return null;
        try { var r = await fetch('https://viacep.com.br/ws/' + cep + '/json/'); if (!r.ok) return null; var d = await r.json(); return d.erro ? null : d; }
        catch (e) { return null; }
      }
      async function preencherCep() {
        var digits = inpCep.value.replace(/\D/g, '');
        var hint = document.getElementById('cep-hint');
        if (digits.length !== 8) { if (hint) hint.style.display = 'none'; return; }
        if (hint) { hint.style.display = 'block'; hint.textContent = 'Buscando CEP…'; }
        var d = await buscarCep(digits);
        if (d) {
          if (d.logradouro) document.getElementById('address').value = d.logradouro;
          if (d.bairro)     document.getElementById('neighborhood').value = d.bairro;
          if (d.localidade) document.getElementById('city').value = d.localidade;
          if (hint) hint.style.display = 'none';
          document.getElementById('houseNumber').focus();
        } else if (hint) { hint.textContent = 'CEP não encontrado — preencha manualmente.'; }
      }
      if (inpCep) { inpCep.addEventListener('input', preencherCep); inpCep.addEventListener('blur', preencherCep); }
```

- [ ] **Step 6: Salvar — incluir cep (dígitos) + city no PUT /me**

No handler `dadosForm` submit, no objeto `payload`, acrescentar:
```js
          cep: document.getElementById('cep').value.replace(/\D/g, ''),
          city: document.getElementById('city').value.trim(),
```
(mantendo os campos existentes `name, phone, address, houseNumber, neighborhood, birthdate`).

- [ ] **Step 7: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "conta 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/conta.html
node -e "const h=require('fs').readFileSync('src/public/loja/conta.html','utf8'); console.log('tem #cep:', /id=\"cep\"/.test(h), '| #city:', /id=\"city\"/.test(h), '| avatar:', h.includes('conta-avatar'), '| house_number load:', h.includes('data.house_number'), '| cep no payload:', /cep:\s*document/.test(h), '| favoritos card:', h.includes('favoritos.html')); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
# end-to-end: registra+verifica+loga e testa PUT /me com cep+city
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"DELETE FROM clients WHERE email='contae2e@x.com'\");process.exit(0)})()" 2>/dev/null
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Conta E2E","email":"contae2e@x.com","cpf":"39053344705","birthdate":"1990-01-01","password":"senha1234","consent":true,"cep":"13870-000","address":"R","houseNumber":"1","neighborhood":"Centro","city":"São João da Boa Vista"}' >/dev/null
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"UPDATE clients SET email_verified=1,verification_token=NULL WHERE email='contae2e@x.com'\");process.exit(0)})()" 2>/dev/null
TK=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"contae2e@x.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "GET /me tem house_number/cep/city:"; curl -s http://localhost:3000/api/loja/auth/me -H "Authorization: Bearer $TK" | grep -oE '"(house_number|cep|city)":"[^"]*"'
curl -s http://localhost:3000/api/loja/auth/me -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $TK" -d '{"name":"Conta E2E","phone":"11","cep":"13870-111","city":"São João da Boa Vista","address":"Rua Z","houseNumber":"9","neighborhood":"Centro","birthdate":"1990-01-01"}' >/dev/null
echo "após PUT, cep:"; curl -s http://localhost:3000/api/loja/auth/me -H "Authorization: Bearer $TK" | grep -o '"cep":"[^"]*"'
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: conta 200; checks todos true; JS parse OK; GET /me mostra house_number/cep/city; após PUT o cep vira `13870111` (8 dígitos).

- [ ] **Step 8: Commit**

```bash
git add src/public/loja/conta.html
git commit -m "feat(loja): redesenho Minha conta (cabeçalho + cartões) + CEP/cidade editáveis"
```

---

### Task 2: Menu rápido no header (dropdown)

**Files:**
- Modify: `src/public/loja/account.js`, `src/public/loja/loja.css`, `src/public/loja/cadastro.html`, `src/public/loja/conta.html`, `src/public/loja/entrar.html`, `src/public/loja/verificar.html`

**Interfaces:**
- Consome: `StoreAuth.isLoggedIn()`, `StoreAuth.getUser()` (`{name,email}`), `StoreAuth.logout()`; o elemento `#account-link` no header.

- [ ] **Step 1: `initAccountMenu()` em `account.js`**

No final de `account.js` (após o `Favorites`/`lojaToggleFav`), adicionar:
```js
// ── Menu rápido da conta (dropdown no header) ──
function initAccountMenu() {
  var link = document.getElementById('account-link');
  if (!link) return;
  if (!StoreAuth.isLoggedIn()) return; // deslogado: link normal para entrar.html (syncAccountLink cuida do href)

  var user = StoreAuth.getUser() || {};
  var nome = (user.name || 'Minha conta');
  var email = (user.email || '');

  // wrapper posicionado
  var wrap = document.createElement('div');
  wrap.className = 'account-menu-wrap';
  link.parentNode.insertBefore(wrap, link);
  wrap.appendChild(link);

  link.setAttribute('href', '/loja/conta.html');
  link.setAttribute('aria-haspopup', 'true');
  link.setAttribute('aria-expanded', 'false');

  var menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML =
    '<div class="account-menu__head"><strong></strong><span></span></div>' +
    '<a role="menuitem" href="/loja/conta.html"><i class="bi bi-person"></i> Meus dados</a>' +
    '<a role="menuitem" href="/loja/meus-pedidos.html"><i class="bi bi-bag-check"></i> Meus pedidos</a>' +
    '<a role="menuitem" href="/loja/favoritos.html"><i class="bi bi-heart"></i> Favoritos</a>' +
    '<button type="button" role="menuitem" class="account-menu__logout"><i class="bi bi-box-arrow-right"></i> Sair</button>';
  // preencher nome/email com textContent (evita XSS)
  menu.querySelector('.account-menu__head strong').textContent = 'Olá, ' + nome;
  menu.querySelector('.account-menu__head span').textContent = email;
  wrap.appendChild(menu);

  function open() { wrap.classList.add('open'); link.setAttribute('aria-expanded', 'true'); }
  function close() { wrap.classList.remove('open'); link.setAttribute('aria-expanded', 'false'); }
  function toggle() { wrap.classList.contains('open') ? close() : open(); }

  link.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
  menu.querySelector('.account-menu__logout').addEventListener('click', function () {
    StoreAuth.logout(); window.location = '/loja/';
  });
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
}
document.addEventListener('DOMContentLoaded', initAccountMenu);
```

- [ ] **Step 2: CSS `.account-menu` em `loja.css`**

Adicionar ao `src/public/loja/loja.css`:
```css
/* Menu rápido da conta (header) */
.account-menu-wrap { position: relative; display: inline-flex; }
.account-menu {
  position: absolute; top: calc(100% + 8px); right: 0; min-width: 220px;
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: 0 8px 28px rgba(60,40,35,.16); padding: .4rem; z-index: 1200;
  display: none; flex-direction: column;
}
.account-menu-wrap.open .account-menu { display: flex; }
.account-menu__head { padding: .5rem .6rem .6rem; border-bottom: 1px solid var(--border); margin-bottom: .3rem; }
.account-menu__head strong { display: block; font-size: .92rem; color: var(--text); }
.account-menu__head span { font-size: .8rem; color: var(--text-soft); word-break: break-all; }
.account-menu a, .account-menu__logout {
  display: flex; align-items: center; gap: .55rem; padding: .6rem .6rem; border-radius: 8px;
  color: var(--text); text-decoration: none; font-size: .92rem; background: none; border: none;
  width: 100%; text-align: left; cursor: pointer;
}
.account-menu a:hover, .account-menu__logout:hover { background: rgba(0,0,0,.05); }
.account-menu__logout { color: var(--danger); }
@media (max-width: 480px) { .account-menu { right: -8px; min-width: 200px; } }
```

- [ ] **Step 3: Padronizar `id="account-link"` nas 4 páginas que faltam**

Em `cadastro.html`, `conta.html`, `entrar.html`, `verificar.html`, no header (`store-header__nav`), o anchor de conta (o `<a>` com o ícone `bi-person`/`bi-person-fill` e título "Minha conta"/"Entrar…") deve receber `id="account-link"`. Exemplo: trocar
```html
        <a href="conta.html" title="Minha conta" aria-label="Minha conta">
```
por
```html
        <a id="account-link" href="conta.html" title="Minha conta" aria-label="Minha conta">
```
(em cada página, manter o `href` que já está lá; só adicionar o `id`). Conferir que cada uma dessas páginas carrega `account.js` (e `loja.js`); se alguma não carregar `account.js`, incluir `<script src="/loja/account.js"></script>` junto aos outros scripts no fim do `<body>` (mesmo padrão das demais páginas).

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo "account-link presente em todas as páginas com header:"
for f in cadastro conta entrar verificar carrinho checkout favoritos index meus-pedidos produto produtos; do echo -n "$f: "; curl -s http://localhost:3000/loja/$f.html | grep -c 'id="account-link"'; done
node -e "const j=require('fs').readFileSync('src/public/loja/account.js','utf8'); console.log('initAccountMenu:', j.includes('initAccountMenu'), '| logout+home:', j.includes(\"window.location = '/loja/'\")); new Function(j.replace(/document\\.addEventListener[\\s\\S]*$/,'')); console.log('account.js parse OK (corpo)');"
echo -n "css .account-menu: "; curl -s http://localhost:3000/loja/loja.css | grep -c "account-menu"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: cada página → 1; `initAccountMenu` true; logout+home true; css `.account-menu` ≥ 1.

- [ ] **Step 5: Teste no navegador (manual)**

`npm run dev` → logar → em qualquer página, clicar no ícone de pessoa abre o dropdown (Olá/nome, Meus dados, Meus pedidos, Favoritos, Sair); fecha ao clicar fora e no Esc; cada link navega certo; Sair desloga e volta pra home. Deslogar → o ícone leva direto pro `entrar.html` (sem dropdown).

- [ ] **Step 6: Commit**

```bash
git add src/public/loja/account.js src/public/loja/loja.css src/public/loja/cadastro.html src/public/loja/conta.html src/public/loja/entrar.html src/public/loja/verificar.html
git commit -m "feat(loja): menu rápido (dropdown) no ícone de conta do header"
```
