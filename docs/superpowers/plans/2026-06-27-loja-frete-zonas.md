# Loja — Frete por bairro/zona + entrega só na cidade — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o frete por distância (geocoding impreciso) por frete por bairro/zona configurável no painel, restringir entrega a uma cidade, e zerar o frete das vendas presenciais do painel.

**Architecture:** Tabelas `delivery_zones` (bairro→valor) e `store_settings` (cidade + frete padrão); `utils/delivery.js` calcula o frete pelo bairro. O fluxo da loja (resumo/pagamento) passa a usar `freteDoBairro(bairro)` + guarda de cidade. Painel tem uma página para gerenciar as zonas; o checkout vira um dropdown de bairros.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla, ViaCEP.

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`.
- CommonJS; migrações no startup de `connection.js`, cada uma em `try { } catch (_) {}`.
- Servidor autoritativo: o frete é SEMPRE recalculado no servidor pelo bairro (não confia em valor do cliente); a cidade é validada no servidor.
- Endpoints admin (`/api/delivery-zones`) sob `auth` (JWT admin). A config da loja (`GET /api/loja/entrega/config`) é pública (leitura).
- Bairro casado por nome **normalizado** (minúsculo, sem acento, trim). `cidade_entrega` padrão "São João da Boa Vista"; `frete_padrao` padrão 15.00.
- `utils/geo.js` deixa de ser usado (loja e painel) — ao final fica obsoleto.
- SQL parametrizado; sem testes automatizados — curl + navegador. Matar `node` antes de testar (`powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`), depois `node src/app.js &`, `sleep 3`.

---

### Task 1: Migrações + utils/delivery.js

**Files:**
- Modify: `src/database/connection.js`
- Create: `src/utils/delivery.js`

**Interfaces:**
- Produz: `normalizar(s)`, `getSetting(key, def)`, `getCidadeEntrega()`, `getFretePadrao()`, `cidadeAtende(cidade)`, `freteDoBairro(bairro)`.

- [ ] **Step 1: Migrações**

Em `src/database/connection.js`, após a última migração existente (favoritos), adicionar:
```js
    // Migração: frete por zona + settings da loja
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS delivery_zones (id INT AUTO_INCREMENT PRIMARY KEY, bairro VARCHAR(120) NOT NULL, fee DECIMAL(6,2) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, UNIQUE KEY uq_bairro (bairro))',
      'CREATE TABLE IF NOT EXISTS store_settings (skey VARCHAR(60) PRIMARY KEY, svalue VARCHAR(255))',
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('cidade_entrega', 'São João da Boa Vista')",
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('frete_padrao', '15.00')",
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 2: Criar `src/utils/delivery.js`**

```js
const db = require('../database/connection');

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
async function getSetting(key, def) {
  try {
    const [[row]] = await db.query('SELECT svalue FROM store_settings WHERE skey = ?', [key]);
    return row && row.svalue != null ? row.svalue : def;
  } catch (_) { return def; }
}
async function getCidadeEntrega() { return getSetting('cidade_entrega', 'São João da Boa Vista'); }
async function getFretePadrao() { return Number(await getSetting('frete_padrao', '15')) || 0; }
async function cidadeAtende(cidade) {
  return normalizar(cidade) === normalizar(await getCidadeEntrega());
}
async function freteDoBairro(bairro) {
  const n = normalizar(bairro);
  if (n) {
    const [zonas] = await db.query('SELECT bairro, fee FROM delivery_zones WHERE active = 1');
    for (const z of zonas) { if (normalizar(z.bairro) === n) return Number(z.fee) || 0; }
  }
  return getFretePadrao();
}
module.exports = { normalizar, getSetting, getCidadeEntrega, getFretePadrao, cidadeAtende, freteDoBairro };
```

