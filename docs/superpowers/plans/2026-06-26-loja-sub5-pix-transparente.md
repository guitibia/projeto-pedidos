# Loja — Sub-projeto 5: PIX transparente (QR na loja) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar o QR Code do PIX dentro da própria loja (API de Pagamentos do Mercado Pago), com copia-e-cola e cronômetro, confirmando o pagamento via a infra idempotente do sub-4.

**Architecture:** No checkout, um seletor escolhe PIX ou Cartão. PIX → `POST /api/loja/pagamentos/pix` cria a intenção + um pagamento PIX na API do MP, guarda o QR e o `mp_payment_id` na intenção; uma página própria mostra o QR e faz polling do `statusPagamento` (sub-4), que confirma e cria o pedido. Cartão → fluxo do sub-4 (Checkout Pro), inalterado.

**Tech Stack:** Node/Express, MySQL, SDK `mercadopago` v3 (Payment API), HTML/CSS/JS vanilla.

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`.
- CommonJS; migrações no startup de `connection.js`, cada uma em `try { } catch (_) {}`.
- Rotas sob `customerAuth`; ownership por `req.customer.id` (intenção/QR alheios → 404).
- Reuso do sub-4 **sem alterar**: `payment_intents`, `confirmarIntencao`, `statusPagamento`, `webhook`, `criarPedidoPago`, `mapPaymentMethod` (já mapeia PIX → 'PIX'), e os helpers exportados de `storeOrderController` (`parseItems`, `buildLines`, `getClient`, `effectiveAddress`, `geocodeFee`, `hasAddress`).
- Servidor autoritativo no preço/total; pagador (email/nome/CPF) vem da conta, nunca do request.
- Sem `MP_ACCESS_TOKEN` → 503. Carrinho inválido/estoque/preço → 400 antes de gerar o PIX.
- PIX expira em **15 minutos**.
- SQL parametrizado; sem testes automatizados — verificar via curl + sandbox. Matar `node` antes de testar (`powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`), depois `node src/app.js &`, `sleep 3`.
- **Pré-requisito de conta MP (não é código):** o PIX transparente só responde com credenciais de um **usuário de teste vendedor** (sandbox) e, em produção, com **chave PIX ativada**. O token "de teste" da aplicação dá `Unauthorized use of live credentials` na API de Pagamentos. O build e os testes de validação/erro (503/400/ownership) não dependem disso; só o fluxo "gerar QR de verdade" depende.

---

### Task 1: Migração — colunas de PIX em payment_intents

**Files:**
- Modify: `src/database/connection.js`

- [ ] **Step 1: Migração**

Em `src/database/connection.js`, após o bloco de migrações do sub-4 (pagamento), adicionar:
```js
    // Migração: PIX transparente (sub-projeto 5)
    for (const sql of [
      'ALTER TABLE payment_intents ADD COLUMN pix_qr_code TEXT DEFAULT NULL',
      'ALTER TABLE payment_intents ADD COLUMN pix_qr_base64 MEDIUMTEXT DEFAULT NULL',
      'ALTER TABLE payment_intents ADD COLUMN pix_expiration DATETIME DEFAULT NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 2: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [c]=await db.query('SHOW COLUMNS FROM payment_intents');const f=c.map(x=>x.Field);console.log('pix cols:', ['pix_qr_code','pix_qr_base64','pix_expiration'].every(n=>f.includes(n)));process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: `pix cols: true`.

- [ ] **Step 3: Commit**

```bash
git add src/database/connection.js
git commit -m "feat(loja): colunas de PIX em payment_intents (sub-5)"
```

---

### Task 2: Serviço — criar pagamento PIX

**Files:**
- Modify: `src/services/mercadopago.js`

**Interfaces:**
- Produz: `criarPagamentoPix({ externalReference, total, descricao, payer, expiracaoMin })` → `{ id, status, qr_code, qr_code_base64, expiration }`. `payer = { email, first_name, last_name, cpf }`.

- [ ] **Step 1: Adicionar a função e exportá-la**

Em `src/services/mercadopago.js`, adicionar (e incluir no `module.exports`):
```js
// Formata uma data em ISO 8601 com offset local (ex.: 2026-06-26T12:30:00.000-03:00)
function isoComOffset(d) {
  const p = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? '+' : '-';
  const oh = p(Math.floor(Math.abs(off) / 60));
  const om = p(Math.abs(off) % 60);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
    '.000' + sinal + oh + ':' + om;
}

// Cria um pagamento PIX (transparente). Retorna o QR (copia-e-cola + imagem base64).
async function criarPagamentoPix({ externalReference, total, descricao, payer, expiracaoMin }) {
  const pay = new Payment(getClient());
  const exp = new Date(Date.now() + (expiracaoMin || 15) * 60 * 1000);
  const res = await pay.create({
    body: {
      transaction_amount: Number(total),
      description: descricao || 'Beleza Multi Marcas — Pedido',
      payment_method_id: 'pix',
      external_reference: externalReference,
      date_of_expiration: isoComOffset(exp),
      payer: {
        email: payer.email,
        first_name: payer.first_name || undefined,
        last_name: payer.last_name || undefined,
        identification: payer.cpf ? { type: 'CPF', number: String(payer.cpf).replace(/\D/g, '') } : undefined,
      },
    },
  });
  const td = (res.point_of_interaction && res.point_of_interaction.transaction_data) || {};
  return {
    id: res.id,
    status: res.status,
    qr_code: td.qr_code || null,            // copia-e-cola
    qr_code_base64: td.qr_code_base64 || null, // imagem PNG em base64
    expiration: exp,
  };
}
```
Garantir que `module.exports` inclua `criarPagamentoPix` junto das funções existentes (`isConfigured, criarPreferencia, buscarPagamento, buscarPagamentoPorReferencia, criarPagamentoPix`).

- [ ] **Step 2: Verificar (módulo carrega; função exportada)**

```bash
node -e "const mp=require('./src/services/mercadopago'); console.log('criarPagamentoPix:', typeof mp.criarPagamentoPix); console.log('exports:', Object.keys(mp).join(','))"
```
Esperado: `criarPagamentoPix: function`; exports listando as 5 funções. (A criação real do PIX depende das credenciais corretas do MP — validada no teste de navegador da Task 5.)

- [ ] **Step 3: Commit**

```bash
git add src/services/mercadopago.js
git commit -m "feat(loja): serviço criarPagamentoPix (PIX transparente)"
```

---

### Task 3: Controller + rotas — criarPix e pixDados

**Files:**
- Modify: `src/controllers/paymentController.js`, `src/routes/lojaPagamentos.js`

**Interfaces:**
- Consome: `mp.isConfigured`, `mp.criarPagamentoPix`; helpers de `storeOrderController`; `db`.
- Produz: `POST /api/loja/pagamentos/pix` → `{ external_reference }`; `GET /api/loja/pagamentos/:ref/pix` → `{ qr_code, qr_code_base64, total, expiration, status, orderId? }`.

- [ ] **Step 1: Adicionar `criarPix` e `pixDados` ao controller**

Em `src/controllers/paymentController.js`, adicionar antes do `module.exports`:
```js
// Divide "Nome Sobrenome" em first/last
function splitNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/);
  const first = partes.shift() || 'Cliente';
  const last = partes.join(' ') || first;
  return { first, last };
}

// POST /api/loja/pagamentos/pix — cria intenção + pagamento PIX, guarda o QR
async function criarPix(req, res) {
  if (!mp.isConfigured()) return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  const items = store.parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await store.getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });
    const [[conta]] = await db.query('SELECT email, cpf FROM clients WHERE id = ?', [req.customer.id]);

    const linhas = await store.buildLines(items);
    const indisponivel = linhas.find(l => !l.ok);
    if (indisponivel) return res.status(400).json({ error: indisponivel.reason || 'Item indisponível.', itemId: indisponivel.id });

    const subtotal = Number(linhas.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const addr = store.effectiveAddress(client, req.body);
    const addressChanged = store.hasAddress(req.body);
    const { fee, lat, lng } = await store.geocodeFee(addr, client, addressChanged);
    const total = Number((subtotal + fee).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Total inválido.' });

    if (addressChanged) {
      await db.query(
        'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=?, lat=?, lng=? WHERE id=?',
        [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, lat, lng, client.id]
      );
    }

    const snapshot = linhas.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
    const externalReference = crypto.randomBytes(32).toString('hex');

    const [ins] = await db.query(
      `INSERT INTO payment_intents
       (client_id, external_reference, items_json, address, house_number, neighborhood, cep, city, subtotal, delivery_fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [client.id, externalReference, JSON.stringify(snapshot), addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, subtotal, fee, total]
    );

    let pix;
    try {
      const nome = splitNome(client.name);
      pix = await mp.criarPagamentoPix({
        externalReference, total, descricao: 'Beleza Multi Marcas — Pedido',
        payer: { email: (conta && conta.email) || undefined, first_name: nome.first, last_name: nome.last, cpf: conta && conta.cpf },
        expiracaoMin: 15,
      });
    } catch (e) {
      console.error('Erro ao criar PIX no MP:', e);
      await db.query("UPDATE payment_intents SET status='falhou' WHERE id=?", [ins.insertId]);
      return res.status(502).json({ error: 'Não foi possível gerar o PIX. Tente novamente.' });
    }

    await db.query(
      'UPDATE payment_intents SET mp_payment_id=?, pix_qr_code=?, pix_qr_base64=?, pix_expiration=? WHERE id=?',
      [String(pix.id), pix.qr_code, pix.qr_code_base64, pix.expiration, ins.insertId]
    );

    return res.status(201).json({ external_reference: externalReference });
  } catch (e) {
    console.error('Erro ao criar pagamento PIX:', e);
    return res.status(500).json({ error: 'Erro ao iniciar o PIX.' });
  }
}

