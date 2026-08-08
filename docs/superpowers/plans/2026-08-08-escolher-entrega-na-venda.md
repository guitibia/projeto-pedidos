# Escolher estilo de entrega ao gerar a venda — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir escolher Retirada (grátis) ou Entrega (com taxa digitada) ao gerar a venda, gravando `delivery_method` e `delivery_fee` no pedido.

**Architecture:** `inserirVendaTx` e `createOrder` passam a aceitar `deliveryMethod`/`deliveryFee` e gravá-los; o lote `gerarVendas` grava Retirada. O formulário de criar pedido (`pedidos.html`) ganha um seletor Retirada/Entrega com campo de taxa.

**Tech Stack:** Node/Express + MySQL (`mysql2/promise`), CommonJS. Front: HTML + Bootstrap 5 + SweetAlert2 + vanilla JS. Testes: `node:test`.

## Global Constraints

- Branch `Teste` (banco `db_pedidos_teste` nos testes). Não tocar `main`/`db_pedidos`.
- Sem migração: `orders.delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'` e `orders.delivery_fee DECIMAL(6,2) NOT NULL DEFAULT 0.00` já existem.
- `total_cost` segue sendo o subtotal dos produtos; o frete fica só em `delivery_fee` (semântica atual do painel). Não consolidar.
- Compatibilidade: quando `deliveryMethod` não é enviado, o comportamento é o de hoje (`delivery_method='entrega'`, `delivery_fee=0`).
- Rodar `node:test` com o padrão do projeto (pool não deixa sair): `node --test test/ARQ.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null` e validar **0 `not ok`**.
- Trailer de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`. Não matar o node da porta 3000.

## File Structure

- `src/controllers/orderController.js` — `inserirVendaTx` aceita/gravao `deliveryMethod`/`deliveryFee`; `createOrder` repassa do `req.body`; export inalterado.
- `src/controllers/demandaController.js` — `gerarVendas` passa `deliveryMethod: 'retirada'` ao `inserirVendaTx`.
- `src/public/pedidos.html` — seletor de entrega no `orderForm`, payload no submit, `resetOrderForm`.
- `test/entrega-venda.test.js` — novo; testa os 4 casos de entrega no `createOrder`.

---

### Task 1: Backend — `deliveryMethod`/`deliveryFee` em `inserirVendaTx`, `createOrder` e `gerarVendas`

**Files:**
- Modify: `src/controllers/orderController.js:8-22` (assinatura + INSERT de `inserirVendaTx`), `:90-95` (chamada em `createOrder`), `:40-41` (destructure do `req.body`)
- Modify: `src/controllers/demandaController.js` (chamada `inserirVendaTx` dentro de `gerarVendas`)
- Test: `test/entrega-venda.test.js` (criar)

**Interfaces:**
- Consumes: `inserirVendaTx` existente.
- Produces: `inserirVendaTx(conn, { ..., deliveryMethod, deliveryFee })` — grava `delivery_method` (`'retirada'`/`'entrega'`, default `'entrega'`) e `delivery_fee` (retirada→0; entrega→`Math.max(0, Number(deliveryFee)||0)`); retorna `{ orderId, total, fee }` com `fee` = frete gravado. `POST /api/orders` aceita `deliveryMethod`/`deliveryFee` no body; `deliveryMethod` inválido → 400.

- [ ] **Step 1: Write the failing tests**

Criar `test/entrega-venda.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { createOrder } = require('../src/controllers/orderController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedProduct(estoque){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,?)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()+Math.floor(Math.random()*1e6), estoque != null ? estoque : 0]); return r.insertId; }
async function cleanup(){
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM estoque_movimentacoes WHERE product_id IN (SELECT id FROM products WHERE name = 'zz_test_prod')");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
}
async function criar(cli, prod, extra){
  const res = mockRes();
  await createOrder({ body: Object.assign({ clientId: cli, paymentMethod: 'DINHEIRO', totalValue: 40, products: [{ id: prod, salePrice: 40, quantity: 1 }] }, extra) }, res);
  return res;
}

test('createOrder retirada grava delivery_method=retirada e fee 0', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'retirada', deliveryFee: 99 });
    assert.strictEqual(res.statusCode, 201);
    const [[o]] = await db.query('SELECT delivery_method, delivery_fee FROM orders WHERE id = ?', [res.body.orderId]);
    assert.strictEqual(o.delivery_method, 'retirada');
    assert.strictEqual(Number(o.delivery_fee), 0);
  } finally { await cleanup(); }
});

