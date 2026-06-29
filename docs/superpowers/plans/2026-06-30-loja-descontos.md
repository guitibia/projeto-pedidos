# Loja — Descontos: global + por produto (#3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir um desconto global na loja (ativável no painel) e um atalho de desconto por % ou R$ por produto, com o preço sempre calculado de forma autoritativa no servidor.

**Architecture:** Uma única função `precoEfetivo` (em `utils/pricing.js`) é a fonte da verdade do preço; é usada pela exibição (API de produtos) e pelo checkout/pedido (`storeOrderController`). O global fica em `store_settings`; o por-produto continua no `promotion_price`. Admin configura o global num card do painel; o editor de produto ganha um atalho %/R$ que escreve no `promotion_price`.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla.

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Servidor autoritativo no preço.** O cliente envia só `{id, qty}`; o preço cobrado vem da `precoEfetivo` no servidor.
- **Regra de empilhamento (sem empilhar):** produto com `promotion_price > 0` mantém a promo própria (global ignorado); o global só se aplica a produtos sem promo própria.
- Global é **%** (0–99,99), validado no servidor; guardado em `store_settings` (`desconto_global_ativo` '0'/'1', `desconto_global_percent`).
- Exibição e cobrança usam a MESMA `precoEfetivo` → preço mostrado = preço cobrado. Arredondar 2 casas (`round2`).
- `franchise_discounts` (mexe em `cost`) fica intacto — não tocar.
- Migrações idempotentes no `connection.js` (`try { } catch (_) {}`). SQL parametrizado. Sem suíte automatizada — node assert + curl + navegador (matar `node` após: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`; DB `Teste`→`db_pedidos_teste`).

---

### Task 1: Núcleo de preço — `utils/pricing.js` + aplicar na exibição e no checkout

**Files:**
- Create: `src/utils/pricing.js`
- Modify: `src/database/connection.js` (seeds), `src/controllers/storeOrderController.js` (buildLines), `src/controllers/storeController.js` (listProdutos/getProduto + endpoint), `src/routes/loja.js` (rota pública)

**Interfaces:**
- Produz: `getDescontoGlobal()` → `{ ativo:boolean, percent:number }`; `precoEfetivo(saleValue, promotionPrice, global)` → number; `round2(n)` → number. Endpoint público `GET /api/loja/desconto-global` → `{ ativo, percent }`.

- [ ] **Step 1: Criar `src/utils/pricing.js`**

```js
const db = require('../database/connection');

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

async function getDescontoGlobal() {
  try {
    const [rows] = await db.query(
      "SELECT skey, svalue FROM store_settings WHERE skey IN ('desconto_global_ativo','desconto_global_percent')"
    );
    const m = {};
    rows.forEach(function (r) { m[r.skey] = r.svalue; });
    return { ativo: m.desconto_global_ativo === '1', percent: Number(m.desconto_global_percent) || 0 };
  } catch (_) { return { ativo: false, percent: 0 }; }
}

// Regra: promo própria vence; senão global (se ativo) nos sem promo; senão sale_value.
function precoEfetivo(saleValue, promotionPrice, global) {
  const base = Number(saleValue) || 0;
  if (promotionPrice != null && Number(promotionPrice) > 0) return Number(promotionPrice);
  if (global && global.ativo && global.percent > 0) return round2(base * (1 - global.percent / 100));
  return base;
}

module.exports = { getDescontoGlobal, precoEfetivo, round2 };
```

- [ ] **Step 2: Teste unitário (node assert) da `precoEfetivo`**

Criar `scratch-pricing-test.js` na raiz (temporário, NÃO commitar):
```js
const assert = require('assert');
const { precoEfetivo, round2 } = require('./src/utils/pricing');
const G = { ativo: true, percent: 10 };
const OFF = { ativo: false, percent: 10 };
assert.strictEqual(precoEfetivo(50, null, OFF), 50, 'sem nada');
assert.strictEqual(precoEfetivo(50, 40, G), 40, 'promo vence o global');
assert.strictEqual(precoEfetivo(50, null, G), 45, 'global nos sem promo');
assert.strictEqual(precoEfetivo(50, 0, G), 45, 'promo 0 = sem promo');
assert.strictEqual(precoEfetivo(50, null, { ativo: true, percent: 0 }), 50, 'global 0%');
assert.strictEqual(round2(33.333), 33.33, 'round2');
console.log('OK precoEfetivo');
```
Rodar: `node scratch-pricing-test.js` → espera `OK precoEfetivo`. Depois apagar o arquivo (`rm scratch-pricing-test.js`).

- [ ] **Step 3: Seeds do global em `connection.js`**

Após a última migração existente, adicionar:
```js
    for (const sql of [
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('desconto_global_ativo', '0')",
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('desconto_global_percent', '0')",
    ]) { try { await conn.query(sql); } catch (_) {} }
```
(`store_settings` já existe da migração do frete.)

- [ ] **Step 4: Aplicar no `storeOrderController.buildLines` (autoritativo)**

No topo de `src/controllers/storeOrderController.js`, adicionar:
```js
const { precoEfetivo, getDescontoGlobal } = require('../utils/pricing');
```
Em `buildLines(items)`, buscar o global UMA vez antes do loop e usar `precoEfetivo`:
```js
async function buildLines(items) {
  const lines = [];
  const global = await getDescontoGlobal();
  for (const it of items) {
    const [[p]] = await db.query(
      'SELECT id, name, image, franchise, estoque, sale_value, promotion_price, cost FROM products WHERE id = ?',
      [it.id]
    );
    if (!p) { lines.push({ id: it.id, qty: it.qty, unitPrice: 0, lineTotal: 0, ok: false, reason: 'Produto indisponível.' }); continue; }
    const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
    const unitPrice = precoEfetivo(p.sale_value, p.promotion_price, global);
    const enough = p.estoque == null ? true : Number(p.estoque) >= it.qty;
    const ok = enough && unitPrice > 0;
    lines.push({
      id: p.id, name: p.name, image: p.image, franchise: p.franchise,
      unitPrice, qty: it.qty, lineTotal: Number((unitPrice * it.qty).toFixed(2)),
      costPrice: promo ? p.cost : null,
      ok, reason: !enough ? 'Estoque insuficiente.' : (unitPrice <= 0 ? 'Preço indisponível.' : undefined),
    });
  }
  return lines;
}
```
(Só muda a linha do `unitPrice` e a busca do `global`; o resto fica igual.)

- [ ] **Step 5: Aplicar na exibição (`storeController`) + endpoint público**

No topo de `src/controllers/storeController.js` adicionar:
```js
const { getDescontoGlobal, precoEfetivo } = require('../utils/pricing');
```
Em `listProdutos`, depois de obter `rows`, mapear para refletir o global na exibição:
```js
    const [rows] = await db.query(sql, params);
    const global = await getDescontoGlobal();
    const out = rows.map(function (p) {
      var temPromo = p.promotion_price != null && Number(p.promotion_price) > 0;
      if (global.ativo && global.percent > 0 && !temPromo) {
        return Object.assign({}, p, { promotion_price: precoEfetivo(p.sale_value, null, global) });
      }
      return p;
    });
    return res.json(out);
```
Em `getProduto`, aplicar o mesmo ao produto principal `p` (antes de montar a resposta), e também aos `relacionados`:
```js
    const global = await getDescontoGlobal();
    function comGlobal(prod) {
      var temPromo = prod.promotion_price != null && Number(prod.promotion_price) > 0;
      if (global.ativo && global.percent > 0 && !temPromo) {
        return Object.assign({}, prod, { promotion_price: precoEfetivo(prod.sale_value, null, global) });
      }
      return prod;
    }
    // ... aplicar: p = comGlobal(p); relacionados = relacionados.map(comGlobal);
    // a resposta vira: return res.json(Object.assign({}, comGlobal(p), { relacionados: relacionados.map(comGlobal) }));
```
Adicionar e exportar a função do endpoint público:
```js
async function descontoGlobal(req, res) {
  var g = await getDescontoGlobal();
  return res.json({ ativo: g.ativo, percent: g.percent });
}
```
(incluir `descontoGlobal` no `module.exports`.)
Em `src/routes/loja.js`, registrar:
```js
router.get('/desconto-global', descontoGlobal);
```
(e adicionar `descontoGlobal` à desestruturação do import do storeController.)

- [ ] **Step 6: Verificar**

```bash
node scratch-pricing-test.js   # se ainda não apagou; senão recrie só pra rodar
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo "=== desconto-global público (default inativo) ==="; curl -s http://localhost:3000/api/loja/desconto-global
echo ""
# ativa 10% direto no banco e confere a API de produtos + resumo
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"INSERT INTO store_settings (skey,svalue) VALUES ('desconto_global_ativo','1') ON DUPLICATE KEY UPDATE svalue='1'\");await db.query(\"INSERT INTO store_settings (skey,svalue) VALUES ('desconto_global_percent','10') ON DUPLICATE KEY UPDATE svalue='10'\");const [[p]]=await db.query('SELECT id,sale_value,promotion_price FROM products WHERE (promotion_price IS NULL OR promotion_price=0) AND sale_value>0 ORDER BY id LIMIT 1');console.log('produto sem promo id',p.id,'sale',p.sale_value);process.exit(0)})()" 2>/dev/null
echo "=== /api/loja/produtos: produto sem promo agora tem promotion_price calculado ==="; curl -s "http://localhost:3000/api/loja/produtos" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);const semPromoCalc=a.filter(p=>p.promotion_price!=null).slice(0,2);console.log('exemplos com promo (calculada ou própria):',JSON.stringify(semPromoCalc.map(p=>({id:p.id,sale:p.sale_value,promo:p.promotion_price}))));})"
# desativa de volta
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"UPDATE store_settings SET svalue='0' WHERE skey='desconto_global_ativo'\");process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
rm -f scratch-pricing-test.js
```
Esperado: `OK precoEfetivo`; desconto-global default `{"ativo":false,"percent":0}`; com 10% ativo, produtos sem promo mostram `promotion_price = sale*0.9`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/pricing.js src/database/connection.js src/controllers/storeOrderController.js src/controllers/storeController.js src/routes/loja.js
git commit -m "feat(loja): núcleo de preço com desconto global (precoEfetivo) aplicado na exibição e no checkout"
```

