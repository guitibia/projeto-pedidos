# Loja — Sub-projeto 4: Pagamento (Mercado Pago) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cobrança real via Mercado Pago / Checkout Pro (PIX + cartão); o pedido só é criado após o pagamento aprovado, confirmado por webhook e/ou consulta de status, de forma idempotente.

**Architecture:** "Finalizar e pagar" grava uma intenção de pagamento (snapshot de itens/endereço/valores) e cria uma preferência no MP, redirecionando o cliente. Webhook e página de retorno chamam a mesma rotina `confirmarPagamento`, que consulta a API do MP e — se aprovado — cria o pedido em transação (`criarPedidoPago`), idempotente. Reuso do modelo `orders`/`order_products` do sub-3.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), SDK oficial `mercadopago` (v2), `utils/geo`, HTML/CSS/JS vanilla.

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`.
- CommonJS; migrações no startup de `connection.js`, cada uma em `try { } catch (_) {}`.
- Rotas de pagamento sob `customerAuth` (JWT `type:'customer'`), **exceto** o webhook (público, mas valida consultando a API do MP — nunca confia no corpo).
- **Pedido só nasce após pagamento aprovado.** O valor cobrado é a fonte de verdade: o pedido usa os preços do **snapshot** da intenção (não re-precifica), `total_cost = intent.total`.
- Idempotência: `payment_intents.external_reference` é `UNIQUE`; `confirmarPagamento` checa `order_id`/`status='pago'` sob `SELECT ... FOR UPDATE` antes de criar o pedido. Webhook duplicado nunca cria 2 pedidos.
- Pedido da loja pago: `payment_status='pago'`, `payment_method` real (`'PIX'` ou `'CARTÃO DE CRÉDITO'`), `origin='loja'`, status de entrega `Pendente`, `mp_payment_id` gravado.
- "Pago sem estoque": cria o pedido assim mesmo (deixa estoque negativo) e marca a movimentação com "ATENÇÃO: estoque insuficiente"; nunca perde a venda paga.
- Sem `MP_ACCESS_TOKEN` no `.env` → `POST /api/loja/pagamentos` responde `503` (nada é processado de mentira). `.env` é gitignored — não commitar.
- SQL parametrizado; sem testes automatizados — verificar via curl + sandbox do MP. Matar `node` antes de testar (`powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`), depois `node src/app.js &`, `sleep 3`.
- Ownership: intenções e pedidos sempre filtrados por `req.customer.id`; intenção/pedido alheio → 404.

---

### Task 1: Migrações + instalar mercadopago + .env

**Files:**
- Modify: `src/database/connection.js`, `.env`
- (npm) `package.json`/`package-lock.json`

- [ ] **Step 1: Instalar o SDK**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
npm install mercadopago
```

- [ ] **Step 2: Migrações**

Em `src/database/connection.js`, após o bloco de migrações do checkout (sub-3), adicionar:
```js
    // Migração: pagamento (sub-projeto 4)
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS payment_intents (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          external_reference VARCHAR(64) NOT NULL UNIQUE,
          items_json JSON NOT NULL,
          address VARCHAR(255), house_number VARCHAR(30), neighborhood VARCHAR(120),
          cep VARCHAR(8), city VARCHAR(120),
          subtotal DECIMAL(10,2) NOT NULL,
          delivery_fee DECIMAL(6,2) NOT NULL DEFAULT 0,
          total DECIMAL(10,2) NOT NULL,
          mp_preference_id VARCHAR(64),
          mp_payment_id VARCHAR(64),
          status VARCHAR(20) NOT NULL DEFAULT 'pendente',
          order_id INT DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
    } catch (_) {}
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT NULL",
      "ALTER TABLE orders ADD COLUMN mp_payment_id VARCHAR(64) DEFAULT NULL",
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 3: .env**

Adicionar ao `.env` (comentado — modo teste até você gerar o token):
```
# Mercado Pago — Access Token (use o de TESTE primeiro, depois o de produção).
# Sem este token, o checkout de pagamento responde 503 (nada é cobrado).
# MP_ACCESS_TOKEN=TEST-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [t]=await db.query(\"SHOW TABLES LIKE 'payment_intents'\");console.log('payment_intents:', t.length===1);const [o]=await db.query('SHOW COLUMNS FROM orders');console.log('payment_status/mp_payment_id:', !!o.find(c=>c.Field==='payment_status'), !!o.find(c=>c.Field==='mp_payment_id'));console.log('mercadopago:', !!require('mercadopago'));process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: `payment_intents: true`, `payment_status/mp_payment_id: true true`, `mercadopago: true`.