test('createOrder entrega grava delivery_method=entrega e a taxa informada', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'entrega', deliveryFee: 12 });
    assert.strictEqual(res.statusCode, 201);
    const [[o]] = await db.query('SELECT delivery_method, delivery_fee FROM orders WHERE id = ?', [res.body.orderId]);
    assert.strictEqual(o.delivery_method, 'entrega');
    assert.strictEqual(Number(o.delivery_fee), 12);
  } finally { await cleanup(); }
});

test('createOrder entrega com taxa vazia/negativa grava fee 0', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'entrega', deliveryFee: -5 });
    assert.strictEqual(res.statusCode, 201);
    const [[o]] = await db.query('SELECT delivery_fee FROM orders WHERE id = ?', [res.body.orderId]);
    assert.strictEqual(Number(o.delivery_fee), 0);
  } finally { await cleanup(); }
});

test('createOrder rejeita deliveryMethod inválido (400)', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct(5);
    const res = await criar(cli, prod, { deliveryMethod: 'teletransporte' });
    assert.strictEqual(res.statusCode, 400);
  } finally { await cleanup(); }
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/entrega-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL — hoje `delivery_method` sai sempre `'entrega'`/0 e não há validação (retirada/entrega/400 falham).

- [ ] **Step 3: Estender `inserirVendaTx`**

Em `src/controllers/orderController.js`, trocar a assinatura e o bloco do `fee`/INSERT (linhas ~8 e ~18-22):

Assinatura:
```js
async function inserirVendaTx(conn, { clientId, paymentMethod, installments, combinedPaymentValue, effProducts, effTotal, demandaItemIds, deliveryMethod, deliveryFee }) {
```

Trocar `const fee = 0;` e o INSERT por:
```js
  const method = deliveryMethod === 'retirada' ? 'retirada' : 'entrega';
  const fee = method === 'retirada' ? 0 : Math.max(0, Number(deliveryFee) || 0);
  const [orderResult] = await conn.query(
    'INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee, delivery_method) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [clientId, paymentMethod, installments || null, effTotal, combinedPaymentValue || null, fee, method]
  );
```

- [ ] **Step 4: `createOrder` lê e valida entrega, e repassa**

Em `createOrder`, na desestruturação (linha ~41), incluir `deliveryMethod, deliveryFee`:
```js
  const { clientId, paymentMethod, products, totalValue, combinedPaymentValue, installments, demandaItemIds, deliveryMethod, deliveryFee } = req.body;
```

Logo após a validação de `VALID_PAYMENT_METHODS` (antes de abrir a transação), validar o método de entrega:
```js
  if (deliveryMethod !== undefined && deliveryMethod !== 'retirada' && deliveryMethod !== 'entrega') {
    return res.status(400).json({ error: 'Método de entrega inválido.' });
  }
```

Na chamada de `inserirVendaTx` (linha ~90), repassar os dois campos:
```js
    const { orderId, total, fee: usedFee } = await inserirVendaTx(conn, {
      clientId, paymentMethod, installments, combinedPaymentValue,
      effProducts, effTotal, demandaItemIds, deliveryMethod, deliveryFee
    });
```

- [ ] **Step 5: `gerarVendas` grava Retirada**

Em `src/controllers/demandaController.js`, na chamada `await inserirVendaTx(conn, { ... })` dentro de `gerarVendas`, acrescentar `deliveryMethod: 'retirada'` ao objeto:
```js
        const { orderId, total } = await inserirVendaTx(conn, {
          clientId: g.client_id, paymentMethod, installments: null, combinedPaymentValue: null,
          effProducts, effTotal, demandaItemIds, deliveryMethod: 'retirada'
        });
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `node --test test/entrega-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: 0 `not ok` (4 testes passam).

- [ ] **Step 7: Regressão**

Run: `node --test test/demanda-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null` → 0 `not ok`.
Run: `node --test test/gerar-vendas.test.js & TP=$!; sleep 28; kill $TP 2>/dev/null` → 0 `not ok`.

