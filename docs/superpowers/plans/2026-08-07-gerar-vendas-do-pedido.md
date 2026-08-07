# Gerar venda (com estoque) a partir do pedido + gerar todas de uma vez — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o "Gerar venda do que veio" voltar a funcionar (registrando a venda e baixando o estoque) ligando o produto por baixo no "Puxar da NF", e adicionar um botão "Gerar todas as vendas" que gera as vendas de todos os pedidos elegíveis de uma vez.

**Architecture:** O "Puxar da NF" passa a gravar o `product_id` do item da NF no item do pedido (via `remanejarAlocacao` estendido). Com o vínculo, a venda existente funciona. A lógica transacional de criar venda é extraída de `createOrder` para um helper `inserirVendaTx`, reaproveitado por um novo endpoint batch `gerarVendas` (uma transação por pedido, PIX opcional). O front ganha o envio do `product_id` no "Puxar da NF", um aviso de itens sem produto no "Gerar venda", e o botão "Gerar todas as vendas".

**Tech Stack:** Node/Express + MySQL (`mysql2/promise`), CommonJS. Front: HTML + Bootstrap 5 + SweetAlert2 + vanilla JS (`Auth.apiFetch`, `esc`). Testes: `node:test`.

## Global Constraints

- Branch `Teste` (banco `db_pedidos_teste` nos testes). Não tocar `main`/`db_pedidos`.
- Sem migração: as colunas já existem (`demanda_itens.product_id`, `demanda_itens.order_id`, `demanda_itens.preco_venda`; `order_products` PK `(order_id, product_id)`; `products.cost`/`sale_value`/`estoque`).
- `VALID_PAYMENT_METHODS = ['PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO']` (copiado de `orderController.js`).
- Rodar `node:test` com o padrão do projeto (o pool MySQL não deixa o processo sair sozinho): `node --test test/ARQ.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null` e validar **0 `not ok`**.
- Trailer de commit: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Não matar o node da porta 3000 (dev do usuário).
- Reaproveitar helpers existentes: `resolvePixPercent`, `aplicaPix`, `getDescontoPix` (`utils/pricing`), `esc`, `Auth.apiFetch`.

## File Structure

- `src/controllers/demandaController.js` — estende `remanejarAlocacao` (aceita `product_id`); adiciona `gerarVendas`; exporta ambos.
- `src/controllers/orderController.js` — extrai `inserirVendaTx(conn, {...})` de `createOrder`; exporta.
- `src/routes/demanda.js` — registra `POST /gerar-vendas` (rota fixa, antes de `/:id`).
- `src/public/demanda.html` — `renderConferenciaPedido` envia `product_id`; `abrirPedido` avisa itens sem produto; `carregarPedidos` ganha botão "Gerar todas as vendas" + função `gerarTodasVendas`.
- `test/gerar-vendas.test.js` — novo; testa `remanejarAlocacao` com/sem `product_id` e `gerarVendas`.

---

### Task 1: `remanejarAlocacao` aceita `product_id` opcional

**Files:**
- Modify: `src/controllers/demandaController.js:255-273` (função `remanejarAlocacao`)
- Test: `test/gerar-vendas.test.js` (criar)

**Interfaces:**
- Consumes: nada de tasks anteriores.
- Produces: `PUT /api/demanda/itens/:itemId/alocacao` passa a aceitar `req.body.product_id` (inteiro opcional). Quando presente e válido, grava `demanda_itens.product_id`. Quando ausente, não altera a coluna.

- [ ] **Step 1: Write the failing test**