---

### Task 2: Admin — API de desconto global + card no painel

**Files:**
- Create: `src/controllers/descontosController.js`, `src/routes/descontos.js`
- Modify: `src/app.js`, `src/public/painel.html`

**Interfaces:**
- Consome: `auth`, `apiLimiter`, `getDescontoGlobal` (utils/pricing), `store_settings`.
- Produz: `GET /api/descontos` → `{ ativo, percent }`; `PUT /api/descontos` `{ ativo, percent }`.

- [ ] **Step 1: Criar `src/controllers/descontosController.js`**

```js
const db = require('../database/connection');
const { getDescontoGlobal } = require('../utils/pricing');

async function get(req, res) {
  const g = await getDescontoGlobal();
  return res.json({ ativo: g.ativo, percent: g.percent });
}

async function put(req, res) {
  const ativo = req.body.ativo ? '1' : '0';
  const percent = Number(req.body.percent);
  if (isNaN(percent) || percent < 0 || percent >= 100) {
    return res.status(400).json({ error: 'Percentual deve ser entre 0 e 99,99.' });
  }
  try {
    await db.query('INSERT INTO store_settings (skey,svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['desconto_global_ativo', ativo]);
    await db.query('INSERT INTO store_settings (skey,svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['desconto_global_percent', String(percent)]);
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar desconto:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { get, put };
```

