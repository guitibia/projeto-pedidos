# Loja — Sub-projeto 3: Checkout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cliente logado finaliza o carrinho: confirma itens, endereço (com busca por CEP) e frete, e cria o pedido no banco como Pendente / A COMBINAR; acompanha em Meus pedidos.

**Architecture:** Reuso de `orders`/`order_products`/`estoque_movimentacoes`. Novo `storeOrderController` + router `routes/lojaPedidos.js` em `/api/loja` (protegido por `customerAuth`). O servidor recalcula preço e frete do banco — o carrinho do cliente nunca é fonte de verdade. Páginas em `src/public/loja/` no design Clean Boutique, reusando `cart.js`/`loja.js`/`account.js`.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), `utils/geo` (Nominatim), ViaCEP (client-side), HTML/CSS/JS vanilla.

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`.
- CommonJS; migrações no startup de `connection.js`, cada uma em `try { } catch (_) {}`.
- Todas as rotas de pedido sob `customerAuth` (JWT `type:'customer'`, injeta `req.customer = { id, email }`).
- **Ownership absoluto:** pedidos sempre filtrados por `req.customer.id`; detalhe de pedido de outro cliente → **404** (não vaza existência).
- **Servidor autoritativo:** preço de cada item = `COALESCE(promotion_price, sale_value)` lido do banco; frete via `utils/geo`. O carrinho envia só `{ id, qty }`.
- Pedido da loja: `payment_method='A COMBINAR'`, `origin='loja'`, `installments=NULL`, `combined_payment_value=NULL`, status default `Pendente`, `total_cost = subtotal + delivery_fee`.
- SQL parametrizado; sem testes automatizados — verificar via curl + navegador. Matar `node` antes de testar (`powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`), depois `node src/app.js &`, `sleep 3`.
- Páginas protegidas: sem `loja_token` → `entrar.html?next=<url>`; em 401/403 → `StoreAuth.logout()` + `entrar.html`.
- CEP armazenado com 8 dígitos (sem máscara); cidade do ViaCEP alimenta `geocodeClient(...city)`.

---

### Task 1: Migrações (origin, cep, city, enum A COMBINAR)

**Files:**
- Modify: `src/database/connection.js`

- [ ] **Step 1: Adicionar migrações**

Em `src/database/connection.js`, após o bloco de migrações de conta de cliente (o `for (const sql of [...])` que adiciona email/cpf/etc.), adicionar:
```js
    // Migração: checkout da loja (sub-projeto 3)
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN origin VARCHAR(20) NOT NULL DEFAULT 'painel'",
      'ALTER TABLE clients ADD COLUMN cep VARCHAR(8) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN city VARCHAR(120) DEFAULT NULL',
      "ALTER TABLE orders MODIFY COLUMN payment_method ENUM('PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO','A COMBINAR') NOT NULL",
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 2: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [o]=await db.query('SHOW COLUMNS FROM orders');const pm=o.find(c=>c.Field==='payment_method');console.log('origin:',!!o.find(c=>c.Field==='origin'));console.log('enum tem A COMBINAR:', pm.Type.includes('A COMBINAR'));const [c]=await db.query('SHOW COLUMNS FROM clients');console.log('cep/city:', !!c.find(x=>x.Field==='cep'), !!c.find(x=>x.Field==='city'));process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: `origin: true`, `enum tem A COMBINAR: true`, `cep/city: true true`.

- [ ] **Step 3: Commit**

```bash
git add src/database/connection.js
git commit -m "feat(loja): migrações de checkout (origin, cep, city, enum A COMBINAR)"
```

---

### Task 2: storeOrderController (resumo + criar pedido) + rotas

**Files:**
- Create: `src/controllers/storeOrderController.js`, `src/routes/lojaPedidos.js`
- Modify: `src/app.js`

**Interfaces:**
- Consome: `customerAuth` (`req.customer.id`); `utils/geo` (`geocodeClient(address, houseNumber, neighborhood, city)`, `deliveryFee(lat, lng)`).
- Produz: `POST /api/loja/checkout/resumo`, `POST /api/loja/pedidos`. (Histórico/detalhe na Task 3, mesmo controller/router.)

- [ ] **Step 1: Criar `src/controllers/storeOrderController.js`**

