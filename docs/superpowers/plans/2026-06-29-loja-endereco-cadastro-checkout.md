# Loja — CEP/endereço no cadastro (#5) + escolher endereço no checkout (#6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Coletar endereço (com CEP/ViaCEP) obrigatório no cadastro e, no checkout, deixar o cliente usar o endereço do cadastro ou informar outro.

**Architecture:** `storeAuthController` passa a gravar/retornar o endereço completo; `cadastro.html` ganha bloco de endereço com ViaCEP; `checkout.html` ganha um seletor "usar cadastro / outro endereço" que controla preencher (do `/me`) × limpar os campos já existentes. Servidor continua autoritativo (frete pelo bairro, cidade validada).

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla, ViaCEP.

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Sem migração** — `clients` já tem `cep, address, house_number, neighborhood, city` (nulas).
- #5 endereço **obrigatório** (CEP + número; ViaCEP preenche rua/bairro/cidade); bairro no cadastro é **texto livre** (não o dropdown de zonas); **sem** bloqueio por cidade no cadastro.
- #6 "usar endereço do cadastro" vem **pré-selecionado** quando o `/me` tem endereço (pelo menos `cep`/`address`/`city`); senão inicia em "outro endereço".
- Servidor autoritativo: frete recalculado pelo bairro, cidade validada no servidor (já implementado — não regredir).
- SQL parametrizado. Sem testes automatizados — curl + navegador (matar `node` após testar: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`; DB branch-isolado `Teste`→`db_pedidos_teste`).

---

### Task 1: Backend — gravar/retornar endereço (storeAuthController)

**Files:**
- Modify: `src/controllers/storeAuthController.js` (register ~25-48, me ~97-103, updateMe ~108-115)

**Interfaces:**
- Produz: `POST /api/loja/auth/register` passa a exigir `cep, address, houseNumber, neighborhood, city`; `GET /api/loja/auth/me` passa a retornar `cep` e `city` (além de address/house_number/neighborhood); `PUT /api/loja/auth/me` aceita e grava `cep, city`.

- [ ] **Step 1: register — desestruturar + validar + gravar endereço**

Em `register`, trocar a linha de desestruturação:
```js
const { name, email, cpf, birthdate, phone, password, consent } = req.body;
```
por:
```js
const { name, email, cpf, birthdate, phone, password, consent, cep, address, houseNumber, neighborhood, city } = req.body;
```
Logo após a validação do `consent` (a linha `if (!consent) ...`), adicionar:
```js
  if (!cep || !address || !houseNumber || !neighborhood || !city)
    return res.status(400).json({ error: 'Preencha o endereço completo.' });
```
Trocar o INSERT:
```js
    await db.query(
      `INSERT INTO clients (name, email, cpf, birthdate, phone, password_hash, email_verified, verification_token, verification_expires, lgpd_consent_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
      [name, email, cpfDigits, birthdate, phone || null, hash, token, expires]
    );
```
por:
```js
    await db.query(
      `INSERT INTO clients (name, email, cpf, birthdate, phone, cep, address, house_number, neighborhood, city, password_hash, email_verified, verification_token, verification_expires, lgpd_consent_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
      [name, email, cpfDigits, birthdate, phone || null, cep, address, houseNumber, neighborhood, city, hash, token, expires]
    );
```

- [ ] **Step 2: me — retornar cep + city**

Em `me`, trocar o SELECT:
```js
'SELECT id, name, email, cpf, birthdate, phone, address, house_number, neighborhood FROM clients WHERE id = ?',
```
por:
```js
'SELECT id, name, email, cpf, birthdate, phone, cep, address, house_number, neighborhood, city FROM clients WHERE id = ?',
```

- [ ] **Step 3: updateMe — aceitar + gravar cep + city**

Em `updateMe`, trocar:
```js
  const { name, phone, address, houseNumber, neighborhood, birthdate } = req.body;
```
por:
```js
  const { name, phone, address, houseNumber, neighborhood, birthdate, cep, city } = req.body;
```
e o UPDATE:
```js
      'UPDATE clients SET name=?, phone=?, address=?, house_number=?, neighborhood=?, birthdate=? WHERE id=?',
      [name, phone || null, address || null, houseNumber || null, neighborhood || null, birthdate || null, req.customer.id]);
```
por:
```js
      'UPDATE clients SET name=?, phone=?, cep=?, address=?, house_number=?, neighborhood=?, city=?, birthdate=? WHERE id=?',
      [name, phone || null, cep || null, address || null, houseNumber || null, neighborhood || null, city || null, birthdate || null, req.customer.id]);