- [ ] **Step 2: Criar `src/routes/descontos.js`**

```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/descontosController');
router.get('/', c.get);
router.put('/', c.put);
module.exports = router;
```

- [ ] **Step 3: Montar no `app.js`**

Junto às outras rotas admin (perto de `/api/delivery-zones`), adicionar:
```js
const descontosRoutes = require('./routes/descontos');
app.use('/api/descontos', apiLimiter, auth, descontosRoutes);
```

- [ ] **Step 4: Card "Desconto global" no `painel.html`**

Adicionar um card no conteúdo do dashboard (`painel.html`), no padrão visual dos cards existentes, com: um checkbox **Ativar desconto global**, um input **%** (`step=0.01 min=0 max=99.99`), e um botão **Salvar**. No script (que já usa `Auth.apiFetch`), ao carregar a página, `GET /api/descontos` preenche o checkbox + %; o botão Salvar faz `PUT /api/descontos` com `{ ativo: checkbox.checked, percent: Number(input.value) }`, mostrando sucesso/erro (Swal ou alerta no padrão da página). Escapar valores; usar os ids `#desc-global-ativo`, `#desc-global-percent`, `#desc-global-save`, `#desc-global-msg`.

- [ ] **Step 5: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")
echo -n "GET sem auth -> 401/403: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/descontos
echo -n "PUT % inválido (150) -> 400: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/descontos -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"ativo":true,"percent":150}'
echo -n "PUT válido (ativo 12%) -> ok: "; curl -s http://localhost:3000/api/descontos -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"ativo":true,"percent":12}'
echo ""; echo "GET reflete:"; curl -s http://localhost:3000/api/descontos -H "Authorization: Bearer $JWT"
echo ""; echo "público reflete:"; curl -s http://localhost:3000/api/loja/desconto-global
# desativa de volta
curl -s http://localhost:3000/api/descontos -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"ativo":false,"percent":0}' >/dev/null
echo -n "painel card: "; curl -s http://localhost:3000/painel.html | grep -c "desc-global"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: sem auth → 401/403; % inválido → 400; PUT válido ok; GET/público mostram ativo true 12; card no painel ≥ 1.

- [ ] **Step 6: Commit**

```bash
git add src/controllers/descontosController.js src/routes/descontos.js src/app.js src/public/painel.html
git commit -m "feat(painel): desconto global (API /api/descontos + card no dashboard)"
```

---

### Task 3: Editor de produto (atalho %/R$) + faixa na home

**Files:**
- Modify: `src/public/list-products.html`, `src/public/loja/index.html`