- [ ] **Step 3: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [t1]=await db.query(\"SHOW TABLES LIKE 'delivery_zones'\");const [t2]=await db.query(\"SHOW TABLES LIKE 'store_settings'\");const [[c]]=await db.query(\"SELECT svalue FROM store_settings WHERE skey='cidade_entrega'\");console.log('tabelas:', t1.length===1, t2.length===1, '| cidade seed:', c&&c.svalue);process.exit(0)})()" 2>/dev/null
node -e "require('dotenv').config();const d=require('./src/utils/delivery');(async()=>{console.log('normalizar:', d.normalizar('  Vila Valentín ')); console.log('cidade:', await d.getCidadeEntrega(), '| padrao:', await d.getFretePadrao()); console.log('atende SJBV:', await d.cidadeAtende('sao joao da boa vista')); console.log('frete bairro inexistente=padrao:', await d.freteDoBairro('Xyz'));process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: tabelas `true true`, cidade seed "São João da Boa Vista"; `normalizar` → `vila valentin`; cidade/padrão lidos; `atende SJBV: true`; frete de bairro inexistente = 15.

- [ ] **Step 4: Commit**

```bash
git add src/database/connection.js src/utils/delivery.js
git commit -m "feat(loja): migrações delivery_zones/store_settings + utils/delivery (frete por bairro)"
```

---

### Task 2: API admin — CRUD de zonas + settings

**Files:**
- Create: `src/controllers/deliveryZonesController.js`, `src/routes/deliveryZones.js`
- Modify: `src/app.js`

**Interfaces:**
- Consome: `auth` (admin), `utils/delivery` (`getCidadeEntrega`, `getFretePadrao`).
- Produz: `GET/POST /api/delivery-zones`, `PUT /api/delivery-zones/settings`, `PUT/DELETE /api/delivery-zones/:id`.

- [ ] **Step 1: Criar `src/controllers/deliveryZonesController.js`**

```js
const db = require('../database/connection');
const { getCidadeEntrega, getFretePadrao } = require('../utils/delivery');

async function listar(req, res) {
  try {
    const [zones] = await db.query('SELECT id, bairro, fee, active FROM delivery_zones ORDER BY bairro');
    return res.json({ zones, cidade: await getCidadeEntrega(), fretePadrao: await getFretePadrao() });
  } catch (e) { console.error('Erro ao listar zonas:', e); return res.status(500).json({ error: 'Erro ao listar zonas.' }); }
}
async function criar(req, res) {
  const bairro = String(req.body.bairro || '').trim();
  const fee = Number(req.body.fee);
  if (!bairro || !(fee >= 0)) return res.status(400).json({ error: 'Bairro e valor válidos são obrigatórios.' });
  try {
    await db.query('INSERT INTO delivery_zones (bairro, fee) VALUES (?, ?)', [bairro, fee]);
    return res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esse bairro já está cadastrado.' });
    console.error('Erro ao criar zona:', e); return res.status(500).json({ error: 'Erro ao criar zona.' });
  }
}
async function atualizar(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const bairro = String(req.body.bairro || '').trim();
  const fee = Number(req.body.fee);
  const active = req.body.active ? 1 : 0;
  if (!bairro || !(fee >= 0)) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    await db.query('UPDATE delivery_zones SET bairro=?, fee=?, active=? WHERE id=?', [bairro, fee, active, id]);
    return res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esse bairro já está cadastrado.' });
    console.error('Erro ao atualizar zona:', e); return res.status(500).json({ error: 'Erro ao atualizar zona.' });
  }
}
async function remover(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try { await db.query('DELETE FROM delivery_zones WHERE id=?', [id]); return res.json({ ok: true }); }
  catch (e) { console.error('Erro ao remover zona:', e); return res.status(500).json({ error: 'Erro ao remover zona.' }); }
}
async function salvarSettings(req, res) {
  const cidade = String(req.body.cidade || '').trim();
  const fretePadrao = Number(req.body.fretePadrao);
  if (!cidade || !(fretePadrao >= 0)) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    await db.query('INSERT INTO store_settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['cidade_entrega', cidade]);
    await db.query('INSERT INTO store_settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['frete_padrao', String(fretePadrao)]);
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar settings:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { listar, criar, atualizar, remover, salvarSettings };
```

- [ ] **Step 2: Criar `src/routes/deliveryZones.js`**

```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/deliveryZonesController');

router.get('/', c.listar);
router.post('/', c.criar);
router.put('/settings', c.salvarSettings); // antes de /:id para não ser sombreado
router.put('/:id', c.atualizar);
router.delete('/:id', c.remover);

module.exports = router;
```

- [ ] **Step 3: Montar no app.js**

Em `src/app.js`, junto às outras rotas admin (após `franchiseDiscountRoutes`), adicionar:
```js
const deliveryZonesRoutes = require('./routes/deliveryZones');
app.use('/api/delivery-zones', apiLimiter, auth, deliveryZonesRoutes);
```

- [ ] **Step 4: Verificar (sem login admin → 401/403; fluxo com token admin)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "sem auth -> 401/403: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/delivery-zones
# login admin (ajuste user/senha conforme o seed do projeto; tenta admin/admin)
JWT=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
echo "jwt len: ${#JWT}"
echo -n "criar zona Centro R5 -> 201: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/delivery-zones -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"bairro":"Centro","fee":5}'
echo -n "duplicado -> 409: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/delivery-zones -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"bairro":"Centro","fee":5}'
echo -n "settings -> ok: "; curl -s -m 8 http://localhost:3000/api/delivery-zones/settings -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"cidade":"São João da Boa Vista","fretePadrao":15}'
echo ""; echo "listar:"; curl -s -m 8 http://localhost:3000/api/delivery-zones -H "Authorization: Bearer $JWT"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: sem auth → 401 ou 403; criar → 201; duplicado → 409; settings ok; listar mostra a zona Centro + cidade + fretePadrao. (Se o login admin tiver outro usuário/senha, ajuste; o objetivo é exercitar o CRUD.)

- [ ] **Step 5: Commit**

```bash
git add src/controllers/deliveryZonesController.js src/routes/deliveryZones.js src/app.js
git commit -m "feat(painel): API de zonas de entrega (CRUD + settings)"
```

---

### Task 3: Frete da loja por bairro + guarda de cidade + painel presencial frete 0

**Files:**
- Modify: `src/controllers/storeController.js`, `src/routes/loja.js` (config pública), `src/controllers/storeOrderController.js`, `src/controllers/paymentController.js`, `src/controllers/orderController.js`

**Interfaces:**
- Consome: `utils/delivery` (`freteDoBairro`, `cidadeAtende`, `getCidadeEntrega`).
- Produz: `GET /api/loja/entrega/config` → `{ cidade, fretePadrao, bairros:[{bairro,fee}] }`.

- [ ] **Step 1: Endpoint público de config da entrega**

Em `src/controllers/storeController.js`, adicionar e exportar:
```js
const { getCidadeEntrega, getFretePadrao } = require('../utils/delivery');
async function entregaConfig(req, res) {
  try {
    const [bairros] = await db.query('SELECT bairro, fee FROM delivery_zones WHERE active = 1 ORDER BY bairro');
    return res.json({ cidade: await getCidadeEntrega(), fretePadrao: await getFretePadrao(), bairros });
  } catch (e) { console.error('Erro entregaConfig:', e); return res.status(500).json({ error: 'Erro.' }); }
}
```
(garanta que `db` já está importado no arquivo; inclua `entregaConfig` no `module.exports`.)
Em `src/routes/loja.js`, registrar a rota pública:
```js
const { listProdutos, getProduto, listFranquias, entregaConfig } = require('../controllers/storeController');
router.get('/entrega/config', entregaConfig);
```

- [ ] **Step 2: Trocar o frete no `resumo` (storeOrderController)**

Em `src/controllers/storeOrderController.js`:
- No topo, trocar a linha `const { deliveryFee, geocodeClient } = require('../utils/geo');` por:
  ```js
  const { freteDoBairro, cidadeAtende, getCidadeEntrega } = require('../utils/delivery');
  ```
- Em `resumo`, substituir:
  ```js
  const addr = effectiveAddress(client, req.body);
  const { fee } = await geocodeFee(addr, client, hasAddress(req.body));
  ```
  por:
  ```js
  const addr = effectiveAddress(client, req.body);
  if (addr.city && !(await cidadeAtende(addr.city))) {
    return res.status(400).json({ error: 'Entregamos apenas em ' + (await getCidadeEntrega()) + '.', foraDeArea: true });
  }
  const fee = await freteDoBairro(addr.neighborhood);
  ```
- Remover a função `geocodeFee` (não é mais usada) e tirá-la do `module.exports`. Manter `effectiveAddress`/`hasAddress`/`parseItems`/`buildLines`/`getClient`/`criarPedidoPago`.

- [ ] **Step 3: Trocar o frete em `criarPagamento` e `criarPix` (paymentController)**

Em `src/controllers/paymentController.js`:
- No topo adicionar: `const { freteDoBairro, cidadeAtende, getCidadeEntrega } = require('../utils/delivery');`
- Em `criarPagamento` e `criarPix`, substituir o trecho:
  ```js
  const addr = store.effectiveAddress(client, req.body);
  const addressChanged = store.hasAddress(req.body);
  const { fee, lat, lng } = await store.geocodeFee(addr, client, addressChanged);
  ```
  por:
  ```js
  const addr = store.effectiveAddress(client, req.body);
  const addressChanged = store.hasAddress(req.body);
  if (addr.city && !(await cidadeAtende(addr.city))) {
    return res.status(400).json({ error: 'Entregamos apenas em ' + (await getCidadeEntrega()) + '.', foraDeArea: true });
  }
  const fee = await freteDoBairro(addr.neighborhood);
  ```
- E onde persiste o endereço do cliente, remover `lat`/`lng` (não há mais geocoding). Trocar:
  ```js
  await db.query('UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=?, lat=?, lng=? WHERE id=?',
    [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, lat, lng, client.id]);
  ```
  por:
  ```js
  await db.query('UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=? WHERE id=?',
    [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, client.id]);
  ```
  (faça nas duas funções — `criarPagamento` e `criarPix`.)

- [ ] **Step 4: Painel `createOrder` → frete 0 (presencial)**

Em `src/controllers/orderController.js`:
- Remover o `require` do geo (`const { deliveryFee, geocodeClient } = require('../utils/geo');`).
- Substituir todo o bloco que calcula `fee` (o `let fee = 0; try { ... geocodeClient ... deliveryFee ... }`) por simplesmente `const fee = 0;` (venda presencial não tem frete). Manter o resto (o INSERT já usa `fee`).

- [ ] **Step 5: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo "=== config pública ==="; curl -s -m 8 http://localhost:3000/api/loja/entrega/config
echo ""
# garante a zona Centro=5 (via delivery_zones direto, caso a T2 não tenha persistido no teste)
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"INSERT IGNORE INTO delivery_zones (bairro,fee) VALUES ('Centro',5)\");process.exit(0)})()" 2>/dev/null
# login cliente p/ testar resumo
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Frete Teste","email":"frete@teste.com","cpf":"52998224725","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}' >/dev/null
TK=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='frete@teste.com'\");console.log(c?c.t:'');process.exit(0)})()" 2>/dev/null)
[ -n "$TK" ] && curl -s "http://localhost:3000/api/loja/auth/verify?token=$TK" >/dev/null
JWT=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"frete@teste.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id FROM products WHERE estoque>0 ORDER BY id LIMIT 1');console.log(p.id);process.exit(0)})()" 2>/dev/null)
echo "=== resumo Centro (frete 5) ==="; curl -s -m 10 http://localhost:3000/api/loja/checkout/resumo -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}],\"city\":\"São João da Boa Vista\",\"neighborhood\":\"Centro\"}" | grep -o '"deliveryFee":[0-9.]*'
echo "=== resumo bairro fora da lista (frete padrão 15) ==="; curl -s -m 10 http://localhost:3000/api/loja/checkout/resumo -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}],\"city\":\"São João da Boa Vista\",\"neighborhood\":\"Bairro Inexistente\"}" | grep -o '"deliveryFee":[0-9.]*'
echo "=== resumo outra cidade -> 400 foraDeArea ==="; curl -s -m 10 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/checkout/resumo -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}],\"city\":\"Campinas\",\"neighborhood\":\"Centro\"}"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: config pública com `cidade`/`fretePadrao`/`bairros`; resumo Centro → `"deliveryFee":5`; bairro fora da lista → `"deliveryFee":15`; outra cidade → **400**.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/storeController.js src/routes/loja.js src/controllers/storeOrderController.js src/controllers/paymentController.js src/controllers/orderController.js
git commit -m "feat(loja): frete por bairro + guarda de cidade; painel presencial frete 0"
```

---

### Task 4: Painel — página "Zonas de entrega"

**Files:**
- Create: `src/public/entrega.html`
- Modify: `src/public/painel.html` (link no menu)

**Interfaces:**
- Consome: `GET/POST/PUT/DELETE /api/delivery-zones`, `PUT /api/delivery-zones/settings`.

- [ ] **Step 1: Criar `src/public/entrega.html`**

Copiar a moldura/estilo e a autenticação de uma página admin existente (ex.: `estoque.html` ou `clientes.html`): mesmo `<head>`, menu lateral, e o helper de auth que elas usam (`Auth.apiFetch`/JWT do admin em localStorage — replicar exatamente o padrão; sem login redireciona para `/login.html`). Conteúdo da página:
- **Configuração geral** (um form no topo): campo **Cidade de entrega** e **Frete padrão (R$)**, botão "Salvar" → `PUT /api/delivery-zones/settings` `{cidade, fretePadrao}`.
- **Zonas (bairros)**: um form "adicionar" (bairro + valor) → `POST /api/delivery-zones`; e uma **tabela** dos bairros (de `GET /api/delivery-zones`) com valor editável, um toggle ativo/inativo e botão remover → `PUT /api/delivery-zones/:id` e `DELETE /api/delivery-zones/:id`.
- Recarrega a lista após cada ação; mostra erros (ex.: 409 "bairro já cadastrado"). Escapar valores dinâmicos no innerHTML.

- [ ] **Step 2: Link no menu do painel**

Em `src/public/painel.html`, no menu lateral (junto aos `nav-link`), adicionar — por ex. após "Estoque":
```html
    <a class="nav-link" href="/entrega.html"><i class="bi bi-truck"></i> Entrega</a>