```

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
EMAIL="end$(date +%s)@teste.com"
echo -n "register SEM endereço -> 400: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d "{\"name\":\"End Teste\",\"email\":\"$EMAIL\",\"cpf\":\"52998224725\",\"birthdate\":\"1990-05-10\",\"phone\":\"11999990000\",\"password\":\"senha1234\",\"consent\":true}"
echo -n "register COM endereço -> 201: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d "{\"name\":\"End Teste\",\"email\":\"$EMAIL\",\"cpf\":\"52998224725\",\"birthdate\":\"1990-05-10\",\"phone\":\"11999990000\",\"password\":\"senha1234\",\"consent\":true,\"cep\":\"13870-000\",\"address\":\"Rua Teste\",\"houseNumber\":\"100\",\"neighborhood\":\"Centro\",\"city\":\"São João da Boa Vista\"}"
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query('SELECT cep,address,house_number,neighborhood,city,verification_token t FROM clients WHERE email=?',['$EMAIL']);console.log('salvou endereço:', c.cep, c.address, c.house_number, c.neighborhood, c.city);
// verifica /me: confirma e loga
await db.query('UPDATE clients SET email_verified=1, verification_token=NULL WHERE email=?',['$EMAIL']);process.exit(0)})()" 2>/dev/null
TK=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"senha1234\"}" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "GET /me (deve ter cep + city):"; curl -s -m 8 http://localhost:3000/api/loja/auth/me -H "Authorization: Bearer $TK"
echo ""; echo -n "PUT /me preserva (ok): "; curl -s -m 8 http://localhost:3000/api/loja/auth/me -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $TK" -d '{"name":"End Teste","cep":"13870-001","address":"Rua Nova","houseNumber":"200","neighborhood":"Centro","city":"São João da Boa Vista","birthdate":"1990-05-10"}'
echo ""; curl -s http://localhost:3000/api/loja/auth/me -H "Authorization: Bearer $TK" | grep -o '"cep":"[^"]*"'
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: sem endereço → 400; com endereço → 201; `salvou endereço:` mostra os 5 campos; `/me` traz `cep` e `city`; PUT /me retorna ok e o GET seguinte mostra `cep` atualizado (13870-001).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeAuthController.js
git commit -m "feat(loja): cadastro grava endereço; /me retorna cep+city; updateMe grava cep+city"
```

---

### Task 2: Cadastro — bloco de endereço + ViaCEP

**Files:**
- Modify: `src/public/loja/cadastro.html`

**Interfaces:**
- Consome: `POST /api/loja/auth/register` (agora exige `cep, address, houseNumber, neighborhood, city`).

- [ ] **Step 1: Adicionar os campos de endereço no form**

No `#cadastro-form`, inserir ANTES do bloco de senha (após o campo de telefone, ~linha 118) um bloco de endereço com os 5 campos, cada um no padrão `.field` + `.field-error` usado pelos demais. IDs exatos (o controller espera esses nomes no body): `#cep`, `#address`, `#houseNumber`, `#neighborhood`, `#city`. Sugestão de markup (siga o estilo dos campos existentes):
```html
          <div class="field">
            <label for="cep">CEP</label>
            <input type="tel" id="cep" name="cep" placeholder="00000-000" maxlength="9" inputmode="numeric" autocomplete="postal-code" required>
            <div class="field-error" id="cep-err">Informe um CEP válido.</div>
            <span id="cep-hint" style="font-size:.81rem;color:var(--text-soft);display:none"></span>
          </div>
          <div class="field">
            <label for="address">Endereço</label>
            <input type="text" id="address" name="address" placeholder="Rua, Av., Travessa…" autocomplete="address-line1" required>
            <div class="field-error" id="address-err">Informe o endereço.</div>
          </div>
          <div class="field">
            <label for="houseNumber">Número</label>
            <input type="text" id="houseNumber" name="houseNumber" placeholder="Ex.: 123" autocomplete="address-line2" required>
            <div class="field-error" id="houseNumber-err">Informe o número.</div>
          </div>
          <div class="field">
            <label for="neighborhood">Bairro</label>
            <input type="text" id="neighborhood" name="neighborhood" placeholder="Seu bairro" autocomplete="address-level3" required>
            <div class="field-error" id="neighborhood-err">Informe o bairro.</div>
          </div>
          <div class="field">
            <label for="city">Cidade</label>
            <input type="text" id="city" name="city" placeholder="Sua cidade" autocomplete="address-level2" required>
            <div class="field-error" id="city-err">Informe a cidade.</div>
          </div>
```