```js
const db = require('../database/connection');
const { deliveryFee, geocodeClient } = require('../utils/geo');

const DEFAULT_CITY = 'São João da Boa Vista';

// normaliza body.items -> [{id:int, qty:int}] (ou null se inválido)
function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const it of raw) {
    const id = parseInt(it && it.id, 10);
    const qty = parseInt(it && it.qty, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(qty) || qty <= 0) return null;
    out.push({ id, qty });
  }
  return out;
}

async function getClient(id) {
  const [[c]] = await db.query(
    'SELECT id, name, address, house_number, neighborhood, cep, city, lat, lng FROM clients WHERE id = ?',
    [id]
  );
  return c;
}

// veio endereço novo no body?
function hasAddress(body) {
  return !!(body && (body.address || body.cep || body.neighborhood));
}

// endereço efetivo: body (se veio) ou o do cadastro
function effectiveAddress(client, body) {
  if (hasAddress(body)) {
    return {
      address: String(body.address || '').trim(),
      house_number: String(body.houseNumber || '').trim(),
      neighborhood: String(body.neighborhood || '').trim(),
      cep: String(body.cep || '').replace(/\D/g, '').slice(0, 8) || null,
      city: String(body.city || '').trim() || client.city || DEFAULT_CITY,
    };
  }
  return {
    address: client.address, house_number: client.house_number,
    neighborhood: client.neighborhood, cep: client.cep,
    city: client.city || DEFAULT_CITY,
  };
}

// frete a partir do endereço efetivo; geocodifica se endereço mudou ou cliente sem coords
async function geocodeFee(addr, client, addressChanged) {
  let lat = client.lat, lng = client.lng;
  if (addressChanged || !lat || !lng) {
    if (addr.address) {
      const coords = await geocodeClient(addr.address, addr.house_number || '', addr.neighborhood || '', addr.city || DEFAULT_CITY);
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }
  }
  const fee = await deliveryFee(lat, lng);
  return { fee, lat, lng };
}

// linhas com preço autoritativo + flags de validação (sem transação — só leitura)
async function buildLines(items) {
  const lines = [];
  for (const it of items) {
    const [[p]] = await db.query(
      'SELECT id, name, image, franchise, estoque, sale_value, promotion_price FROM products WHERE id = ?',
      [it.id]
    );
    if (!p) { lines.push({ id: it.id, qty: it.qty, unitPrice: 0, lineTotal: 0, ok: false, reason: 'Produto indisponível.' }); continue; }
    const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
    const unitPrice = Number(promo ? p.promotion_price : p.sale_value) || 0;
    const enough = p.estoque == null ? true : Number(p.estoque) >= it.qty;
    const ok = enough && unitPrice > 0;
    lines.push({
      id: p.id, name: p.name, image: p.image, franchise: p.franchise,
      unitPrice, qty: it.qty, lineTotal: Number((unitPrice * it.qty).toFixed(2)),
      ok, reason: !enough ? 'Estoque insuficiente.' : (unitPrice <= 0 ? 'Preço indisponível.' : undefined),
    });
  }
  return lines;
}

// POST /api/loja/checkout/resumo — revisão, não grava nada
async function resumo(req, res) {
  const items = parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });
    const lines = await buildLines(items);
    const subtotal = Number(lines.filter(l => l.ok).reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const addr = effectiveAddress(client, req.body);
    const { fee } = await geocodeFee(addr, client, hasAddress(req.body));
    const total = Number((subtotal + fee).toFixed(2));
    return res.json({
      items: lines.map(l => ({
        id: l.id, name: l.name, image: l.image, franchise: l.franchise,
        unitPrice: l.unitPrice || 0, qty: l.qty, lineTotal: l.lineTotal || 0, ok: l.ok, reason: l.reason,
      })),
      subtotal, deliveryFee: fee, total,
    });
  } catch (e) {
    console.error('Erro no resumo do checkout:', e);
    return res.status(500).json({ error: 'Erro ao calcular o resumo.' });
  }
}

// POST /api/loja/pedidos — finaliza (transação)
async function criarPedido(req, res) {
  const items = parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });
    const addr = effectiveAddress(client, req.body);
    const addressChanged = hasAddress(req.body);
    const { fee, lat, lng } = await geocodeFee(addr, client, addressChanged);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      if (addressChanged) {
        await conn.query(
          'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=?, lat=?, lng=? WHERE id=?',
          [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, lat, lng, client.id]
        );
      }

      let subtotal = 0;
      const opValues = []; // [order_id, product_id, sale_price, quantity, cost_price]
      for (const it of items) {
        const [[p]] = await conn.query(
          'SELECT id, name, estoque, sale_value, promotion_price, cost FROM products WHERE id = ? FOR UPDATE',
          [it.id]
        );
        if (!p) throw new Error(`Produto ID "${it.id}" indisponível.`);
        if (p.estoque != null && Number(p.estoque) < it.qty) throw new Error(`Estoque insuficiente para "${p.name}".`);
        const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
        const unit = Number(promo ? p.promotion_price : p.sale_value) || 0;
        if (unit <= 0) throw new Error(`Preço indisponível para "${p.name}".`);
        subtotal += unit * it.qty;
        // cost_price não-nulo sinaliza venda promocional (mesma semântica do painel)
        opValues.push([null, p.id, unit, it.qty, promo ? p.cost : null]);
      }
      subtotal = Number(subtotal.toFixed(2));
      const total = Number((subtotal + fee).toFixed(2));

      const [orderResult] = await conn.query(
        "INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee, origin) VALUES (?, 'A COMBINAR', NULL, ?, NULL, ?, 'loja')",
        [client.id, total, fee]
      );
      const orderId = orderResult.insertId;

      for (const v of opValues) v[0] = orderId;
      await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES ?', [opValues]);

      for (const it of items) {
        await conn.query('UPDATE products SET estoque = estoque - ? WHERE id = ?', [it.qty, it.id]);
        await conn.query(
          'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
          [it.id, 'Saída', it.qty, `Pedido #${orderId} (loja)`]
        );
      }

      await conn.commit();
      return res.status(201).json({ orderId, subtotal, deliveryFee: fee, total });
    } catch (err) {
      await conn.rollback();
      console.error('Erro ao criar pedido da loja:', err);
      return res.status(400).json({ error: err.message });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('Erro ao criar pedido da loja:', e);
    return res.status(500).json({ error: 'Erro ao criar o pedido.' });
  }
}