- [ ] **Step 5: Commit**

```bash
git add src/database/connection.js package.json package-lock.json
git commit -m "feat(loja): migrações de pagamento (payment_intents, orders.payment_status) + mercadopago"
```

---

### Task 2: Serviço Mercado Pago

**Files:**
- Create: `src/services/mercadopago.js`

**Interfaces:**
- Produz: `isConfigured()` → bool; `criarPreferencia({ externalReference, total, descricao })` → `{ id, init_point }`; `buscarPagamento(paymentId)` → `{ status, transaction_amount, external_reference, payment_type_id }`.

- [ ] **Step 1: Criar `src/services/mercadopago.js`**

```js
const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

function isConfigured() {
  return !!process.env.MP_ACCESS_TOKEN;
}

function getClient() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

function appUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

// Cria a preferência de Checkout Pro (PIX + cartão habilitados por padrão no MP).
async function criarPreferencia({ externalReference, total, descricao }) {
  const pref = new Preference(getClient());
  const base = appUrl();
  const res = await pref.create({
    body: {
      items: [{
        id: externalReference,
        title: descricao || 'Beleza Multi Marcas — Pedido',
        quantity: 1,
        unit_price: Number(total),
        currency_id: 'BRL',
      }],
      external_reference: externalReference,
      back_urls: {
        success: base + '/loja/pagamento-retorno.html',
        failure: base + '/loja/pagamento-retorno.html',
        pending: base + '/loja/pagamento-retorno.html',
      },
      auto_return: 'approved',
      notification_url: base + '/api/loja/pagamentos/webhook',
    },
  });
  return { id: res.id, init_point: res.init_point };
}

// Consulta um pagamento pelo id (fonte de verdade — não confiar no webhook).
async function buscarPagamento(paymentId) {
  const pay = new Payment(getClient());
  const res = await pay.get({ id: paymentId });
  return {
    status: res.status,                        // approved | rejected | cancelled | pending | in_process
    transaction_amount: res.transaction_amount,
    external_reference: res.external_reference,
    payment_type_id: res.payment_type_id,      // credit_card | debit_card | bank_transfer | account_money | ...
  };
}

module.exports = { isConfigured, criarPreferencia, buscarPagamento };
```

- [ ] **Step 2: Verificar (sem token: módulo carrega; isConfigured false)**

```bash
node -e "const mp=require('./src/services/mercadopago'); console.log('isConfigured (sem token):', mp.isConfigured()); console.log('exports:', Object.keys(mp).join(','))"
```
Esperado: `isConfigured (sem token): false`; `exports: isConfigured,criarPreferencia,buscarPagamento`.

- [ ] **Step 3: Commit**

```bash
git add src/services/mercadopago.js
git commit -m "feat(loja): serviço Mercado Pago (preferência + consulta de pagamento)"
```

---

### Task 3: Função compartilhada `criarPedidoPago` + remover POST /pedidos

**Files:**
- Modify: `src/controllers/storeOrderController.js`, `src/routes/lojaPedidos.js`

**Interfaces:**
- Consome: helpers internos existentes (`parseItems`, `buildLines`, `getClient`, `effectiveAddress`, `geocodeFee`, `hasAddress`).
- Produz (exports adicionados): `criarPedidoPago(conn, { clientId, lines, fee, total, paymentMethod, mpPaymentId })` → `Promise<orderId>`; e reexporta `parseItems, buildLines, getClient, effectiveAddress, geocodeFee, hasAddress` para o paymentController. Remove `criarPedido`.

- [ ] **Step 1: Remover o handler `criarPedido`**

Em `src/controllers/storeOrderController.js`, apagar a função `async function criarPedido(req, res) { ... }` inteira (linhas ~112–182).

