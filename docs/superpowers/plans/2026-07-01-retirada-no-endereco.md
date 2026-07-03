# Retirada no endereço do vendedor (pickup) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No checkout da loja, permitir escolher **Retirada** (buscar com o vendedor): frete R$ 0, sem endereço, sem restrição de cidade; endereço de retirada configurável no painel; método gravado no pedido.

**Architecture:** Migração adiciona `delivery_method` em orders/payment_intents e o setting `endereco_retirada`. Um helper normaliza o método; `resumo` e os dois fluxos de pagamento zeram o frete e pulam a cidade quando é retirada; o checkout mostra um seletor e esconde o endereço; painel configura o endereço; telas de pedido exibem "Retirada".

**Tech Stack:** Node 22 (Express, MySQL, mysql2/promise), Bootstrap 5, `node:test`.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Método: `'retirada'` só quando `String(body.deliveryMethod||'').toLowerCase() === 'retirada'`; qualquer outro valor → `'entrega'` (padrão seguro).
- Retirada: `delivery_fee = 0`, **pula** `cidadeAtende`/`freteDoBairro`, sem exigir endereço.
- Servidor autoritativo: o front NÃO decide o frete; o backend força 0 na retirada.
- Migrações idempotentes (try/catch ADD COLUMN). Só afeta a loja online.

---

### Task 1: Fundação — migração + util + helper de método

**Files:**
- Modify: `src/database/connection.js` (bloco de migrações, antes de `conn.release()`)
- Modify: `src/utils/delivery.js` (novo `getEnderecoRetirada` + export)
- Modify: `src/controllers/storeOrderController.js` (novo `metodoEntrega` + export)
- Test: `test/retirada-fundacao.test.js`

**Interfaces:**
- Produces:
  - `getEnderecoRetirada() → Promise<string>` (de `utils/delivery`)
  - `metodoEntrega(body) → 'entrega' | 'retirada'` (de `storeOrderController`)

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/retirada-fundacao.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { getEnderecoRetirada } = require('../src/utils/delivery');
const { metodoEntrega } = require('../src/controllers/storeOrderController');

test('metodoEntrega: só "retirada" (case-insensitive) vira retirada; resto é entrega', () => {
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'retirada' }), 'retirada');
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'RETIRADA' }), 'retirada');
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'entrega' }), 'entrega');
  assert.strictEqual(metodoEntrega({ deliveryMethod: 'x' }), 'entrega');
  assert.strictEqual(metodoEntrega({}), 'entrega');
  assert.strictEqual(metodoEntrega(null), 'entrega');
});

test('getEnderecoRetirada: lê o setting endereco_retirada', async () => {
  await db.query("INSERT INTO store_settings (skey, svalue) VALUES ('endereco_retirada', ?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)", ['Rua Teste, 100 — Centro']);
  assert.strictEqual(await getEnderecoRetirada(), 'Rua Teste, 100 — Centro');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/retirada-fundacao.test.js`
Expected: FAIL — `metodoEntrega`/`getEnderecoRetirada` não existem (TypeError). (`--test-force-exit` porque o require abre o pool MySQL.)

- [ ] **Step 3: Migrações em `connection.js`**

Em `src/database/connection.js`, imediatamente antes de `conn.release();` (junto às outras migrações idempotentes), inserir:

```js
    // Migração: método de entrega (entrega/retirada) + endereço de retirada
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'",
      "ALTER TABLE payment_intents ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'",
    ]) { try { await conn.query(sql); } catch (_) {} }
    try { await conn.query("INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('endereco_retirada', '')"); } catch (_) {}
```

- [ ] **Step 4: `getEnderecoRetirada` em `utils/delivery.js`**

Em `src/utils/delivery.js`, adicionar a função e incluir no `module.exports`:

```js
async function getEnderecoRetirada() { return getSetting('endereco_retirada', ''); }
```
No `module.exports`, acrescentar `getEnderecoRetirada`.

- [ ] **Step 5: `metodoEntrega` em `storeOrderController.js`**

Em `src/controllers/storeOrderController.js`, adicionar a função e incluir no `module.exports`:

```js
// Normaliza o método de entrega do body: só 'retirada' (case-insensitive) conta; resto é 'entrega'.
function metodoEntrega(body) {
  return (body && String(body.deliveryMethod || '').toLowerCase() === 'retirada') ? 'retirada' : 'entrega';
}
```
No `module.exports`, acrescentar `metodoEntrega`.

- [ ] **Step 6: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/retirada-fundacao.test.js`
Expected: PASS — 2 testes verdes. Encerrar node pendente (liberar porta 3000).