- [ ] **Step 2: ViaCEP — preencher rua/bairro/cidade ao digitar o CEP**

No `<script>` do cadastro, adicionar (perto das outras refs de input) o handler de CEP, replicando o padrão simples do checkout. Ao ter 8 dígitos, busca no ViaCEP e preenche `#address`, `#neighborhood`, `#city`; foca em `#houseNumber`:
```js
      var inpCep = document.getElementById('cep');
      async function buscarCep(cepRaw) {
        var cep = String(cepRaw || '').replace(/\D/g, '');
        if (cep.length !== 8) return null;
        try {
          var r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
          if (!r.ok) return null;
          var d = await r.json();
          return d.erro ? null : d;
        } catch (e) { return null; }
      }
      async function preencherCep() {
        var digits = inpCep.value.replace(/\D/g, '');
        var hint = document.getElementById('cep-hint');
        if (digits.length !== 8) return;
        hint.style.display = 'block'; hint.textContent = 'Buscando CEP…';
        var d = await buscarCep(digits);
        if (d) {
          if (d.logradouro) document.getElementById('address').value = d.logradouro;
          if (d.bairro)     document.getElementById('neighborhood').value = d.bairro;
          if (d.localidade) document.getElementById('city').value = d.localidade;
          hint.style.display = 'none';
          document.getElementById('houseNumber').focus();
        } else {
          hint.textContent = 'CEP não encontrado — preencha manualmente.';
        }
      }
      inpCep.addEventListener('input', preencherCep);
      inpCep.addEventListener('blur', preencherCep);
```

- [ ] **Step 3: Validar no submit + incluir no body**

No handler de submit (`form.addEventListener('submit', ...)`, ~linha 286), após as validações existentes (`setErr(...)`), adicionar a leitura + validação dos novos campos e marcá-los como erro se vazios:
```js
        var cep = document.getElementById('cep').value.trim();
        var address = document.getElementById('address').value.trim();
        var houseNumber = document.getElementById('houseNumber').value.trim();
        var neighborhood = document.getElementById('neighborhood').value.trim();
        var city = document.getElementById('city').value.trim();
        hasErr = setErr('cep', 'cep-err', cep.replace(/\D/g,'').length !== 8) || hasErr;
        hasErr = setErr('address', 'address-err', !address) || hasErr;
        hasErr = setErr('houseNumber', 'houseNumber-err', !houseNumber) || hasErr;
        hasErr = setErr('neighborhood', 'neighborhood-err', !neighborhood) || hasErr;
        hasErr = setErr('city', 'city-err', !city) || hasErr;
```
E no corpo do POST (a linha `body: JSON.stringify({ name: name, ... consent: true })`), acrescentar os campos:
```js
            body: JSON.stringify({ name: name, email: email, cpf: cpf, birthdate: birthdate, phone: phone, password: senha, consent: true, cep: cep, address: address, houseNumber: houseNumber, neighborhood: neighborhood, city: city })
```