**Interfaces:**
- Consome: `Auth.apiFetch('/api/products/:id')` (PUT já aceita `promotion_price`); `GET /api/loja/desconto-global`.

- [ ] **Step 1: Expor preço promocional + atalho %/R$ no modal de editar produto**

No modal `#editModal` de `list-products.html`, antes dos botões, adicionar (após o campo Franquia):
```html
          <div class="mb-2">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--text-muted)">Preço de venda (R$)</label>
            <input type="text" class="form-control" id="edit-sale-ro" readonly>
          </div>
          <div class="mb-2">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--text-muted)">Desconto (atalho)</label>
            <div class="input-group">
              <input type="number" step="0.01" min="0" class="form-control" id="edit-desc-valor" placeholder="0">
              <select class="form-select" id="edit-desc-tipo" style="max-width:90px"><option value="pct">%</option><option value="brl">R$</option></select>
              <button type="button" class="btn btn-outline-secondary" id="edit-desc-aplicar">Aplicar</button>
            </div>
          </div>
          <div class="mb-3">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--text-muted)">Preço promocional (R$) — deixe em branco para remover</label>
            <input type="number" step="0.01" min="0" class="form-control" id="edit-promo">
          </div>
```

- [ ] **Step 2: Popular e calcular no script**

Em `openEdit(id)`, preencher os novos campos a partir de `p` (que tem `sale_value` e `promotion_price`):
```js
    document.getElementById('edit-sale-ro').value = (p.sale_value != null ? Number(p.sale_value).toFixed(2) : '');
    document.getElementById('edit-promo').value = (p.promotion_price != null && Number(p.promotion_price) > 0) ? Number(p.promotion_price).toFixed(2) : '';
    document.getElementById('edit-desc-valor').value = '';
```
Adicionar o handler do botão "Aplicar" (uma vez, junto dos outros listeners):
```js
  document.getElementById('edit-desc-aplicar').addEventListener('click', function () {
    var sale = parseFloat(document.getElementById('edit-sale-ro').value);
    var v = parseFloat(document.getElementById('edit-desc-valor').value);
    if (!(sale > 0) || isNaN(v) || v < 0) return;
    var tipo = document.getElementById('edit-desc-tipo').value;
    var promo = tipo === 'pct' ? sale * (1 - v / 100) : sale - v;
    promo = Math.max(0, Math.round((promo + Number.EPSILON) * 100) / 100);
    document.getElementById('edit-promo').value = promo.toFixed(2);
  });
```
No `submit`, trocar o `promotion_price` do payload (que hoje vem do `dataset`) pelo valor do input `#edit-promo`:
```js
      promotion_price: (function () { var x = document.getElementById('edit-promo').value.trim(); return x !== '' ? parseFloat(x) : null; })()
```
(remover a leitura `const rawPromo = form.dataset.promotionPrice;` e o uso do dataset.)

- [ ] **Step 3: Faixa na home**

Em `src/public/loja/index.html`, adicionar um elemento de faixa (escondido por padrão) no topo do `<main>`:
```html
      <div id="desconto-faixa" style="display:none; background:var(--accent); color:#fff; text-align:center; padding:.6rem 1rem; font-weight:600; border-radius:var(--radius); margin:1rem 0;"></div>
```
No `<script>`, buscar e exibir:
```js
      fetch('/api/loja/desconto-global').then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ativo && d.percent > 0) {
          var el = document.getElementById('desconto-faixa');
          if (el) { el.textContent = '🏷️ ' + d.percent + '% OFF em toda a loja!'; el.style.display = 'block'; }
        }
      }).catch(function () {});
```

- [ ] **Step 4: Verificar (estático + e2e leve)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "list-products 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/list-products.html
node -e "const h=require('fs').readFileSync('src/public/list-products.html','utf8'); console.log('tem edit-promo:', h.includes('edit-promo'), '| atalho:', h.includes('edit-desc-aplicar'), '| sem dataset.promotionPrice no submit:', !/dataset\.promotionPrice/.test(h.split('addEventListener(\\'submit')[1]||'')); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
echo -n "home tem faixa: "; curl -s http://localhost:3000/loja/index.html | grep -c "desconto-faixa"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; edit-promo/atalho true; JS parse OK; home faixa ≥ 1.

- [ ] **Step 5: Teste no navegador (manual)**

`npm run dev` → painel: ativar desconto global 10% → loja mostra faixa + preços com 10% nos produtos sem promo; produto com promo própria fica igual. Editar um produto: usar o atalho % (ex.: 20%) → o preço promocional calcula; salvar; conferir na loja. Finalizar um pedido confere que o total cobra o preço com desconto (resumo).

- [ ] **Step 6: Commit**

```bash
git add src/public/list-products.html src/public/loja/index.html
git commit -m "feat(loja): atalho de desconto %/R$ no produto + faixa de desconto global na home"
```