> Nota: as migrações rodam no boot do app. Se o teste rodar antes de qualquer boot nesta branch, as colunas podem não existir ainda; suba o app uma vez (`node src/app.js` por ~4s e encerre) para aplicar as migrações no `db_pedidos_teste` antes de rodar os testes das próximas tasks.

- [ ] **Step 7: Commit**

```bash
git add src/database/connection.js src/utils/delivery.js src/controllers/storeOrderController.js test/retirada-fundacao.test.js
git commit -m "feat(retirada): migração delivery_method + endereco_retirada, getEnderecoRetirada, metodoEntrega"
```

---

### Task 2: Backend do pedido/pagamento (frete 0 na retirada)

**Files:**
- Modify: `src/controllers/storeOrderController.js` (`resumo` ~76-102; `criarPedidoPago` ~150-165)
- Modify: `src/controllers/paymentController.js` (fluxo cartão ~13-47; fluxo PIX ~200-226; `confirmarIntencao` chamada a `criarPedidoPago` ~97-101)
- Test: `test/retirada-backend.test.js`

**Interfaces:**
- Consumes (Task 1): `metodoEntrega(body)`, `getEnderecoRetirada()`, colunas `delivery_method`.
- Produces: `resumo` e pagamentos respeitam retirada; `criarPedidoPago({..., deliveryMethod})` grava `orders.delivery_method`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/retirada-backend.test.js` (usa transação real via pool, semeia e limpa):

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const store = require('../src/controllers/storeOrderController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; } };
}

// cria um cliente + produto p/ o teste
async function seed() {
  const [c] = await db.query("INSERT INTO clients (name, city) VALUES ('ZZ Retirada', 'Cidade Fora XYZ')");
  const [p] = await db.query("INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES ('ZZ Prod Retirada', 1, 20, 'Outros', ?, 50)", ['ZZR'+Date.now()]);
  return { cid: c.insertId, pid: p.insertId };
}
async function cleanup(s, orderId) {
  if (orderId) { await db.query('DELETE FROM order_products WHERE order_id=?', [orderId]); await db.query('DELETE FROM orders WHERE id=?', [orderId]); }
  await db.query('DELETE FROM estoque_movimentacoes WHERE product_id=?', [s.pid]);
  await db.query('DELETE FROM products WHERE id=?', [s.pid]);
  await db.query('DELETE FROM clients WHERE id=?', [s.cid]);
}

test('resumo: retirada zera o frete e ignora a cidade (cliente de fora)', async () => {
  const s = await seed();
  const res = mockRes();
  await store.resumo({ customer: { id: s.cid }, body: { items: [{ id: s.pid, qty: 2 }], deliveryMethod: 'retirada' } }, res);
  assert.strictEqual(res.statusCode, 200);
  assert.strictEqual(res.body.deliveryFee, 0);
  assert.strictEqual(res.body.total, res.body.subtotal);
  assert.strictEqual(res.body.deliveryMethod, 'retirada');
  await cleanup(s);
});

test('criarPedidoPago: grava delivery_method=retirada e delivery_fee=0', async () => {
  const s = await seed();
  const conn = await db.getConnection();
  let orderId;
  try {
    await conn.beginTransaction();
    orderId = await store.criarPedidoPago(conn, {
      clientId: s.cid,
      lines: [{ id: s.pid, qty: 1, unitPrice: 20, costPrice: null }],
      fee: 0, total: 20, paymentMethod: 'PIX', mpPaymentId: null, deliveryMethod: 'retirada'
    });
    await conn.commit();
  } finally { conn.release(); }
  const [[o]] = await db.query('SELECT delivery_method, delivery_fee FROM orders WHERE id=?', [orderId]);
  assert.strictEqual(o.delivery_method, 'retirada');
  assert.strictEqual(Number(o.delivery_fee), 0);
  await cleanup(s, orderId);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/retirada-backend.test.js`
Expected: FAIL — `resumo` ainda calcula frete/checa cidade e não retorna `deliveryMethod`; `criarPedidoPago` não aceita/grava `deliveryMethod`.

- [ ] **Step 3: `resumo` respeita retirada**

Em `src/controllers/storeOrderController.js`, na função `resumo`, substituir o bloco que vai de `const addr = effectiveAddress(client, req.body);` até `const total = Number((subtotal + fee).toFixed(2));` por:

```js
    const metodo = metodoEntrega(req.body);
    let fee = 0;
    if (metodo === 'entrega') {
      const addr = effectiveAddress(client, req.body);
      if (addr.city && !(await cidadeAtende(addr.city))) {
        return res.status(400).json({ error: 'Entregamos apenas em ' + (await getCidadeEntrega()) + '.', foraDeArea: true });
      }
      fee = await freteDoBairro(addr.neighborhood);
    }
    const total = Number((subtotal + fee).toFixed(2));
```

E no `return res.json({...})` do `resumo`, acrescentar dois campos ao objeto:

```js
      subtotal, deliveryFee: fee, total,
      deliveryMethod: metodo,
      enderecoRetirada: metodo === 'retirada' ? await getEnderecoRetirada() : null,
```
(substitui a linha `subtotal, deliveryFee: fee, total,` existente). Importar `getEnderecoRetirada` no topo do arquivo junto ao require de `../utils/delivery`.

- [ ] **Step 4: `criarPedidoPago` grava o método**

Em `criarPedidoPago`, adicionar `deliveryMethod` ao destructuring dos parâmetros e à coluna do INSERT:

Trocar a assinatura:
```js
async function criarPedidoPago(conn, { clientId, lines, fee, total, paymentMethod, mpPaymentId, deliveryMethod }) {
```
Trocar o INSERT de orders para incluir a coluna:
```js
  const metodo = deliveryMethod === 'retirada' ? 'retirada' : 'entrega';
  const [orderResult] = await conn.query(
    "INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee, origin, payment_status, mp_payment_id, delivery_method) " +
    "VALUES (?, ?, NULL, ?, NULL, ?, 'loja', 'pago', ?, ?)",
    [clientId, paymentMethod, Number(total), Number(fee), mpPaymentId || null, metodo]
  );
```

- [ ] **Step 5: Pagamentos (cartão + PIX) respeitam retirada**

Em `src/controllers/paymentController.js`, importar `metodoEntrega` do store no topo (ex.: `const { ... } = require(...)` já traz `store`; usar `store.metodoEntrega`). Nos **dois** blocos idênticos (fluxo cartão ~linhas 21-46 e fluxo PIX ~204-226), substituir o trecho que vai de `const addr = store.effectiveAddress(client, req.body);` até o `INSERT INTO payment_intents ... VALUES (...)` por:

```js
    const metodo = store.metodoEntrega(req.body);
    const addr = store.effectiveAddress(client, req.body);
    const addressChanged = store.hasAddress(req.body);
    let fee = 0;
    if (metodo === 'entrega') {
      if (addr.city && !(await cidadeAtende(addr.city))) {
        return res.status(400).json({ error: 'Entregamos apenas em ' + (await getCidadeEntrega()) + '.', foraDeArea: true });
      }
      fee = await freteDoBairro(addr.neighborhood);
    }
    const total = Number((subtotal + fee).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Total inválido.' });

    // Persiste o endereço no cadastro só quando é entrega e foi editado
    if (metodo === 'entrega' && addressChanged) {
      await db.query(
        'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=? WHERE id=?',
        [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, client.id]
      );
    }

    const snapshot = linhas.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
    const externalReference = crypto.randomBytes(32).toString('hex');

    const [ins] = await db.query(
      `INSERT INTO payment_intents
       (client_id, external_reference, items_json, address, house_number, neighborhood, cep, city, subtotal, delivery_fee, total, status, delivery_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
      [client.id, externalReference, JSON.stringify(snapshot), addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, subtotal, fee, total, metodo]
    );
```
(Aplicar o MESMO substituto nos dois fluxos. O restante de cada função — criar preferência/PIX — permanece.)

- [ ] **Step 6: Confirmação passa o método ao criar o pedido**

Em `paymentController.js`, na `confirmarIntencao`, a chamada `await store.criarPedidoPago(conn, { ... fee: intent.delivery_fee, ... })` passa a incluir `deliveryMethod: intent.delivery_method`.

- [ ] **Step 7: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/retirada-backend.test.js`
Expected: PASS — 2 verdes. `node -e "require('./src/controllers/paymentController'); console.log('OK')"` imprime OK (sanidade de require). Encerrar node.

- [ ] **Step 8: Commit**

```bash
git add src/controllers/storeOrderController.js src/controllers/paymentController.js test/retirada-backend.test.js
git commit -m "feat(retirada): resumo e pagamentos zeram frete e pulam cidade; pedido grava o método"
```

---

### Task 3: Config do painel (endereço de retirada)