- [ ] **Step 8: Commit**

```bash
git add src/controllers/orderController.js src/controllers/demandaController.js test/entrega-venda.test.js
git commit -m "feat(orders): gravar estilo de entrega (retirada/entrega + taxa) na venda

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Front — seletor de entrega no formulário de criar pedido

**Files:**
- Modify: `src/public/pedidos.html` — bloco de entrega no `orderForm` (após `#paymentMethod`, ~linha 374), payload do submit (~866-874), `resetOrderForm`

**Interfaces:**
- Consumes: `POST /api/orders` aceitando `deliveryMethod`/`deliveryFee` (Task 1).
- Produces: nenhum consumidor a jusante.

- [ ] **Step 1: Adicionar o bloco de entrega no formulário**

Em `src/public/pedidos.html`, logo após a linha `<input type="hidden" id="paymentMethod">` (~374), inserir:

```html
            <div class="mb-3">
              <label class="form-label">Entrega</label>
              <div class="input-icon-wrap mb-1">
                <i class="bi bi-truck"></i>
                <select id="deliveryMethod" class="form-select">
                  <option value="retirada">Retirada (grátis)</option>
                  <option value="entrega">Entrega</option>
                </select>
              </div>
              <div id="deliveryFeeDiv" style="display:none">
                <label class="form-label">Taxa de entrega (R$)</label>
                <div class="input-icon-wrap">
                  <i class="bi bi-cash"></i>
                  <input type="number" step="0.01" min="0" id="deliveryFee" class="form-control" placeholder="0,00">
                </div>
              </div>
            </div>
```

- [ ] **Step 2: Mostrar/ocultar a taxa conforme o método**

No bloco de scripts (junto dos outros listeners, ex.: perto de `document.getElementById('installments').addEventListener(...)` ~linha 829), adicionar:

```js
  document.getElementById('deliveryMethod').addEventListener('change', (e) => {
    document.getElementById('deliveryFeeDiv').style.display = e.target.value === 'entrega' ? 'block' : 'none';
    if (e.target.value !== 'entrega') document.getElementById('deliveryFee').value = '';
  });
```

- [ ] **Step 3: Incluir no payload do submit**

No handler do `orderForm` submit (~866-874), acrescentar ao `payload`:

```js
      deliveryMethod:       document.getElementById('deliveryMethod').value,
      deliveryFee:          document.getElementById('deliveryMethod').value === 'entrega' ? (document.getElementById('deliveryFee').value || 0) : 0,
```

(Adicionar essas duas linhas dentro do objeto `payload`, ex.: após a linha de `demandaItemIds`.)

- [ ] **Step 4: Resetar no `resetOrderForm`**

Em `resetOrderForm`, após `document.getElementById('combinedPaymentDiv').style.display = 'none';`, adicionar:

```js
    document.getElementById('deliveryMethod').value = 'retirada';
    document.getElementById('deliveryFeeDiv').style.display = 'none';
    document.getElementById('deliveryFee').value = '';
```

- [ ] **Step 5: Verificação manual (o projeto não testa UI)**

Subir local numa porta livre (não a 3000) e testar no navegador:
Run: `PORT=3093 node src/app.js & SP=$!; sleep 4; echo "abra http://localhost:3093/pedidos.html"; ` (teste e depois `kill $SP`).
Passos: aba criar pedido → escolher **Retirada** → criar → conferir no detalhe "Retirada com o vendedor / Frete: Grátis". Depois **Entrega** → digitar taxa (ex.: 10) → criar → conferir "Taxa de entrega: R$ 10,00" e o total somando o frete. Também via "Gerar venda do que veio" (o rascunho carrega os produtos; a escolha de entrega é feita na tela antes de finalizar).

- [ ] **Step 6: Commit**

```bash
git add src/public/pedidos.html
git commit -m "feat(pedidos): seletor Retirada/Entrega (com taxa) no criar pedido

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- Ordem: Task 1 (backend) → Task 2 (front, depende do endpoint).
- Compatibilidade: chamadas sem `deliveryMethod` seguem gravando `entrega`/0 (regressão dos testes existentes garante isso).