module.exports = { resumo, criarPedido };
```

- [ ] **Step 2: Criar `src/routes/lojaPedidos.js`**

```js
const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/storeOrderController');

router.post('/checkout/resumo', customerAuth, c.resumo);
router.post('/pedidos', customerAuth, c.criarPedido);

module.exports = router;
```

- [ ] **Step 3: Montar no app.js**

Em `src/app.js`, logo após a linha `app.use('/api/loja', apiLimiter, lojaRoutes);`, adicionar:
```js
const lojaPedidosRoutes = require('./routes/lojaPedidos');
app.use('/api/loja', apiLimiter, lojaPedidosRoutes);
```
(O catálogo público continua antes; este router só tem rotas protegidas. `/produtos/:id` e `/pedidos/:id` não colidem.)

- [ ] **Step 4: Verificar (login → resumo → criar pedido)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
# cria + verifica um cliente de teste e loga
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Check Out","email":"co@teste.com","cpf":"52998224725","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}' >/dev/null
TK=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='co@teste.com'\");console.log(c.t);process.exit(0)})()" 2>/dev/null)
curl -s "http://localhost:3000/api/loja/auth/verify?token=$TK" >/dev/null
JWT=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"co@teste.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
# pega 1 produto com estoque
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id FROM products WHERE estoque > 0 ORDER BY id LIMIT 1');console.log(p?p.id:'');process.exit(0)})()" 2>/dev/null)
echo "produto teste: $PID"
echo "=== resumo ==="
curl -s http://localhost:3000/api/loja/checkout/resumo -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}],\"cep\":\"13870000\",\"address\":\"Rua Teste\",\"houseNumber\":\"10\",\"neighborhood\":\"Centro\",\"city\":\"São João da Boa Vista\"}"
echo ""
echo "=== criar pedido ==="
curl -s http://localhost:3000/api/loja/pedidos -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}]}"
echo ""
echo "=== sem token -> 401 ==="
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pedidos -X POST -H "Content-Type: application/json" -d "{\"items\":[{\"id\":$PID,\"qty\":1}]}"
echo "=== carrinho vazio -> 400 ==="
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pedidos -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"items":[]}'
# confere origin + payment_method do último pedido do cliente
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[o]]=await db.query(\"SELECT id, origin, payment_method, status, total_cost, delivery_fee FROM orders WHERE client_id=(SELECT id FROM clients WHERE email='co@teste.com') ORDER BY id DESC LIMIT 1\");console.log(o);process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: resumo com `subtotal`/`deliveryFee`/`total`; criar → `201` com `orderId`; sem token → 401; vazio → 400; último pedido com `origin:'loja'`, `payment_method:'A COMBINAR'`, `status:'Pendente'`. (Limpe depois: `DELETE FROM clients WHERE email='co@teste.com'` remove o cliente; o pedido fica órfão de teste — ou apague o pedido antes.)

- [ ] **Step 5: Commit**

```bash
git add src/controllers/storeOrderController.js src/routes/lojaPedidos.js src/app.js
git commit -m "feat(loja): checkout — resumo e criação de pedido (API)"
```

---

### Task 3: Histórico + detalhe do pedido (ownership)

**Files:**
- Modify: `src/controllers/storeOrderController.js`, `src/routes/lojaPedidos.js`

**Interfaces:**
- Produz: `GET /api/loja/pedidos`, `GET /api/loja/pedidos/:id` (apenas do dono).

- [ ] **Step 1: Adicionar handlers ao controller**

Em `src/controllers/storeOrderController.js`, antes do `module.exports`, adicionar:
```js
// GET /api/loja/pedidos — histórico do próprio cliente
async function listarPedidos(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT o.id, o.created_at, o.status, o.total_cost, o.delivery_fee,
              (SELECT COALESCE(SUM(op.quantity), 0) FROM order_products op WHERE op.order_id = o.id) AS item_count
       FROM orders o WHERE o.client_id = ? ORDER BY o.id DESC`,
      [req.customer.id]
    );
    return res.json(rows);
  } catch (e) {
    console.error('Erro ao listar pedidos do cliente:', e);
    return res.status(500).json({ error: 'Erro ao buscar seus pedidos.' });
  }
}

// GET /api/loja/pedidos/:id — detalhe (apenas do dono; senão 404)
async function detalhePedido(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[order]] = await db.query(
      `SELECT o.id, o.created_at, o.status, o.payment_method, o.total_cost, o.delivery_fee, o.client_id,
              c.name AS client_name, c.address, c.house_number, c.neighborhood, c.cep, c.city
       FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
      [id]
    );
    if (!order || order.client_id !== req.customer.id) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [products] = await db.query(
      `SELECT p.name, p.franchise, op.sale_price, op.quantity
       FROM order_products op JOIN products p ON p.id = op.product_id WHERE op.order_id = ?`,
      [id]
    );
    delete order.client_id;
    return res.json({ ...order, products });
  } catch (e) {
    console.error('Erro ao buscar pedido do cliente:', e);
    return res.status(500).json({ error: 'Erro ao buscar o pedido.' });
  }
}
```
E atualizar a exportação para: `module.exports = { resumo, criarPedido, listarPedidos, detalhePedido };`

- [ ] **Step 2: Adicionar as rotas**

Em `src/routes/lojaPedidos.js`, após `router.post('/pedidos', customerAuth, c.criarPedido);`:
```js
router.get('/pedidos', customerAuth, c.listarPedidos);
router.get('/pedidos/:id', customerAuth, c.detalhePedido);
```

- [ ] **Step 3: Verificar (histórico + detalhe + 404 de outro)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
# recria cliente + pedido (mesmo fluxo da T2)
curl -s http://localhost:3000/api/loja/auth/register -X POST -H "Content-Type: application/json" -d '{"name":"Hist","email":"hist@teste.com","cpf":"52998224725","birthdate":"1990-05-10","phone":"11999990000","password":"senha1234","consent":true}' >/dev/null
TK=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[c]]=await db.query(\"SELECT verification_token t FROM clients WHERE email='hist@teste.com'\");console.log(c.t);process.exit(0)})()" 2>/dev/null)
curl -s "http://localhost:3000/api/loja/auth/verify?token=$TK" >/dev/null
JWT=$(curl -s http://localhost:3000/api/loja/auth/login -X POST -H "Content-Type: application/json" -d '{"email":"hist@teste.com","password":"senha1234"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id FROM products WHERE estoque > 0 ORDER BY id LIMIT 1');console.log(p.id);process.exit(0)})()" 2>/dev/null)
OID=$(curl -s http://localhost:3000/api/loja/pedidos -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"items\":[{\"id\":$PID,\"qty\":1}]}" | grep -o '"orderId":[0-9]*' | cut -d: -f2)
echo "pedido criado: $OID"
echo "=== lista ==="; curl -s http://localhost:3000/api/loja/pedidos -H "Authorization: Bearer $JWT"
echo ""; echo "=== detalhe (dono) ==="; curl -s http://localhost:3000/api/loja/pedidos/$OID -H "Authorization: Bearer $JWT"
echo ""; echo "=== detalhe de pedido alheio (#1) -> 404 ==="
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/loja/pedidos/1 -H "Authorization: Bearer $JWT"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: lista com o pedido (item_count, status, total); detalhe com `products`; pedido #1 (de outro/painel) → **404**. (#1 deve pertencer a outro cliente; se por acaso for do cliente de teste, use outro id.)

- [ ] **Step 4: Commit**

```bash
git add src/controllers/storeOrderController.js src/routes/lojaPedidos.js
git commit -m "feat(loja): histórico e detalhe de pedido do cliente (ownership)"
```

---

### Task 4: Página de checkout (itens + endereço + ViaCEP + resumo + finalizar)

**Files:**
- Create: `src/public/loja/checkout.html`

**Interfaces:**
- Consome: `Cart` (`cart.js`: `getItems()` → `[{id,name,price,image,franchise,qty}]`, `clear()`); `StoreAuth` (`account.js`: `isLoggedIn()`, `api(path,opts)` → prefixa `/api/loja/auth`); API de pedido em `/api/loja` (caminho completo via `fetch`).

- [ ] **Step 1: Criar `checkout.html`**

Estrutura igual às outras páginas da loja: `<head>` com Bootstrap Icons + `/loja/loja.css`; header/footer copiados de `index.html` (logo, busca, `#account-link`, carrinho com `#cart-count`, footer com Privacidade + admin); fim do body na ordem `/loja/cart.js`, `/loja/loja.js`, `/loja/account.js`, depois o script da página.