**Files:**
- Modify: `src/controllers/deliveryZonesController.js` (`salvarSettings`, `listar`)
- Modify: `src/controllers/storeController.js` (`entregaConfig`)
- Modify: `src/public/entrega.html` (campo + carregar/salvar)

**Interfaces:**
- Consumes: store_settings `endereco_retirada`.
- Produces: `GET /api/loja/entrega/config` retorna `enderecoRetirada`; a página Entrega edita o valor.

- [ ] **Step 1: `salvarSettings` grava e `listar` retorna o endereço**

Em `src/controllers/deliveryZonesController.js`:
- Em `salvarSettings`, após gravar `cidade_entrega` e `frete_padrao`, adicionar:
```js
    const enderecoRetirada = String(req.body.enderecoRetirada || '').slice(0, 255);
    await db.query("INSERT INTO store_settings (skey, svalue) VALUES ('endereco_retirada', ?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)", [enderecoRetirada]);
```
- Em `listar`, incluir no retorno: importar `getEnderecoRetirada` de `../utils/delivery` e retornar `enderecoRetirada: await getEnderecoRetirada()` no objeto do `res.json`.

- [ ] **Step 2: `entregaConfig` retorna o endereço de retirada**

Em `src/controllers/storeController.js`, na função `entregaConfig`, importar `getEnderecoRetirada` de `../utils/pricing`? Não — de `../utils/delivery`. Acrescentar `enderecoRetirada: await getEnderecoRetirada()` ao objeto retornado por `res.json`. (Ler a função para achar o objeto exato.)

- [ ] **Step 3: Campo na página Entrega**

Em `src/public/entrega.html`, na seção de configurações (onde ficam cidade e frete padrão), adicionar um `<textarea id="endereco-retirada">` com label "Endereço de retirada (o cliente busca aqui)". No JS que carrega o config, preencher `endereco-retirada.value = data.enderecoRetirada || ''`. No submit que chama o salvar, incluir `enderecoRetirada: document.getElementById('endereco-retirada').value` no corpo enviado. (Ler o arquivo para achar os anchors exatos do form e do fetch de salvar.)

- [ ] **Step 4: Verificar**

```bash
node -e "require('./src/controllers/deliveryZonesController'); require('./src/controllers/storeController'); console.log('controllers OK')"
node -e "const h=require('fs').readFileSync('src/public/entrega.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('entrega.html parse OK; campo:', h.includes('endereco-retirada'));"
```
Expected: `controllers OK` e `entrega.html parse OK; campo: true`.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/deliveryZonesController.js src/controllers/storeController.js src/public/entrega.html
git commit -m "feat(retirada): painel Entrega configura o endereço de retirada"
```

---

### Task 4: Checkout — seletor de entrega/retirada

**Files:**
- Modify: `src/public/loja/checkout.html` (seção de endereço + JS de resumo/pagamento)

**Interfaces:**
- Consumes: `GET /api/loja/entrega/config` (`enderecoRetirada`); `/resumo` e pagamentos aceitam `deliveryMethod`.

- [ ] **Step 1: Seletor + card de retirada no markup**

Em `src/public/loja/checkout.html`, no início da `<section>` de "Endereço de entrega" (antes do bloco `#addr-source`), adicionar um seletor de método:
```html
<div id="metodo-entrega" class="field" role="radiogroup" aria-label="Como receber" style="margin-bottom:1rem">
  <label style="display:flex;gap:.5rem;align-items:center;cursor:pointer;margin-bottom:.4rem">
    <input type="radio" name="metodo" id="metodo-entrega-opt" value="entrega" checked> Receber no meu endereço
  </label>
  <label style="display:flex;gap:.5rem;align-items:center;cursor:pointer">
    <input type="radio" name="metodo" id="metodo-retirada-opt" value="retirada"> Retirar com o vendedor — grátis
  </label>
</div>
<div id="bloco-retirada" style="display:none;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:.9rem 1rem;margin-bottom:1rem">
  <div style="font-weight:700;margin-bottom:.3rem"><i class="bi bi-shop"></i> Retirada com o vendedor</div>
  <div id="endereco-retirada-txt" style="font-size:.9rem;color:var(--text-soft);white-space:pre-line"></div>
  <div style="font-size:.85rem;color:var(--success);margin-top:.4rem">Frete: Grátis</div>
</div>
```
Envolver o bloco de endereço atual (o form `#address-form` + `#addr-source`) num contêiner `<div id="bloco-entrega">…</div>` para poder esconder tudo de uma vez.

- [ ] **Step 2: Estado + toggle no JS**