Criar `test/gerar-vendas.test.js` com:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { remanejarAlocacao, gerarVendas } = require('../src/controllers/demandaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function seedClient(){ const [r] = await db.query('INSERT INTO clients (name) VALUES (?)', ['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedProduct(estoque){ const [r] = await db.query('INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?,?,?,?,?,?)', ['zz_test_prod', 5, 40, 'Outros', 'ZZP'+Date.now()+Math.floor(Math.random()*1e6), estoque != null ? estoque : 0]); return r.insertId; }
async function cleanup(){
  await db.query("DELETE FROM order_products WHERE order_id IN (SELECT id FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%'))");
  await db.query("DELETE FROM orders WHERE client_id IN (SELECT id FROM clients WHERE name LIKE 'zz_test_cli_%')");
  await db.query("DELETE FROM estoque_movimentacoes WHERE product_id IN (SELECT id FROM products WHERE name = 'zz_test_prod')");
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM products WHERE name = 'zz_test_prod'");
}

test('remanejarAlocacao grava product_id quando enviado e mantém quando ausente', async () => {
  try {
    const cli = await seedClient(); const prod = await seedProduct();
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    const [i] = await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?)', [p.insertId, 'K1', 2, 0, 'pendente']);
    // 1) com product_id: grava o vínculo
    let res = mockRes();
    await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 2, product_id: prod } }, res);
    assert.strictEqual(res.statusCode, 200);
    let [[row]] = await db.query('SELECT qtd_recebida, product_id FROM demanda_itens WHERE id = ?', [i.insertId]);
    assert.strictEqual(row.product_id, prod);
    assert.strictEqual(Number(row.qtd_recebida), 2);
    // 2) sem product_id: não apaga o vínculo anterior
    res = mockRes();
    await remanejarAlocacao({ params: { itemId: i.insertId }, body: { qtd_recebida: 1 } }, res);
    assert.strictEqual(res.statusCode, 200);
    [[row]] = await db.query('SELECT qtd_recebida, product_id FROM demanda_itens WHERE id = ?', [i.insertId]);
    assert.strictEqual(row.product_id, prod, 'product_id continua ligado');
    assert.strictEqual(Number(row.qtd_recebida), 1);
  } finally {
    await cleanup();
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/gerar-vendas.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL — o 2º import `gerarVendas` ainda não existe (destructure vira `undefined`) e o teste do product_id falha porque a coluna não é gravada. (Se o require quebrar, o teste conta como falho; será resolvido junto na Task 3 que cria `gerarVendas`. Para isolar a Task 1, comente temporariamente `gerarVendas` do import ao rodar; a Task 3 o descomenta.)

Nota ao implementer: para a Task 1, ajuste o import para `const { remanejarAlocacao } = require(...)` (sem `gerarVendas`), rode, veja o assert de `product_id` FALHAR. A Task 3 volta o import completo.

- [ ] **Step 3: Write minimal implementation**

Em `src/controllers/demandaController.js`, na função `remanejarAlocacao`, ler o `product_id` e incluí-lo no UPDATE só quando válido. Substituir o corpo atual (linhas ~255-273) por:

```js
async function remanejarAlocacao(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  const nova = parseInt(req.body.qtd_recebida, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  if (!Number.isInteger(nova) || nova < 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const pidRaw = req.body.product_id;
  const pid = (pidRaw === undefined || pidRaw === null || pidRaw === '') ? null : parseInt(pidRaw, 10);
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[item]] = await conn.query('SELECT pedido_id, qtd_pedida FROM demanda_itens WHERE id = ? FOR UPDATE', [itemId]);
    if (!item) { await conn.rollback(); return res.status(404).json({ error: 'Item não encontrado.' }); }
    if (nova > Number(item.qtd_pedida)) { await conn.rollback(); return res.status(400).json({ error: 'Não pode receber mais do que foi pedido.' }); }
    const status = nova >= Number(item.qtd_pedida) ? 'veio' : (nova > 0 ? 'parcial' : 'pendente');
    if (Number.isInteger(pid)) {
      await conn.query('UPDATE demanda_itens SET qtd_recebida = ?, status = ?, product_id = ? WHERE id = ?', [nova, status, pid, itemId]);
    } else {
      await conn.query('UPDATE demanda_itens SET qtd_recebida = ?, status = ? WHERE id = ?', [nova, status, itemId]);
    }
    await recalcularStatusPedido(conn, item.pedido_id);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('remanejarAlocacao', e); return res.status(500).json({ error: 'Erro.' }); }
  finally { conn.release(); }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/gerar-vendas.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (0 `not ok`) para o teste de `remanejarAlocacao` (com o import reduzido só a `remanejarAlocacao`).

- [ ] **Step 5: Confirmar que a suíte de demanda não quebrou**

Run: `node --test test/demanda-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: 0 `not ok` (o teste `remanejarAlocacao` existente, sem `product_id`, continua passando).

- [ ] **Step 6: Commit**

```bash
git add src/controllers/demandaController.js test/gerar-vendas.test.js
git commit -m "feat(demanda): alocacao aceita product_id (liga o produto ao item)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Extrair `inserirVendaTx` de `createOrder` (refatoração)

**Files:**
- Modify: `src/controllers/orderController.js:8-108` (função `createOrder`) e o `module.exports`
- Test: reusa `test/demanda-venda.test.js` (regressão — `createOrder` marca `order_id` e cria a venda)

**Interfaces:**
- Consumes: nada.
- Produces: `inserirVendaTx(conn, { clientId, paymentMethod, installments, combinedPaymentValue, effProducts, effTotal, demandaItemIds })` → `Promise<{ orderId, total, fee }>`. Assume transação já aberta na `conn` (não faz commit/rollback). `effProducts` = `[{ id, salePrice, quantity, productCost }]` (preços já com PIX aplicado, se for o caso). Exportada em `module.exports`.

- [ ] **Step 1: Escrever o helper e refatorar `createOrder`**

Em `src/controllers/orderController.js`, adicionar o helper (antes de `createOrder`) e reescrever a parte transacional de `createOrder` para chamá-lo. O helper contém exatamente a lógica hoje entre "Verificar estoque" e "Marcação atômica" (linhas 54-97):

```js
// Insere a venda dentro de uma transação já aberta (conn). Reaproveitado por createOrder e gerarVendas.
async function inserirVendaTx(conn, { clientId, paymentMethod, installments, combinedPaymentValue, effProducts, effTotal, demandaItemIds }) {
  // Verificar que todos os produtos existem e têm estoque suficiente
  for (const product of effProducts) {
    const [[row]] = await conn.query('SELECT id, name, estoque FROM products WHERE id = ?', [product.id]);
    if (!row) throw new Error(`Produto ID "${product.id}" não encontrado.`);
    const qtd = product.quantity || 1;
    if (row.estoque < qtd) {
      throw new Error(`Estoque insuficiente para "${row.name}". Disponível: ${row.estoque}, solicitado: ${qtd}.`);
    }
  }
  const fee = 0;
  const [orderResult] = await conn.query(
    'INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee) VALUES (?, ?, ?, ?, ?, ?)',
    [clientId, paymentMethod, installments || null, effTotal, combinedPaymentValue || null, fee]
  );
  const orderId = orderResult.insertId;
  const productsValues = effProducts.map(p => [
    orderId, p.id, parseFloat(p.salePrice), p.quantity || 1,
    p.productCost != null ? parseFloat(p.productCost) : null
  ]);
  await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES ?', [productsValues]);
  for (const product of effProducts) {
    const qtd = product.quantity || 1;
    await conn.query('UPDATE products SET estoque = estoque - ? WHERE id = ?', [qtd, product.id]);
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
      [product.id, 'Saída', qtd, `Pedido #${orderId}`]
    );
  }
  if (Array.isArray(demandaItemIds) && demandaItemIds.length) {
    const ids = demandaItemIds.map(v => parseInt(v, 10)).filter(v => Number.isInteger(v));
    if (ids.length) {
      await conn.query('UPDATE demanda_itens SET order_id = ? WHERE id IN (?) AND order_id IS NULL', [orderId, ids]);
    }
  }
  return { orderId, total: effTotal, fee };
}
```

Depois, em `createOrder`, substituir o bloco da transação (de `const conn = await db.getConnection();` até o `return res.status(201)...`) por:

```js
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const { orderId, total, fee: usedFee } = await inserirVendaTx(conn, {
      clientId, paymentMethod, installments, combinedPaymentValue,
      effProducts, effTotal, demandaItemIds
    });
    await conn.commit();
    return res.status(201).json({ message: 'Pedido criado com sucesso!', orderId, totalValue: total, deliveryFee: usedFee });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao criar pedido:', err);
    return res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