Comportamento do script da página (use `'use strict'` numa IIFE):
- **Guard:** se `!StoreAuth.isLoggedIn()` → `location.replace('entrar.html?next=' + encodeURIComponent('/loja/checkout.html'))` e `return`.
- **Itens:** `var itens = Cart.getItems();` Se vazio → mostrar aviso "Seu carrinho está vazio" + link para `produtos.html` e esconder o botão Finalizar. Senão renderizar cada item (imagem/nome/qtd) — escapar com `esc()`.
- **Endereço:** form com campos `cep`, `address` (logradouro), `houseNumber` (número), `neighborhood` (bairro), `city` (cidade). Pré-preencher via `StoreAuth.api('/me')` (GET) → `{ address, house_number, neighborhood, cep, city }` (campos podem vir nulos).
- **Busca CEP (ViaCEP):** ao sair do campo CEP / ao digitar 8 dígitos, chamar:
  ```js
  async function buscarCep(cepRaw) {
    var cep = String(cepRaw || '').replace(/\D/g, '');
    if (cep.length !== 8) return null;
    try {
      var r = await fetch('https://viacep.com.br/ws/' + cep + '/json/');
      if (!r.ok) return null;
      var d = await r.json();
      if (d.erro) return null;
      return d; // { logradouro, bairro, localidade, uf }
    } catch (e) { return null; }
  }
  ```
  Em sucesso, preencher `address=d.logradouro`, `neighborhood=d.bairro`, `city=d.localidade` e focar o campo número. Em `null`, mostrar "CEP não encontrado" (discreto) sem travar o preenchimento manual.