// GET /api/loja/pagamentos/:ref/pix — QR + status (ownership)
async function pixDados(req, res) {
  const ref = req.params.ref;
  if (!/^[a-f0-9]{64}$/.test(ref)) return res.status(400).json({ error: 'Referência inválida.' });
  try {
    const [[intent]] = await db.query(
      'SELECT client_id, total, status, order_id, pix_qr_code, pix_qr_base64, pix_expiration FROM payment_intents WHERE external_reference = ?',
      [ref]
    );
    if (!intent || intent.client_id !== req.customer.id) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    return res.json({
      qr_code: intent.pix_qr_code,
      qr_code_base64: intent.pix_qr_base64,
      total: intent.total,
      expiration: intent.pix_expiration,
      status: intent.status,
      orderId: intent.order_id || undefined,
    });
  } catch (e) {
    console.error('Erro ao buscar dados do PIX:', e);
    return res.status(500).json({ error: 'Erro ao buscar o PIX.' });
  }
}
```
Atualizar o `module.exports` para incluir os novos handlers: `{ criarPagamento, webhook, statusPagamento, criarPix, pixDados }`.

- [ ] **Step 2: Rotas**

Em `src/routes/lojaPagamentos.js`, adicionar (antes da rota `router.get('/:ref', ...)`, para clareza):
```js
router.post('/pix', customerAuth, c.criarPix);
router.get('/:ref/pix', customerAuth, c.pixDados);
```
(`POST /pix` e `GET /:ref/pix` não colidem com `POST /`, `POST /webhook`, `GET /:ref` — segmentos/métodos distintos.)

- [ ] **Step 3: Verificar (sem token → 503; sem JWT → 401; ownership/validação)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "POST /pix sem JWT -> 401: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pagamentos/pix -X POST -H "Content-Type: application/json" -d '{"items":[{"id":1,"qty":1}]}'
echo -n "GET /:ref/pix sem JWT -> 401: "; curl -s -m 8 -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pagamentos/0000000000000000000000000000000000000000000000000000000000000000/pix
echo -n "exports: "; node -e "console.log(Object.keys(require('./src/controllers/paymentController')).join(','))"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: ambos **401**; exports incluindo `criarPix,pixDados`. (O caminho 503 — sem `MP_ACCESS_TOKEN` — e o fluxo PIX real com token de vendedor de teste são validados na Task 5.)

Verificação direta do guard 503 (sem depender de login HTTP):
```bash
node -e "delete process.env.MP_ACCESS_TOKEN; require('dotenv').config(); delete process.env.MP_ACCESS_TOKEN; const pc=require('./src/controllers/paymentController'); function mkRes(){const r={code:0,body:null};r.status=c=>{r.code=c;return r};r.json=b=>{r.body=b;return r};return r;} (async()=>{const res=mkRes(); await pc.criarPix({customer:{id:1},body:{items:[{id:1,qty:1}]}},res); console.log('sem token ->', res.code, JSON.stringify(res.body)); process.exit(0);})();" 2>&1 | grep -vE "Banco de dados|geocod"
```
Esperado: `sem token -> 503 {"error":"Pagamento indisponível no momento."}`.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/paymentController.js src/routes/lojaPagamentos.js
git commit -m "feat(loja): criarPix + pixDados (PIX transparente, API)"
```