No `<script>` do checkout, adicionar:
- Uma variável `metodoAtual = 'entrega'` e a leitura de `enderecoRetirada` do `/api/loja/entrega/config` (a página já faz esse fetch; guardar `cfg.enderecoRetirada`).
- Listeners nos radios `#metodo-entrega-opt`/`#metodo-retirada-opt` que setam `metodoAtual`, alternam `#bloco-entrega`/`#bloco-retirada` (display) e preenchem `#endereco-retirada-txt` com `cfg.enderecoRetirada || 'Combine o local com o vendedor pelo WhatsApp.'`, depois chamam `atualizarResumo()`.
- Em `atualizarResumo()` e na finalização do pagamento, incluir `deliveryMethod: metodoAtual` no corpo enviado a `/api/loja/checkout/resumo` e aos endpoints de pagamento.
- Quando `metodoAtual === 'retirada'`, **não** aplicar bloqueio por `foraDeArea` (garantir que o botão finalizar fique habilitado).

(Ler o `<script>` do checkout para casar os nomes reais: a função que monta o corpo do resumo, a que chama o pagamento, e onde `cfg`/config é carregado.)

- [ ] **Step 3: Verificar o parse do HTML/JS**

```bash
node -e "const h=require('fs').readFileSync('src/public/loja/checkout.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; seletor:', h.includes('id=\"metodo-entrega\"'), '| bloco retirada:', h.includes('bloco-retirada'), '| envia metodo:', h.includes('deliveryMethod'));"
```
Expected: `parse OK; seletor: true | bloco retirada: true | envia metodo: true`.

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(retirada): checkout com seletor entrega/retirada (esconde endereço, frete grátis)"
```

---

### Task 5: Telas de pedido exibem "Retirada"

**Files:**
- Modify: `src/controllers/storeOrderController.js` (`detalhePedido` — SELECT inclui `o.delivery_method`)
- Modify: `src/public/loja/pedido.html` e `src/public/loja/meus-pedidos.html` (exibir Retirada)
- Modify: `src/public/pedidos.html` (detalhe do pedido no painel — exibir Retirada) e o endpoint que ele consome (se o SELECT do detalhe do painel não trouxer `delivery_method`, incluir)

**Interfaces:**
- Consumes: `orders.delivery_method`, `getEnderecoRetirada()`.

- [ ] **Step 1: Endpoints retornam `delivery_method`**

Em `storeOrderController.detalhePedido`, adicionar `o.delivery_method` ao SELECT. No detalhe do painel (o controller que a `pedidos.html` usa — provavelmente `orderController`/rota `/api/orders/:id`), incluir `delivery_method` no SELECT do pedido. (Ler para achar o SELECT exato.)

- [ ] **Step 2: Exibir no cliente**

Em `pedido.html` e `meus-pedidos.html`, onde o endereço de entrega do pedido é mostrado, quando `delivery_method === 'retirada'` exibir "Retirada com o vendedor" (e o frete como "Grátis") no lugar do endereço. (Ler os anchors do render.)

- [ ] **Step 3: Exibir no painel**

Em `pedidos.html`, no detalhe do pedido (modal/impressão), quando `delivery_method === 'retirada'`, mostrar "Retirada" em vez do endereço de entrega.

- [ ] **Step 4: Verificar parse**

```bash
node -e "['src/public/loja/pedido.html','src/public/loja/meus-pedidos.html','src/public/pedidos.html'].forEach(f=>{const h=require('fs').readFileSync(f,'utf8');const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,'');new Function(s);}); console.log('parse OK das 3 telas');"
node -e "require('./src/controllers/storeOrderController'); console.log('controller OK')"
```
Expected: `parse OK das 3 telas` e `controller OK`.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeOrderController.js src/public/loja/pedido.html src/public/loja/meus-pedidos.html src/public/pedidos.html
git commit -m "feat(retirada): pedidos exibem Retirada (loja e painel)"
```

---

## Verificação final (após as 5 tasks)

- [ ] Subir o app uma vez p/ aplicar migrações; `node --test --test-force-exit test/retirada-fundacao.test.js test/retirada-backend.test.js` → todos verdes; encerrar node (porta 3000 livre).
- [ ] Teste manual (opcional): no checkout, alternar Entrega/Retirada — retirada some com o endereço, mostra o card e frete grátis; finalizar um pedido de retirada e conferir que aparece "Retirada" no painel.
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
- [ ] Migração roda 1x na produção no próximo deploy (colunas aditivas + setting), sem ação manual.