```
(Se as outras páginas admin tiverem o mesmo menu lateral replicado, adicione o link nelas também, ou pelo menos no `painel.html`.)

- [ ] **Step 3: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "entrega.html 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/entrega.html
echo -n "usa /api/delivery-zones: "; curl -s http://localhost:3000/entrega.html | grep -c "delivery-zones"
echo -n "painel tem link Entrega: "; curl -s http://localhost:3000/painel.html | grep -c "entrega.html"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; usa /api/delivery-zones ≥1; painel com link ≥1.

- [ ] **Step 4: Commit**

```bash
git add src/public/entrega.html src/public/painel.html
git commit -m "feat(painel): página de Zonas de entrega (bairros + frete padrão + cidade)"
```

---

### Task 5: Checkout — cidade pelo CEP + bairro em dropdown

**Files:**
- Modify: `src/public/loja/checkout.html`

**Interfaces:**
- Consome: `GET /api/loja/entrega/config`, ViaCEP, `POST /api/loja/checkout/resumo` (já devolve `deliveryFee` pelo bairro).

- [ ] **Step 1: Bairro vira `<select>` + carregar config**

Em `src/public/loja/checkout.html`:
- Trocar o `<input id="neighborhood">` por um `<select id="neighborhood">` (mesmo id, pra reaproveitar `inpNeighborhood`). Estrutura:
  ```html
  <label for="neighborhood">Bairro</label>
  <select id="neighborhood" name="neighborhood">
    <option value="">Selecione o bairro…</option>
  </select>
  ```
- No script, ao carregar a página, `fetch('/api/loja/entrega/config')` e guardar `cfg` (cidade, fretePadrao, bairros). Popular o select: uma `<option>` por bairro (value = nome do bairro) + uma `<option value="__outro__">Meu bairro não está na lista</option>`. Guardar `cfg.cidade` para a checagem do CEP.

- [ ] **Step 2: CEP valida a cidade**

No handler do ViaCEP (onde hoje preenche `inpCity` com `d.localidade`): após preencher, comparar a cidade. Adicionar uma função `cidadeOk(c)` que normaliza (minúsculo/sem acento) e compara com `cfg.cidade`. Se **não** atende:
- mostrar no `#cep-hint` (classe `error`) algo como `"Desculpe, entregamos apenas em " + cfg.cidade + "."`;
- **desabilitar** o botão Finalizar (`btnFinalizar.disabled = true`) e marcar um flag `foraDeArea = true`.
Se atende: limpar o aviso, `foraDeArea = false`, e reabilitar conforme as demais validações.