---

### Task 4: Checkout — seletor de método (PIX / Cartão)

**Files:**
- Modify: `src/public/loja/checkout.html`

**Interfaces:**
- Consome: `POST /api/loja/pagamentos/pix` (PIX) e `POST /api/loja/pagamentos` (cartão, já existente).

- [ ] **Step 1: Adicionar o seletor e ramificar o handler**

Em `src/public/loja/checkout.html`:
- Acima do botão "Finalizar e pagar", adicionar um **seletor de método** com dois itens, **PIX selecionado por padrão**:
```html
<div class="metodo-pagamento" role="radiogroup" aria-label="Forma de pagamento" style="margin:1rem 0;display:flex;gap:.6rem;flex-wrap:wrap">
  <label class="metodo-op" style="flex:1;min-width:140px;border:1px solid var(--border);border-radius:var(--radius);padding:.7rem .9rem;cursor:pointer;display:flex;align-items:center;gap:.5rem">
    <input type="radio" name="metodo" value="pix" checked>
    <span><i class="bi bi-qr-code"></i> PIX <small style="display:block;color:var(--text-soft);font-size:.74rem">QR na hora, aprovação imediata</small></span>
  </label>
  <label class="metodo-op" style="flex:1;min-width:140px;border:1px solid var(--border);border-radius:var(--radius);padding:.7rem .9rem;cursor:pointer;display:flex;align-items:center;gap:.5rem">
    <input type="radio" name="metodo" value="cartao">
    <span><i class="bi bi-credit-card"></i> Cartão <small style="display:block;color:var(--text-soft);font-size:.74rem">no Mercado Pago</small></span>
  </label>
</div>
```
- No handler de "Finalizar e pagar", ler o método escolhido e ramificar:
```js
var metodo = (document.querySelector('input[name="metodo"]:checked') || {}).value || 'pix';
var corpo = {
  items: Cart.getItems().map(function (i) { return { id: i.id, qty: i.qty }; }),
  cep: inpCep.value, address: inpAddress.value, houseNumber: inpHouseNumber.value,
  neighborhood: inpNeighborhood.value, city: inpCity.value
};
if (metodo === 'pix') {
  // PIX transparente: gera a intenção+PIX e vai para a tela do QR (mesma aba)
  btnFinalizar.disabled = true;
  try {
    var rp = await fetch('/api/loja/pagamentos/pix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + StoreAuth.getToken() },
      body: JSON.stringify(corpo)
    });
    if (rp.status === 401 || rp.status === 403) { StoreAuth.logout(); location.href = 'entrar.html'; return; }
    var dp = await rp.json().catch(function () { return {}; });
    if (rp.status === 201 && dp.external_reference) {
      window.location = 'pagamento-pix.html?external_reference=' + encodeURIComponent(dp.external_reference);
      return;
    }
    if (rp.status === 503) { showAlert('Pagamento indisponível no momento. Tente mais tarde.'); }
    else { showAlert(dp.error || 'Não foi possível gerar o PIX.'); }
    btnFinalizar.disabled = false;
  } catch (e) {
    showAlert('Falha de conexão ao gerar o PIX.');
    btnFinalizar.disabled = false;
  }
  return;
}
// metodo === 'cartao' → segue o fluxo de Checkout Pro existente (abre o MP em nova aba)
```
Manter **todo** o fluxo de cartão atual (Checkout Pro em nova aba + `pagamento-retorno.html`) para o ramo `cartao`. Não duplicar a lógica do cartão — só envolvê-la num `if (metodo === 'cartao')` ou deixá-la como o caminho após o `return` do PIX.