```

Remover a linha `const fee = 0;` que ficava antes da transação em `createOrder` (agora o fee vem do helper). Manter intactos: validações de entrada, checagem `product.salePrice`, e o cálculo de `effProducts`/`effTotal` do PIX (linhas 36-46).

No `module.exports`, acrescentar `inserirVendaTx`.

- [ ] **Step 2: Run regression tests**

Run: `node --test test/demanda-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: 0 `not ok` — em especial `createOrder marca demanda_itens.order_id atomicamente` e `rascunhoVenda ...` continuam passando.

- [ ] **Step 3: Boot smoke (app sobe sem erro de require)**

Run: `PORT=3099 node src/server.js & SP=$!; sleep 4; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3099/pedidos.html; kill $SP 2>/dev/null`
Expected: imprime `200` (ou `302`), sem stack trace de require/sintaxe.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/orderController.js
git commit -m "refactor(orders): extrai inserirVendaTx de createOrder (reuso p/ batch)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Endpoint batch `gerarVendas` + rota

**Files:**
- Modify: `src/controllers/demandaController.js` (adicionar `gerarVendas`, imports de pricing e do helper, exportar `gerarVendas`)
- Modify: `src/routes/demanda.js:11` (registrar `POST /gerar-vendas` antes de `/:id`)
- Test: `test/gerar-vendas.test.js` (adicionar testes do batch; restaurar import de `gerarVendas`)