- [ ] **Step 2: Adicionar `criarPedidoPago`**

Adicionar (antes do `module.exports`):
```js
const PAYMENT_METHODS_VALIDOS = ['PIX', 'CARTÃO DE CRÉDITO'];

// Cria o pedido JÁ PAGO em transação, a partir do snapshot de linhas da intenção.
// lines: [{ id, qty, unitPrice, costPrice }]. Não re-precifica (o valor pago é a verdade).
// "Pago sem estoque": baixa mesmo assim (pode ficar negativo) e marca a movimentação.
async function criarPedidoPago(conn, { clientId, lines, fee, total, paymentMethod, mpPaymentId }) {
  if (!PAYMENT_METHODS_VALIDOS.includes(paymentMethod)) paymentMethod = 'PIX';
  const rows = [];
  for (const ln of lines) {
    const [[p]] = await conn.query('SELECT id, name, estoque FROM products WHERE id = ? FOR UPDATE', [ln.id]);
    if (!p) throw new Error(`Produto ID "${ln.id}" não existe mais.`);
    const short = p.estoque != null && Number(p.estoque) < ln.qty;
    rows.push({ id: ln.id, qty: ln.qty, unitPrice: Number(ln.unitPrice), costPrice: ln.costPrice != null ? ln.costPrice : null, short });
  }

  const [orderResult] = await conn.query(
    "INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee, origin, payment_status, mp_payment_id) " +
    "VALUES (?, ?, NULL, ?, NULL, ?, 'loja', 'pago', ?)",
    [clientId, paymentMethod, Number(total), Number(fee), mpPaymentId || null]
  );
  const orderId = orderResult.insertId;

  const opInsert = rows.map(r => [orderId, r.id, r.unitPrice, r.qty, r.costPrice]);
  await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES ?', [opInsert]);

  for (const r of rows) {
    await conn.query('UPDATE products SET estoque = estoque - ? WHERE id = ?', [r.qty, r.id]);
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
      [r.id, 'Saída', r.qty, `Pedido #${orderId} (loja)` + (r.short ? ' — ATENÇÃO: estoque insuficiente' : '')]
    );
  }
  return orderId;
}
```
Atualizar o `module.exports` para:
```js
module.exports = {
  resumo, listarPedidos, detalhePedido, criarPedidoPago,
  parseItems, buildLines, getClient, effectiveAddress, geocodeFee, hasAddress,
};
```
(Os nomes `parseItems`, `buildLines`, `getClient`, `effectiveAddress`, `geocodeFee`, `hasAddress` são as funções internas já existentes no arquivo — apenas exporte-as.)

- [ ] **Step 3: Remover a rota POST /pedidos**

Em `src/routes/lojaPedidos.js`, remover a linha `router.post('/pedidos', customerAuth, c.criarPedido);`. As rotas restantes: `POST /checkout/resumo`, `GET /pedidos`, `GET /pedidos/:id`.

- [ ] **Step 4: Verificar (carrega sem erro; criarPedido sumiu; criarPedidoPago existe)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "const c=require('./src/controllers/storeOrderController'); console.log('criarPedido removido:', c.criarPedido===undefined); console.log('criarPedidoPago:', typeof c.criarPedidoPago); console.log('helpers:', typeof c.parseItems, typeof c.buildLines, typeof c.getClient)"
echo -n "POST /pedidos agora 404: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pedidos -X POST -H "Content-Type: application/json" -d '{"items":[]}'
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: `criarPedido removido: true`; `criarPedidoPago: function`; helpers `function function function`; POST /pedidos → 404 (rota removida; o GET /pedidos continua existindo).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeOrderController.js src/routes/lojaPedidos.js
git commit -m "refactor(loja): criarPedidoPago compartilhado + remove criação direta de pedido"
```

---

### Task 4: Criar intenção + preferência (`POST /api/loja/pagamentos`)

**Files:**
- Create: `src/controllers/paymentController.js`, `src/routes/lojaPagamentos.js`
- Modify: `src/app.js`