- [ ] **Step 2: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "checkout 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/checkout.html
node -e "const h=require('fs').readFileSync('src/public/loja/checkout.html','utf8'); console.log('tem seletor metodo:', h.includes('name=\"metodo\"')); console.log('chama /pagamentos/pix:', h.includes('/api/loja/pagamentos/pix')); console.log('vai p/ pagamento-pix:', h.includes('pagamento-pix.html?external_reference')); console.log('mantem cartao (checkout pro):', h.includes('/api/loja/pagamentos') && h.includes('init_point')); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK');" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `tem seletor metodo: true`; `chama /pagamentos/pix: true`; `vai p/ pagamento-pix: true`; `mantem cartao: true`; `parse OK`.

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(loja): seletor de método no checkout (PIX na loja / Cartão no MP)"
```

---

### Task 5: Página do PIX (QR + copia-e-cola + cronômetro + polling)

**Files:**
- Create: `src/public/loja/pagamento-pix.html`

**Interfaces:**
- Consome: `GET /api/loja/pagamentos/:ref/pix` (QR + status); `GET /api/loja/pagamentos/:ref` (`statusPagamento`, polling).

- [ ] **Step 1: Criar `pagamento-pix.html`**

Moldura padrão da loja (head com `/loja/loja.css`; header/footer copiados de `index.html`; fim do body `/loja/cart.js`, `/loja/loja.js`, `/loja/account.js`, depois o script; sem cookie banner hardcoded). Script (`'use strict'` IIFE):
- Guard: `!StoreAuth.isLoggedIn()` → `location.replace('entrar.html?next=/loja/meus-pedidos.html')` + return.
- Lê `external_reference` de `?external_reference=` (valida `/^[a-f0-9]{64}$/`); inválido → "Pagamento não encontrado" + link Meus pedidos.
- `GET /api/loja/pagamentos/:ref/pix` (header Bearer):
  - 401/403 → `StoreAuth.logout()` + `entrar.html`.
  - Renderiza: título "Pague com PIX", a **imagem do QR** `'<img alt="QR Code PIX" src="data:image/png;base64,' + esc(qr_code_base64) + '">'`, o **valor** (`fmtBRL(total)`), um campo somente-leitura com o **copia-e-cola** (`qr_code`) + botão **"Copiar código"** (usa `navigator.clipboard.writeText`, com fallback `document.execCommand('copy')`; feedback "Copiado!"), e um **cronômetro** até `expiration` (mm:ss).
  - Se `status === 'pago'` (intenção já confirmada) → `Cart.clear()` + `location.replace('pedido-confirmado.html?id=' + orderId)`.
- **Polling** de `GET /api/loja/pagamentos/:ref` (a cada ~4s): `pago` → `Cart.clear()` + `pedido-confirmado.html?id=`; `falhou` → "PIX expirado ou não aprovado" + botão "Voltar ao carrinho" (`carrinho.html`); `pendente` → continua.
- **Cronômetro:** ao zerar, faz uma última checagem de status; se não pago, mostra "PIX expirado" + voltar ao carrinho e para o polling.
- Escapar dinâmicos com `esc()` em `innerHTML`; `qr_code` vai num `value`/`textContent` (não precisa de esc no value).

- [ ] **Step 2: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "pagamento-pix 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/pagamento-pix.html
node -e "const h=require('fs').readFileSync('src/public/loja/pagamento-pix.html','utf8'); console.log('busca QR (/:ref/pix):', h.includes('/pix')); console.log('usa API pagamentos:', h.includes('/api/loja/pagamentos/')); console.log('copiar codigo:', h.toLowerCase().includes('clipboard') || h.includes('execCommand')); console.log('data:image/png;base64:', h.includes('data:image/png;base64')); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK');" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `busca QR: true`; `copiar codigo: true`; `data:image/png;base64: true`; `parse OK`.

- [ ] **Step 3: Teste de ponta a ponta no sandbox (manual — requer credenciais de PIX de teste do MP)**

Com um `MP_ACCESS_TOKEN` que tenha PIX habilitado (usuário de teste vendedor) e `node src/app.js` rodando: logar → checkout → escolher **PIX** → "Finalizar e pagar" → cair em `pagamento-pix.html` com o **QR + copia-e-cola + cronômetro**. Aprovar o PIX de teste pela simulação do MP → a página confirma → redireciona para a confirmação; conferir no banco `payment_intents.status='pago'`, um `orders` com `payment_method='PIX'`, `payment_status='pago'`, estoque baixado uma vez; e o selo **Pago** no painel. (Encerrar o node ao terminar.)

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/pagamento-pix.html
git commit -m "feat(loja): página do PIX (QR, copia-e-cola, cronômetro, confirmação)"
```