- **Resumo:** função `atualizarResumo()` que faz `fetch('/api/loja/checkout/resumo', { method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+StoreAuth.getToken()}, body: JSON.stringify({ items: itens.map(i=>({id:i.id,qty:i.qty})), cep, address, houseNumber, neighborhood, city }) })`. Renderizar subtotal, frete (`deliveryFee`; se 0 → "Grátis") e total (formato `R$ x,yz`). Itens com `ok:false` → marcar visualmente e **desabilitar Finalizar** com a `reason`. Chamar no load e ao mudar/buscar endereço (debounce simples ou no blur).
- **Finalizar pedido:** botão que faz `fetch('/api/loja/pedidos', { method:'POST', headers:{...Bearer}, body: JSON.stringify({ items: itens.map(i=>({id:i.id,qty:i.qty})), cep, address, houseNumber, neighborhood, city }) })`. Em `201` → `Cart.clear()` + `location.href = 'pedido-confirmado.html?id=' + data.orderId`. Em `400` → exibir `data.error`. Em 401/403 → `StoreAuth.logout()` + `entrar.html`. Desabilitar o botão durante o request.

- [ ] **Step 2: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "checkout.html: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/checkout.html
node -e "const h=require('fs').readFileSync('src/public/loja/checkout.html','utf8');const m=h.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/i)||h.match(/<script>([\s\S]*?)<\/script>/g);console.log('tem viacep:', h.includes('viacep.com.br'));console.log('tem guard next:', h.includes('entrar.html?next'));const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,'');new Function(s);console.log('script parse OK')" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `tem viacep: true`; `tem guard next: true`; `script parse OK`. (Teste real no navegador na T7.)

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/checkout.html
git commit -m "feat(loja): página de checkout (itens, endereço com busca CEP, resumo, finalizar)"
```

---

### Task 5: Página de confirmação do pedido

**Files:**
- Create: `src/public/loja/pedido-confirmado.html`

- [ ] **Step 1: Criar `pedido-confirmado.html`**

Mesma moldura (head/header/footer/scripts `cart.js`,`loja.js`,`account.js`). Script da página (IIFE):
- **Guard:** sem login → `entrar.html?next=/loja/meus-pedidos.html` (sem id não há o que mostrar).
- Lê `id` de `?id=` da URL (valida `/^\d+$/`). Se ausente/inválido → mensagem genérica "Pedido recebido" + link Meus pedidos.
- Carrega `fetch('/api/loja/pedidos/' + id, { headers: Bearer })`. Em sucesso, mostra um card de sucesso: ícone ✓, "Pedido #<id> confirmado!", resumo (status, total formatado, frete), aviso **"Pagamento a combinar — entraremos em contato"**, e botões "Ver meus pedidos" (`meus-pedidos.html`) e "Continuar comprando" (`produtos.html`). Em 404/erro → "Pedido recebido" + link Meus pedidos. 401/403 → login.
- Escapar valores dinâmicos exibidos via `innerHTML` com `esc()`.

- [ ] **Step 2: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "pedido-confirmado.html: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/pedido-confirmado.html
node -e "const h=require('fs').readFileSync('src/public/loja/pedido-confirmado.html','utf8');const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,'');new Function(s);console.log('parse OK; a combinar:', h.toLowerCase().includes('combinar'))" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; `parse OK; a combinar: true`.

- [ ] **Step 3: Commit**

```bash
git add src/public/loja/pedido-confirmado.html
git commit -m "feat(loja): página de confirmação de pedido"
```

---

### Task 6: Meus pedidos (lista + detalhe)

**Files:**
- Create: `src/public/loja/meus-pedidos.html`, `src/public/loja/pedido.html`

- [ ] **Step 1: Criar `meus-pedidos.html`**

Moldura padrão + scripts. Script (IIFE):
- **Guard:** sem login → `entrar.html?next=/loja/meus-pedidos.html`.
- `fetch('/api/loja/pedidos', { headers: Bearer })`. Lista vazia → estado vazio ("Você ainda não fez pedidos" + link `produtos.html`). Senão, para cada pedido: card/linha com `#<id>`, data (`new Date(created_at).toLocaleDateString('pt-br')`), badge de status (Pendente/Entregue/Cancelado — cores via classe), `item_count` itens, total formatado, e link "Ver detalhes" → `pedido.html?id=<id>`. Escapar com `esc()`.
- 401/403 → `StoreAuth.logout()` + login.