**Interfaces:**
- Consumes: `inserirVendaTx` (Task 2); `resolvePixPercent`, `aplicaPix`, `getDescontoPix` (`utils/pricing`).
- Produces: `POST /api/demanda/gerar-vendas` body `{ payment_method }` → `200` `{ geradas:[{cliente,order_id,total}], falhas:[{cliente,erro}], sem_produto:[{cliente,nome}], total_geral }`. `payment_method` default `'DINHEIRO'`; inválido → `400`.

- [ ] **Step 1: Write the failing tests**

Restaurar no `test/gerar-vendas.test.js` o import completo `const { remanejarAlocacao, gerarVendas } = require('../src/controllers/demandaController');` e acrescentar:

```js
test('gerarVendas cria venda, baixa estoque, marca order_id e agrega mesmo produto', async () => {
  try {
    const cli = await seedClient();
    const prod = await seedProduct(10); // estoque 10
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    // dois itens do MESMO produto (devem agregar em 1 linha de order_products, qtd 3)
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'A', 2, 2, prod, 'veio']);
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'B', 1, 1, prod, 'veio']);
    // um item recebido SEM produto (fica de fora)
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, nome, qtd_pedida, qtd_recebida, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'C', 'Brinde sem produto', 1, 1, 'veio']);

    const res = mockRes();
    await gerarVendas({ body: { payment_method: 'DINHEIRO' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.geradas.length, 1);
    assert.strictEqual(res.body.falhas.length, 0);
    assert.strictEqual(res.body.sem_produto.length, 1);
    assert.strictEqual(res.body.sem_produto[0].nome, 'Brinde sem produto');

    const orderId = res.body.geradas[0].order_id;
    // order_products agregado numa linha, quantidade 3
    const [ops] = await db.query('SELECT product_id, quantity FROM order_products WHERE order_id = ?', [orderId]);
    assert.strictEqual(ops.length, 1);
    assert.strictEqual(Number(ops[0].quantity), 3);
    // estoque baixou de 10 para 7
    const [[pr]] = await db.query('SELECT estoque FROM products WHERE id = ?', [prod]);
    assert.strictEqual(Number(pr.estoque), 7);
    // os dois itens ligados foram marcados; o sem produto não
    const [[marc]] = await db.query('SELECT COUNT(*) n FROM demanda_itens WHERE pedido_id = ? AND order_id = ?', [p.insertId, orderId]);
    assert.strictEqual(Number(marc.n), 2);
  } finally {
    await cleanup();
  }
});

test('gerarVendas ignora item já vendido e reporta estoque insuficiente em falhas', async () => {
  try {
    const cli = await seedClient();
    const prod = await seedProduct(1); // estoque só 1
    const [p] = await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)', [cli]);
    // pede/recebe 2 mas só há 1 em estoque -> falha
    await db.query('INSERT INTO demanda_itens (pedido_id, codigo, qtd_pedida, qtd_recebida, product_id, status) VALUES (?,?,?,?,?,?)', [p.insertId, 'A', 2, 2, prod, 'veio']);
    const res = mockRes();
    await gerarVendas({ body: { payment_method: 'DINHEIRO' } }, res);
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.body.geradas.length, 0);
    assert.strictEqual(res.body.falhas.length, 1);
    // nada foi baixado nem marcado
    const [[pr]] = await db.query('SELECT estoque FROM products WHERE id = ?', [prod]);
    assert.strictEqual(Number(pr.estoque), 1);
    const [[marc]] = await db.query('SELECT COUNT(*) n FROM demanda_itens WHERE pedido_id = ? AND order_id IS NOT NULL', [p.insertId]);
    assert.strictEqual(Number(marc.n), 0);
  } finally {
    await cleanup();
  }
});

test('gerarVendas rejeita payment_method inválido (400)', async () => {
  const res = mockRes();
  await gerarVendas({ body: { payment_method: 'BOLETO' } }, res);
  assert.strictEqual(res.statusCode, 400);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/gerar-vendas.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL — `gerarVendas` é `undefined` (ainda não existe/exportado).

- [ ] **Step 3: Implementar `gerarVendas`**

Em `src/controllers/demandaController.js`, no topo (junto dos outros requires), garantir:

```js
const { resolvePixPercent, aplicaPix, getDescontoPix } = require('../utils/pricing');
const { inserirVendaTx } = require('./orderController');
const VALID_PAYMENT_METHODS = ['PIX', 'DINHEIRO', 'CARTÃO DE CRÉDITO', 'PARCELADO', 'PAGAMENTO COMBINADO'];
```

Adicionar a função:

```js
// POST /api/demanda/gerar-vendas — gera a venda de todos os pedidos elegíveis (recebidos + com produto ligado)
async function gerarVendas(req, res) {
  const paymentMethod = String(req.body.payment_method || 'DINHEIRO').toUpperCase();
  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ error: 'Método de pagamento inválido.' });
  try {
    const [linhas] = await db.query(
      `SELECT di.id AS demanda_item_id, di.pedido_id, dp.client_id, cl.name AS cliente,
              di.product_id, di.qtd_recebida, COALESCE(di.preco_venda, p.sale_value) AS preco, p.cost AS cost
       FROM demanda_itens di
       JOIN demanda_pedidos dp ON dp.id = di.pedido_id
       JOIN clients cl ON cl.id = dp.client_id
       LEFT JOIN products p ON p.id = di.product_id
       WHERE di.qtd_recebida > 0 AND di.product_id IS NOT NULL AND di.order_id IS NULL
       ORDER BY di.pedido_id`);
    const [semProduto] = await db.query(
      `SELECT cl.name AS cliente, di.nome
       FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id = di.pedido_id JOIN clients cl ON cl.id = dp.client_id
       WHERE di.qtd_recebida > 0 AND di.product_id IS NULL AND di.order_id IS NULL`);

    // agrupa por pedido; dentro do pedido, agrega por product_id (PK de order_products é (order_id, product_id))
    const porPedido = new Map();
    for (const l of linhas) {
      if (!porPedido.has(l.pedido_id)) porPedido.set(l.pedido_id, { client_id: l.client_id, cliente: l.cliente, produtos: new Map() });
      const g = porPedido.get(l.pedido_id);
      if (!g.produtos.has(l.product_id)) g.produtos.set(l.product_id, { id: l.product_id, salePrice: Number(l.preco) || 0, quantity: 0, productCost: l.cost != null ? Number(l.cost) : null, itemIds: [] });
      const pp = g.produtos.get(l.product_id);
      pp.quantity += Number(l.qtd_recebida);
      pp.itemIds.push(l.demanda_item_id);
    }

    const geradas = [], falhas = [];
    let totalGeral = 0;
    const pixGlobal = paymentMethod === 'PIX' ? await getDescontoPix() : 0;
    for (const [, g] of porPedido) {
      let effProducts = Array.from(g.produtos.values());
      const demandaItemIds = effProducts.reduce((acc, pp) => acc.concat(pp.itemIds), []);
      if (paymentMethod === 'PIX') {
        const [[cli]] = await db.query('SELECT pix_discount_percent FROM clients WHERE id = ?', [g.client_id]);
        const pixPct = resolvePixPercent(cli ? cli.pix_discount_percent : null, pixGlobal);
        if (pixPct > 0) effProducts = effProducts.map(pp => Object.assign({}, pp, { salePrice: aplicaPix(pp.salePrice, pixPct) }));
      }
      const effTotal = Number(effProducts.reduce((s, pp) => s + pp.salePrice * pp.quantity, 0).toFixed(2));
      const conn = await db.getConnection();
      try {
        await conn.beginTransaction();
        const { orderId, total } = await inserirVendaTx(conn, {
          clientId: g.client_id, paymentMethod, installments: null, combinedPaymentValue: null,
          effProducts, effTotal, demandaItemIds
        });
        await conn.commit();
        geradas.push({ cliente: g.cliente, order_id: orderId, total });
        totalGeral += Number(total);
      } catch (e) {
        await conn.rollback();
        falhas.push({ cliente: g.cliente, erro: e.message });
      } finally { conn.release(); }
    }
    return res.json({
      geradas, falhas,
      sem_produto: semProduto.map(s => ({ cliente: s.cliente, nome: s.nome })),
      total_geral: Number(totalGeral.toFixed(2))
    });
  } catch (e) { console.error('gerarVendas', e); return res.status(500).json({ error: 'Erro ao gerar vendas.' }); }
}
```

No `module.exports` do controller, acrescentar `gerarVendas`.

- [ ] **Step 4: Registrar a rota**

Em `src/routes/demanda.js`, junto das rotas fixas (antes de `router.post('/', ...)`, ex.: após a linha `router.post('/conciliar-manual', c.conciliarManual);`), adicionar:

```js
router.post('/gerar-vendas', c.gerarVendas);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --test test/gerar-vendas.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: 0 `not ok` (todos os testes de `remanejarAlocacao` e `gerarVendas` passam).