**Interfaces:**
- Consome: `services/mercadopago` (`isConfigured`, `criarPreferencia`); `storeOrderController` (`parseItems`, `buildLines`, `getClient`, `effectiveAddress`, `geocodeFee`, `hasAddress`); `customerAuth`.
- Produz: `POST /api/loja/pagamentos` → `{ init_point, external_reference }`. (Confirmação/status/webhook na Task 5, mesmo controller/router.)

- [ ] **Step 1: Criar `src/controllers/paymentController.js`**

```js
const crypto = require('crypto');
const db = require('../database/connection');
const mp = require('../services/mercadopago');
const store = require('../controllers/storeOrderController');

// POST /api/loja/pagamentos — valida carrinho, grava intenção, cria preferência MP
async function criarPagamento(req, res) {
  if (!mp.isConfigured()) return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  const items = store.parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await store.getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });

    const linhas = await store.buildLines(items);
    const indisponivel = linhas.find(l => !l.ok);
    if (indisponivel) return res.status(400).json({ error: indisponivel.reason || 'Item indisponível.', itemId: indisponivel.id });

    const subtotal = Number(linhas.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const addr = store.effectiveAddress(client, req.body);
    const addressChanged = store.hasAddress(req.body);
    const { fee, lat, lng } = await store.geocodeFee(addr, client, addressChanged);
    const total = Number((subtotal + fee).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Total inválido.' });

    // Persiste o endereço no cadastro (mesma decisão do sub-3) se foi editado
    if (addressChanged) {
      await db.query(
        'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=?, lat=?, lng=? WHERE id=?',
        [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, lat, lng, client.id]
      );
    }

    // Snapshot de linhas (preço travado = o que será cobrado)
    const snapshot = linhas.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
    const externalReference = crypto.randomBytes(32).toString('hex');

    const [ins] = await db.query(
      `INSERT INTO payment_intents
       (client_id, external_reference, items_json, address, house_number, neighborhood, cep, city, subtotal, delivery_fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [client.id, externalReference, JSON.stringify(snapshot), addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, subtotal, fee, total]
    );

    let pref;
    try {
      pref = await mp.criarPreferencia({ externalReference, total, descricao: 'Beleza Multi Marcas — Pedido' });
    } catch (e) {
      console.error('Erro ao criar preferência MP:', e);
      await db.query("UPDATE payment_intents SET status='falhou' WHERE id=?", [ins.insertId]);
      return res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' });
    }
    await db.query('UPDATE payment_intents SET mp_preference_id=? WHERE id=?', [pref.id, ins.insertId]);

    return res.status(201).json({ init_point: pref.init_point, external_reference: externalReference });
  } catch (e) {
    console.error('Erro ao criar pagamento:', e);
    return res.status(500).json({ error: 'Erro ao iniciar o pagamento.' });
  }
}

module.exports = { criarPagamento };
```

Nota: o `snapshot` acima usa `l.costPrice`, que passa a existir após o Step 2 (ajuste em `buildLines`). Faça o Step 2 junto com este — os dois compõem o mesmo deliverable.

- [ ] **Step 2: Garantir `costPrice` em `buildLines`**

Em `src/controllers/storeOrderController.js`, na função `buildLines`, garantir que o `SELECT` inclua `cost` e que cada linha retorne `costPrice`:
```js
    const [[p]] = await db.query(
      'SELECT id, name, image, franchise, estoque, sale_value, promotion_price, cost FROM products WHERE id = ?',
      [it.id]
    );
    ...
    const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
    const unitPrice = Number(promo ? p.promotion_price : p.sale_value) || 0;
    ...
    lines.push({
      id: p.id, name: p.name, image: p.image, franchise: p.franchise,
      unitPrice, qty: it.qty, lineTotal: Number((unitPrice * it.qty).toFixed(2)),
      costPrice: promo ? p.cost : null,
      ok, reason: ...
    });
```
(Mantenha o resto de `buildLines` igual; isso só adiciona `cost` ao SELECT e `costPrice` ao objeto. O `resumo` ignora `costPrice`, sem impacto.)

- [ ] **Step 3: Criar `src/routes/lojaPagamentos.js`**

```js
const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/paymentController');

router.post('/', customerAuth, c.criarPagamento);
// /webhook e /:ref entram na Task 5