- [ ] **Step 2: Criar `pedido.html`**

Moldura padrão + scripts. Script (IIFE):
- **Guard:** sem login → `entrar.html?next=/loja/meus-pedidos.html`.
- Lê `id` (`/^\d+$/`); inválido → volta para `meus-pedidos.html`.
- `fetch('/api/loja/pedidos/' + id, { headers: Bearer })`. 404 → "Pedido não encontrado" + link Meus pedidos. Sucesso → cabeçalho (`#id`, data, badge status, "Pagamento: A combinar"), tabela de itens (`products`: nome, franquia, qtd, `sale_price`, subtotal da linha), linha de frete (`delivery_fee`) e total (`total_cost`), e o endereço de entrega (address, house_number, neighborhood, cep, city). Botão "Voltar para Meus pedidos". Escapar dinâmicos.
- 401/403 → login.

- [ ] **Step 3: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
for p in meus-pedidos.html pedido.html; do echo -n "$p: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/loja/$p; done
node -e "for (const f of ['meus-pedidos','pedido']){const h=require('fs').readFileSync('src/public/loja/'+f+'.html','utf8');const s=h.match(/<script>(?:(?!<\/script>)[\s\S])*<\/script>/g).pop().replace(/<\/?script>/g,'');new Function(s);} console.log('parse OK')" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200 nos dois; `parse OK`.