- [ ] **Step 3: Resumo recalcula pelo bairro**

- No `change` do `<select id="neighborhood">`, chamar `atualizarResumo()` (a função que faz `POST /checkout/resumo`). Para a opção `__outro__`, enviar `neighborhood` vazio (`''`) no corpo do resumo/pagamento (o servidor devolve o `frete_padrao` para bairro vazio/não cadastrado). Ou seja, ao montar o corpo, se o select estiver em `__outro__`, mandar `neighborhood: ''`.
- O `resumo` do servidor já devolve `deliveryFee` correto pelo bairro — a tela só exibe o que vier. Se o resumo retornar `400 foraDeArea`, mostrar o aviso de cidade e bloquear Finalizar.
- No "Finalizar e pagar" (PIX e cartão), o corpo já inclui `neighborhood` e `city`; manter, só respeitando o `__outro__` → `''`. Se `foraDeArea` estiver true, não enviar (já bloqueado).

- [ ] **Step 4: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "checkout 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/checkout.html
node -e "const h=require('fs').readFileSync('src/public/loja/checkout.html','utf8'); console.log('bairro é select:', /<select[^>]*id=\"neighborhood\"/.test(h)); console.log('carrega entrega/config:', h.includes('/api/loja/entrega/config')); console.log('checa cidade/foraDeArea:', h.includes('foraDeArea')); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('script parse OK');" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; bairro é select `true`; carrega config `true`; foraDeArea `true`; parse OK.

- [ ] **Step 5: Teste no navegador (manual)**

`npm run dev` → painel `/entrega.html`: cadastrar bairros + frete padrão + cidade. Loja → logar → checkout: CEP de São João → escolher um bairro cadastrado (frete do bairro) → "não está na lista" (frete padrão) → CEP de outra cidade (bloqueia com aviso). Criar um pedido pelo painel → conferir `delivery_fee = 0`.

- [ ] **Step 6: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(loja): checkout com cidade pelo CEP + bairro em dropdown (frete por zona)"
```