- [ ] **Step 4: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "cadastro 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/cadastro.html
node -e "const h=require('fs').readFileSync('src/public/loja/cadastro.html','utf8'); console.log('tem #cep:', /id=\"cep\"/.test(h), '| #city:', /id=\"city\"/.test(h), '| viacep:', h.includes('viacep.com.br'), '| body cep:', /cep:\s*cep/.test(h)); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('JS parse OK');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `#cep`/`#city` true; viacep true; `body cep` true; JS parse OK.

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/cadastro.html
git commit -m "feat(loja): cadastro pede endereço com busca de CEP (ViaCEP)"
```

---

### Task 3: Checkout — seletor "usar cadastro / outro endereço"

**Files:**
- Modify: `src/public/loja/checkout.html`

**Interfaces:**
- Consome: `GET /api/loja/auth/me` (agora com `cep`/`city`); `popularSelectBairros(cfg.bairros, preSel)`, `cidadeOk(c)`, `atualizarResumo()`, `handleCepLookup` já existentes.

- [ ] **Step 1: Adicionar o seletor (radio) no topo do bloco de endereço**

No `checkout.html`, logo após o título "Endereço de entrega" (`<h2 id="co-address-title">`, ~linha 117) e antes dos campos, inserir:
```html
            <div id="addr-source" class="field" role="radiogroup" aria-label="Endereço de entrega" style="margin-bottom:1rem">
              <label style="display:flex;gap:.5rem;align-items:center;font-weight:400;cursor:pointer;margin-bottom:.4rem">
                <input type="radio" name="addr-source" id="addr-cadastro" value="cadastro"> Usar meu endereço cadastrado
              </label>
              <label style="display:flex;gap:.5rem;align-items:center;font-weight:400;cursor:pointer">
                <input type="radio" name="addr-source" id="addr-outro" value="outro"> Entregar em outro endereço
              </label>
            </div>
```

- [ ] **Step 2: Lógica do seletor — preencher do cadastro × limpar**

No `<script>`, depois que `promiseMe` resolve (ele já lê `/me` e guarda os dados), implementar:
- Guardar o objeto `me` numa variável de escopo acessível (ex.: reaproveitar o retorno de `promiseMe`).
- Função `temEnderecoCadastro(me)` = `!!(me && me.cep && me.address && me.city)`.
- Função `usarCadastro(me)`: preenche `inpCep.value = me.cep`, `inpAddress.value = me.address`, `inpHouseNumber.value = me.house_number || ''`, `inpCity.value = me.city`; chama `popularSelectBairros(cfg.bairros, me.neighborhood || '')` (casa o bairro salvo com a zona, ou cai em "__outro__"); roda a validação de cidade (mesmo bloco do `handleCepLookup`: se `me.city` e `!cidadeOk(me.city)` → mostra bloqueio/`foraDeArea=true`/disabled; senão limpa e `foraDeArea=false`); chama `atualizarResumo()`.
- Função `usarOutro()`: limpa `inpCep`, `inpAddress`, `inpHouseNumber`, `inpCity` (`= ''`); reseta o select de bairro (`popularSelectBairros(cfg.bairros, '')`); `setCepHint('', '')`; `foraDeArea=false`; `atualizarResumo()`.
- Wire dos radios: `addr-cadastro` → `usarCadastro(me)`; `addr-outro` → `usarOutro()`.
- **Default (depende do cadastro):** quando `promiseMe` resolve, se `temEnderecoCadastro(me)` → marcar `#addr-cadastro` (`checked = true`) e chamar `usarCadastro(me)`; senão → marcar `#addr-outro`, desabilitar/ocultar a opção "usar cadastro" (`#addr-cadastro` `disabled = true` e atenuar o label) e chamar `usarOutro()` (ou simplesmente deixar os campos vazios).

Reaproveite o pré-preenchimento que já existe no `promiseMe` (linhas que setam `inpCep/inpAddress/inpHouseNumber/inpCity` a partir de `me.*`) — agora que `/me` traz `cep`/`city`, ele funciona; apenas mova/condicione esse preenchimento para acontecer via `usarCadastro` quando o radio "cadastro" estiver ativo, evitando preencher quando o cliente escolher "outro".

- [ ] **Step 3: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "checkout 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/checkout.html
node -e "const h=require('fs').readFileSync('src/public/loja/checkout.html','utf8'); console.log('tem radio addr-source:', /name=\"addr-source\"/.test(h), '| usarCadastro:', h.includes('usarCadastro'), '| usarOutro:', h.includes('usarOutro')); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('JS parse OK');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; radio/usarCadastro/usarOutro true; JS parse OK.

- [ ] **Step 4: Teste no navegador (manual)**

`npm run dev` → cadastrar um cliente com endereço em São João → checkout: vem em "usar cadastro" preenchido, bairro casa com a zona (frete certo) → trocar pra "outro endereço" (campos limpam, ViaCEP volta a agir) → cliente sem endereço cai em "outro endereço".

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(loja): checkout deixa escolher endereço do cadastro ou outro"
```