- [ ] **Step 4: Commit**

```bash
git add src/public/loja/meus-pedidos.html src/public/loja/pedido.html
git commit -m "feat(loja): páginas de Meus pedidos (lista e detalhe)"
```

---

### Task 7: Integração — botão do carrinho + link na conta + teste no navegador

**Files:**
- Modify: `src/public/loja/carrinho.html`, `src/public/loja/conta.html`

- [ ] **Step 1: Carrinho → Checkout**

Em `src/public/loja/carrinho.html`, localizar o botão/link de finalizar compra (o `.cart-checkout-note` e o botão de finalizar no `cart-summary`). Garantir que o CTA principal de "Finalizar compra" seja um link/botão que leva a `checkout.html`. Se hoje for um botão inerte ou uma nota "checkout em breve", trocar por:
```html
<a href="checkout.html" class="btn accent-btn">Finalizar compra</a>
```
(Manter o cálculo de subtotal existente; o botão só aparece/é habilitado quando há itens — se o carrinho estiver vazio, manter o estado vazio que a página já mostra.)

- [ ] **Step 2: Link "Meus pedidos" na conta**

Em `src/public/loja/conta.html`, adicionar na área da conta (perto de "Meus dados" / antes de Sair) um link visível para o histórico:
```html
<a href="meus-pedidos.html" class="btn"><i class="bi bi-bag-check" aria-hidden="true"></i> Meus pedidos</a>
```
(Usar a classe de botão/secção que a página já usa para manter o estilo.)

- [ ] **Step 3: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "carrinho aponta p/ checkout: "; curl -s http://localhost:3000/loja/carrinho.html | grep -c 'checkout.html'
echo -n "conta tem link meus-pedidos: "; curl -s http://localhost:3000/loja/conta.html | grep -c 'meus-pedidos.html'
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: ambos ≥ 1.

- [ ] **Step 4: Teste de ponta a ponta no navegador (manual)**

Com `node src/app.js` rodando, em `http://localhost:3000/loja/`:
1. Logar (ou cadastrar/verificar via link no console em modo dev).
2. Adicionar produtos ao carrinho → abrir Carrinho → "Finalizar compra".
3. No checkout, digitar um CEP válido (ex.: `13870-000`) e ver o endereço autopreencher; ajustar número; ver o resumo com subtotal + frete + total.
4. "Finalizar pedido" → cair na confirmação com o número do pedido.
5. Abrir "Meus pedidos" → ver o pedido com status Pendente → abrir o detalhe.
6. Conferir no painel admin (`/login.html`) que o pedido aparece com `origin` da loja.

(Encerrar o node ao terminar para liberar a porta 3000.)

- [ ] **Step 5: Commit**

```bash
git add src/public/loja/carrinho.html src/public/loja/conta.html
git commit -m "feat(loja): carrinho leva ao checkout e conta linka Meus pedidos"
```