module.exports = router;
```

- [ ] **Step 4: Montar no app.js**

Em `src/app.js`, após o mount de `lojaPedidosRoutes`, adicionar:
```js
const lojaPagamentosRoutes = require('./routes/lojaPagamentos');
app.use('/api/loja/pagamentos', apiLimiter, lojaPagamentosRoutes);
```

- [ ] **Step 5: Verificar (sem token → 503; com token fake o SDK tentaria — ficamos no 503)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
# cria + verifica + loga um cliente de teste
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Pay","email":"pay@teste.com","cpf":"52998224725","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}' >/dev/null
TK=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='pay@teste.com'\");console.log(c.t);process.exit(0)})()" 2>/dev/null)
curl -s "http://localhost:3000/api/loja/auth/verify?token=$TK" >/dev/null
JWT=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"pay@teste.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id FROM products WHERE estoque > 0 ORDER BY id LIMIT 1');console.log(p.id);process.exit(0)})()" 2>/dev/null)
echo -n "sem MP_ACCESS_TOKEN -> 503: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pagamentos -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}]}"
echo -n "sem token de cliente -> 401: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pagamentos -X POST -H "Content-Type: application/json" -d "{\"items\":[{\"id\":$PID,\"qty\":1}]}"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: sem MP_ACCESS_TOKEN → **503**; sem token de cliente → **401**. (Com um token de teste real do MP no `.env`, retornaria 201 + `init_point` — isso é validado no teste de navegador da Task 7.)

- [ ] **Step 6: Commit**

```bash
git add src/controllers/paymentController.js src/routes/lojaPagamentos.js src/controllers/storeOrderController.js src/app.js
git commit -m "feat(loja): criar intenção de pagamento + preferência Mercado Pago"
```

---

### Task 5: Confirmar pagamento + webhook + status (idempotente, ownership)

**Files:**
- Modify: `src/controllers/paymentController.js`, `src/routes/lojaPagamentos.js`

**Interfaces:**
- Consome: `services/mercadopago` (`buscarPagamento`), `storeOrderController.criarPedidoPago`.
- Produz: `POST /api/loja/pagamentos/webhook` (público), `GET /api/loja/pagamentos/:ref` (customerAuth). Função interna `confirmarPorExternalReference(ref)` e `confirmarPorPaymentId(paymentId)`.

- [ ] **Step 1: Adicionar a rotina de confirmação + handlers**

Em `src/controllers/paymentController.js`, adicionar antes do `module.exports`:
```js
function mapPaymentMethod(paymentTypeId) {
  if (paymentTypeId === 'credit_card' || paymentTypeId === 'debit_card') return 'CARTÃO DE CRÉDITO';
  return 'PIX'; // bank_transfer | account_money | pix | outros
}

// Núcleo idempotente: dado um pagamento aprovado, cria o pedido uma única vez.
// Retorna { status, orderId? }.
async function confirmarIntencao(intent, pagamento) {
  // pagamento: { status, transaction_amount, payment_type_id }
  if (intent.status === 'pago' && intent.order_id) return { status: 'pago', orderId: intent.order_id };

  if (pagamento.status === 'rejected' || pagamento.status === 'cancelled') {
    await db.query("UPDATE payment_intents SET status='falhou', mp_payment_id=? WHERE id=?", [String(intent.mp_payment_id || ''), intent.id]);
    return { status: 'falhou' };
  }
  if (pagamento.status !== 'approved') return { status: 'pendente' };

  // valor cobrado deve bater com o total da intenção
  if (Math.abs(Number(pagamento.transaction_amount) - Number(intent.total)) > 0.01) {
    console.error('Valor do pagamento difere da intenção', intent.id, pagamento.transaction_amount, intent.total);
    return { status: 'pendente' };
  }

  const lines = typeof intent.items_json === 'string' ? JSON.parse(intent.items_json) : intent.items_json;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // trava a intenção e revalida idempotência
    const [[fresh]] = await conn.query('SELECT status, order_id FROM payment_intents WHERE id = ? FOR UPDATE', [intent.id]);
    if (fresh.order_id) { await conn.commit(); return { status: 'pago', orderId: fresh.order_id }; }

    const orderId = await store.criarPedidoPago(conn, {
      clientId: intent.client_id,
      lines,
      fee: intent.delivery_fee,
      total: intent.total,
      paymentMethod: mapPaymentMethod(pagamento.payment_type_id),
      mpPaymentId: intent.mp_payment_id,
    });
    await conn.query("UPDATE payment_intents SET status='pago', order_id=? WHERE id=?", [orderId, intent.id]);
    await conn.commit();
    return { status: 'pago', orderId };
  } catch (e) {
    await conn.rollback();
    console.error('Erro ao confirmar pagamento (criar pedido):', e);
    return { status: 'erro' };
  } finally {
    conn.release();
  }
}