- [ ] **Step 6: Regressão de orders/demanda**

Run: `node --test test/demanda-venda.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: 0 `not ok`.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/demandaController.js src/routes/demanda.js test/gerar-vendas.test.js
git commit -m "feat(demanda): endpoint gerar-vendas (batch, baixa estoque, agrega por produto)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: "Puxar da NF" liga o produto (front)

**Files:**
- Modify: `src/public/demanda.html:300-311` (loop de pré-marca em `renderConferenciaPedido`)

**Interfaces:**
- Consumes: `PUT /alocacao` aceitando `product_id` (Task 1). Os itens da NF (`conf.itens`) já trazem `product_id` (`conferirNf` retorna `MAX(i.product_id)`).
- Produces: ao pré-marcar por nome, o item do pedido fica com `product_id` ligado.

- [ ] **Step 1: Enviar `product_id` no PUT da pré-marca**

Em `src/public/demanda.html`, dentro de `renderConferenciaPedido`, na chamada do `alocacao` (hoje linha ~308), incluir o `product_id` do item da NF casado quando existir. Substituir:

```js
        const rr = await Auth.apiFetch('/api/demanda/itens/'+i.id+'/alocacao', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ qtd_recebida: qtd }) });
```

por:

```js
        const payload = { qtd_recebida: qtd };
        if (best.product_id) payload.product_id = best.product_id;
        const rr = await Auth.apiFetch('/api/demanda/itens/'+i.id+'/alocacao', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
```

- [ ] **Step 2: Verificação manual (o projeto não testa UI)**

Subir local numa porta livre e conferir no navegador (não usar a 3000):
Run: `PORT=3098 node src/server.js & SP=$!; sleep 4; echo "abra http://localhost:3098/demanda.html"; ` (deixe rodando o suficiente para testar; depois `kill $SP`).
Passos: abrir um pedido com itens pendentes cujo nome bate com a NF → "Puxar da NF" → escolher a NF → voltar ao pedido. Verificar no banco que os itens pré-marcados ficaram com `product_id` preenchido:
`SELECT id, nome, qtd_recebida, product_id FROM demanda_itens WHERE pedido_id = <ID>;`
Expected: os itens que a NF trouxe ficam com `product_id` não-nulo.

- [ ] **Step 3: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): Puxar da NF liga o produto ao item (habilita a venda)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Aviso no "Gerar venda" + botão "Gerar todas as vendas" (front)

**Files:**
- Modify: `src/public/demanda.html:221-227` (handler `btn-gerar-venda`)
- Modify: `src/public/demanda.html:122-134` (`carregarPedidos` — botão no topo) e adicionar `gerarTodasVendas`

**Interfaces:**
- Consumes: `GET /:id/rascunho-venda` (itens vendáveis), `GET /:id` (itens com `product_id`/`qtd_recebida`), `POST /gerar-vendas` (Task 3).
- Produces: nenhum consumidor a jusante.

- [ ] **Step 1: Aviso de itens recebidos sem produto no "Gerar venda"**

Em `src/public/demanda.html`, substituir o handler `document.getElementById('btn-gerar-venda').onclick = async () => { ... }` (hoje linhas ~221-227) por:

```js
        document.getElementById('btn-gerar-venda').onclick = async () => {
          const semProd = p.itens.filter(i => Number(i.qtd_recebida) > 0 && !i.product_id);
          const rr = await Auth.apiFetch('/api/demanda/'+id+'/rascunho-venda');
          const rasc = await rr.json();
          if (!rasc.itens || !rasc.itens.length) {
            const dica = semProd.length
              ? 'Há itens marcados como recebidos, mas sem produto ligado. Use "Puxar da NF" para ligá-los ao estoque.'
              : 'Não há itens com produto e quantidade recebida para vender.';
            return Swal.fire('Nada a vender ainda', dica, 'info');
          }
          if (semProd.length) {
            const lista = semProd.map(i => '• ' + esc(i.nome || i.codigo || '')).join('<br>');
            const go = await Swal.fire({ title: 'Alguns itens ficam de fora', icon: 'warning',
              html: 'Estes itens vieram mas não têm produto ligado (não entram na venda):<br><br>' + lista + '<br><br>Use "Puxar da NF" para ligá-los. Gerar a venda com o resto?',
              showCancelButton: true, confirmButtonText: 'Gerar assim mesmo', cancelButtonText: 'Voltar' });
            if (!go.isConfirmed) return;
          }
          sessionStorage.setItem('rascunhoVenda', JSON.stringify(rasc));
          window.location.href = 'pedidos.html';
        };
```

- [ ] **Step 2: Botão "Gerar todas as vendas" na lista de pedidos**

Em `carregarPedidos`, adicionar um botão acima da lista. Substituir o corpo de `carregarPedidos` (linhas ~122-134) por:

```js
  async function carregarPedidos(){
    const r = await Auth.apiFetch('/api/demanda'); const pedidos = await r.json();
    const cards = pedidos.map(p => `
      <div class="card mb-2"><div class="card-body">
        <div class="d-flex justify-content-between">
          <strong>${esc(p.client_name)}</strong>
          <span class="badge bg-secondary">${esc(p.status)} · ${p.qtd_itens} itens</span>
        </div>
        ${p.observacao ? `<div class="text-muted small">${esc(p.observacao)}</div>` : ''}
        <button class="btn btn-sm btn-outline-primary mt-2" onclick="abrirPedido(${p.id})">Abrir</button>
        <button class="btn btn-sm btn-outline-danger mt-2 ms-1" onclick="excluirPedido(${p.id})">Excluir</button>
      </div></div>`).join('') || '<p class="text-muted">Nenhum pedido ainda.</p>';
    const topo = pedidos.length
      ? `<div class="mb-3"><button id="btn-gerar-todas" class="btn btn-success"><i class="bi bi-cash-coin"></i> Gerar todas as vendas</button>
           <span class="text-muted small ms-2">Gera a venda do que veio em todos os pedidos (baixa o estoque).</span></div>`
      : '';
    $('#lista-pedidos').innerHTML = topo + cards;
    const btnTodas = document.getElementById('btn-gerar-todas');
    if (btnTodas) btnTodas.onclick = gerarTodasVendas;
  }

  async function gerarTodasVendas(){
    const conf = await Swal.fire({
      title: 'Gerar todas as vendas?', icon: 'question',
      html: 'Vai gerar a venda do que veio em todos os pedidos e baixar o estoque.<br><br>Forma de pagamento:'
        + '<select id="gv-pgto" class="form-select mt-2"><option value="DINHEIRO">Dinheiro</option><option value="PIX">PIX</option></select>',
      showCancelButton: true, confirmButtonText: 'Gerar', cancelButtonText: 'Cancelar',
      preConfirm: () => document.getElementById('gv-pgto').value
    });
    if (!conf.isConfirmed) return;
    const r = await Auth.apiFetch('/api/demanda/gerar-vendas', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ payment_method: conf.value }) });
    const d = await r.json();
    if (!r.ok) return Swal.fire('Erro', d.error || '', 'error');
    let html = '';
    if (d.geradas.length) html += `<b>${d.geradas.length}</b> venda(s) gerada(s). Total: <b>R$ ${Number(d.total_geral).toFixed(2)}</b><br>`;
    else html += 'Nenhuma venda gerada.<br>';
    if (d.falhas.length) html += '<br><b>Não deu para gerar:</b><br>' + d.falhas.map(f => '• ' + esc(f.cliente) + ' — ' + esc(f.erro)).join('<br>');
    if (d.sem_produto.length) html += '<br><br><b>Itens sem produto ligado (ficaram de fora):</b><br>' + d.sem_produto.map(s => '• ' + esc(s.cliente) + ': ' + esc(s.nome || '')).join('<br>');
    await Swal.fire({ title: 'Resultado', icon: d.geradas.length ? 'success' : 'info', html });
    carregarPedidos();
  }