async function confirmarPorPaymentId(paymentId) {
  const pagamento = await mp.buscarPagamento(paymentId); // { status, transaction_amount, external_reference, payment_type_id }
  if (!pagamento.external_reference) return { status: 'desconhecido' };
  const [[intent]] = await db.query('SELECT * FROM payment_intents WHERE external_reference = ?', [pagamento.external_reference]);
  if (!intent) return { status: 'desconhecido' };
  // grava o payment id na intenção (antes de confirmar)
  await db.query('UPDATE payment_intents SET mp_payment_id=? WHERE id=?', [String(paymentId), intent.id]);
  intent.mp_payment_id = String(paymentId);
  return confirmarIntencao(intent, pagamento);
}

// POST /api/loja/pagamentos/webhook — público; valida via API do MP
async function webhook(req, res) {
  try {
    const type = req.body.type || req.query.type;
    const paymentId = (req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
    if (type === 'payment' && paymentId) {
      await confirmarPorPaymentId(paymentId);
    }
    return res.sendStatus(200);
  } catch (e) {
    console.error('Erro no webhook MP:', e);
    return res.sendStatus(200); // evita reentregas em loop; reconsultaremos pelo status
  }
}

// GET /api/loja/pagamentos/:ref — status para a página de retorno (ownership)
async function statusPagamento(req, res) {
  const ref = req.params.ref;
  if (!/^[a-f0-9]{64}$/.test(ref)) return res.status(400).json({ error: 'Referência inválida.' });
  try {
    const [[intent]] = await db.query('SELECT * FROM payment_intents WHERE external_reference = ?', [ref]);
    if (!intent || intent.client_id !== req.customer.id) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    if (intent.status === 'pago' && intent.order_id) return res.json({ status: 'pago', orderId: intent.order_id });

    // se ainda pendente e já temos um payment id, reconsulta o MP e tenta confirmar
    if (intent.status === 'pendente' && intent.mp_payment_id) {
      const pagamento = await mp.buscarPagamento(intent.mp_payment_id);
      const r = await confirmarIntencao(intent, pagamento);
      return res.json(r);
    }
    return res.json({ status: intent.status });
  } catch (e) {
    console.error('Erro ao consultar status do pagamento:', e);
    return res.status(500).json({ error: 'Erro ao consultar o pagamento.' });
  }
}
```
Atualizar o `module.exports`:
```js
module.exports = { criarPagamento, webhook, statusPagamento };
```

- [ ] **Step 2: Rotas**

Em `src/routes/lojaPagamentos.js`, após `router.post('/', customerAuth, c.criarPagamento);`:
```js
router.post('/webhook', c.webhook);          // público (MP) — valida via API
router.get('/:ref', customerAuth, c.statusPagamento);
```
(O `POST /webhook` e o `GET /:ref` não colidem — métodos diferentes; e `/webhook` é POST enquanto `/:ref` é GET.)

- [ ] **Step 3: Verificar (webhook responde 200; status exige ownership)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "webhook sem nada -> 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pagamentos/webhook -X POST -H "Content-Type: application/json" -d '{}'
echo -n "status sem login -> 401: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pagamentos/0000000000000000000000000000000000000000000000000000000000000000
echo -n "status ref inválida (logado) -> 400, inexistente -> 404: precisa de JWT (ver Task 7 no navegador)"
echo ""
node -e "const c=require('./src/controllers/paymentController'); console.log('exports:', Object.keys(c).join(','))"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: webhook → **200**; status sem login → **401**; exports `criarPagamento,webhook,statusPagamento`. (Fluxo aprovado/idempotência são validados com o sandbox do MP no teste de navegador da Task 7.)

- [ ] **Step 4: Commit**

```bash
git add src/controllers/paymentController.js src/routes/lojaPagamentos.js
git commit -m "feat(loja): confirmar pagamento (webhook + status) idempotente e cria pedido"
```

---

### Task 6: Checkout — "Finalizar e pagar" → Mercado Pago

**Files:**
- Modify: `src/public/loja/checkout.html`

**Interfaces:**
- Consome: `POST /api/loja/pagamentos` → `{ init_point, external_reference }` (ou 503/400).

- [ ] **Step 1: Repontar o botão Finalizar**

Em `src/public/loja/checkout.html`:
- Trocar o rótulo do botão para **"Finalizar e pagar"** (o `<button id="btn-finalizar">`).
- Substituir o handler que hoje faz `fetch('/api/loja/pedidos', ...)` por um que chama o pagamento:
```js
btnFinalizar.addEventListener('click', async function () {
  btnFinalizar.disabled = true;
  var corpo = {
    items: Cart.getItems().map(function (i) { return { id: i.id, qty: i.qty }; }),
    cep: campoCep.value, address: campoEndereco.value, houseNumber: campoNumero.value,
    neighborhood: campoBairro.value, city: campoCidade.value
  };
  try {
    var r = await fetch('/api/loja/pagamentos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + StoreAuth.getToken() },
      body: JSON.stringify(corpo)
    });
    if (r.status === 401 || r.status === 403) { StoreAuth.logout(); location.href = 'entrar.html'; return; }
    var data = await r.json().catch(function () { return {}; });
    if (r.status === 201 && data.init_point) { window.location = data.init_point; return; }
    if (r.status === 503) { showAlert('Pagamento indisponível no momento. Tente mais tarde.'); }
    else { showAlert(data.error || 'Não foi possível iniciar o pagamento.'); }
    btnFinalizar.disabled = false;
  } catch (e) {
    showAlert('Falha de conexão ao iniciar o pagamento.');
    btnFinalizar.disabled = false;
  }
});
```
(Use os nomes reais dos campos/elementos já existentes na página — `campoCep`, `campoEndereco`, etc. são ilustrativos; reaproveite as referências do script atual. `showAlert` já existe na página.)

- [ ] **Step 2: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "checkout 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/checkout.html
node -e "const h=require('fs').readFileSync('src/public/loja/checkout.html','utf8'); console.log('chama /pagamentos:', h.includes('/api/loja/pagamentos')); console.log('nao chama mais /pedidos POST:', !/fetch\(\s*['\\\"]\/api\/loja\/pedidos['\\\"]/.test(h)); console.log('init_point:', h.includes('init_point')); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('script parse OK')" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `chama /pagamentos: true`; `nao chama mais /pedidos POST: true`; `init_point: true`; `script parse OK`.

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(loja): checkout finaliza via Mercado Pago (Finalizar e pagar)"
```