```

- [ ] **Step 3: Verificação manual**

Subir local (porta livre, não a 3000):
Run: `PORT=3097 node src/server.js & SP=$!; sleep 4; echo "abra http://localhost:3097/demanda.html"; ` (teste e depois `kill $SP`).
Passos: (a) num pedido com item recebido sem produto, "Gerar venda do que veio" mostra o aviso listando o item; (b) na aba de pedidos, "Gerar todas as vendas" → escolher Dinheiro → ver o resumo (vendas geradas + total; itens sem produto listados). Conferir no banco que as `orders`/`order_products` foram criadas e o estoque baixou.

- [ ] **Step 4: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): aviso de itens sem produto + botao Gerar todas as vendas

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notas de execução

- Ordem obrigatória: Task 1 → 2 → 3 (backend, com dependências) → 4 → 5 (front). A Task 1 e a Task 3 compartilham `test/gerar-vendas.test.js`: a Task 1 cria o arquivo com o import reduzido; a Task 3 restaura o import completo e adiciona os testes do batch.
- Circular require: `demandaController` passa a requerer `orderController` (para `inserirVendaTx`); `orderController` não requer `demandaController`, então não há ciclo.
- Após todas as tasks, rodar a suíte relacionada uma vez para garantir verde: `node --test test/gerar-vendas.test.js test/demanda-venda.test.js & TP=$!; sleep 30; kill $TP 2>/dev/null` (0 `not ok`).