---

### Task 7: Página de retorno do pagamento

**Files:**
- Create: `src/public/loja/pagamento-retorno.html`

**Interfaces:**
- Consome: `GET /api/loja/pagamentos/:ref` → `{ status, orderId? }` (status: pago|pendente|falhou|erro).

- [ ] **Step 1: Criar `pagamento-retorno.html`**

Moldura padrão da loja (head com `/loja/loja.css`; header/footer copiados de `index.html`; fim do body `cart.js`,`loja.js`,`account.js`, depois o script da página; sem cookie banner hardcoded). Script (`'use strict'` IIFE):
- Guard: `!StoreAuth.isLoggedIn()` → `location.replace('entrar.html?next=/loja/meus-pedidos.html')` + return.
- Lê `external_reference` de `?external_reference=` (o MP também anexa `payment_id`, `status`, etc.; usamos o nosso `external_reference`). Se ausente/!`/^[a-f0-9]{64}$/` → mensagem "Não encontramos seu pagamento" + link Meus pedidos.
- Função `consultar()` → `fetch('/api/loja/pagamentos/' + ref, { headers: { Authorization: 'Bearer ' + StoreAuth.getToken() } })`:
  - 401/403 → `StoreAuth.logout()` + `entrar.html`.
  - `{status:'pago', orderId}` → `Cart.clear()` + `location.replace('pedido-confirmado.html?id=' + orderId)`.
  - `{status:'falhou'}` → mostra "Pagamento não aprovado" + botão "Voltar ao carrinho" (`carrinho.html`).
  - `{status:'pendente'}` (ou `erro`) → "Estamos confirmando seu pagamento…" e reconsulta em ~3s (polling), até ~10 tentativas; depois disso, "ainda processando — acompanhe em Meus pedidos" + link.
- Chamar `consultar()` no load.

- [ ] **Step 2: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "retorno 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/pagamento-retorno.html
node -e "const h=require('fs').readFileSync('src/public/loja/pagamento-retorno.html','utf8'); console.log('consulta status:', h.includes('/api/loja/pagamentos/')); console.log('redirect confirmado:', h.includes('pedido-confirmado.html')); const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('script parse OK')" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `consulta status: true`; `redirect confirmado: true`; `script parse OK`.

- [ ] **Step 3: Teste de ponta a ponta no sandbox do MP (manual — requer `MP_ACCESS_TOKEN` de teste)**

Com `MP_ACCESS_TOKEN` de teste no `.env` e `node src/app.js` rodando: logar na loja → adicionar produtos → checkout → "Finalizar e pagar" → pagar na página do MP com cartão de teste **aprovado** (ou PIX sandbox) → voltar para `pagamento-retorno.html` → ver redirecionar para a confirmação → conferir no banco: `payment_intents.status='pago'`, um `orders` com `payment_status='pago'`, `mp_payment_id` preenchido, estoque baixado uma vez. Repetir o reenvio do webhook pelo simulador do MP e confirmar que **não** cria pedido duplicado. (Encerrar o node ao terminar.)

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/pagamento-retorno.html
git commit -m "feat(loja): página de retorno do pagamento (confirma e redireciona)"
```

---

### Task 8: Mostrar "Pago" no histórico, detalhe e confirmação

**Files:**
- Modify: `src/controllers/storeOrderController.js`, `src/public/loja/meus-pedidos.html`, `src/public/loja/pedido.html`, `src/public/loja/pedido-confirmado.html`

**Interfaces:**
- Produz: `payment_status` nas respostas de `GET /api/loja/pedidos` e `GET /api/loja/pedidos/:id`.

- [ ] **Step 1: Incluir `payment_status` nas queries**

Em `src/controllers/storeOrderController.js`:
- `listarPedidos`: adicionar `o.payment_status` ao `SELECT`.
- `detalhePedido`: adicionar `o.payment_status` ao `SELECT` do cabeçalho.

- [ ] **Step 2: Exibir o selo "Pago"**

Em `meus-pedidos.html`, `pedido.html` e `pedido-confirmado.html`, onde o pedido é renderizado, mostrar um selo/linha **"Pago"** (ex.: `<span class="badge badge--pago">Pago</span>`) quando `payment_status === 'pago'`. Reaproveitar o padrão de badge de status já usado nessas páginas. Em `pedido-confirmado.html`, trocar o aviso "Pagamento a combinar" por **"Pagamento confirmado"** quando `payment_status==='pago'` (mantém o texto antigo só se não for pago).

- [ ] **Step 3: Verificar (estático + query)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "const c=require('fs').readFileSync('src/controllers/storeOrderController.js','utf8'); console.log('listar tem payment_status:', /listarPedidos[\s\S]*?payment_status/.test(c)); console.log('detalhe tem payment_status:', /detalhePedido[\s\S]*?payment_status/.test(c));"
for p in meus-pedidos.html pedido.html pedido-confirmado.html; do echo -n "$p selo pago: "; curl -s http://localhost:3000/loja/$p | grep -c -i 'pago'; done
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: ambas as queries com `payment_status`; cada página retorna ≥ 1 para "pago".

- [ ] **Step 4: Commit**

```bash
git add src/controllers/storeOrderController.js src/public/loja/meus-pedidos.html src/public/loja/pedido.html src/public/loja/pedido-confirmado.html
git commit -m "feat(loja): exibir status Pago no histórico, detalhe e confirmação"
```
