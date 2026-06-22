# Descontos por Franquia Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir editar o percentual de desconto de cada franquia numa tela, recalculando automaticamente o custo de todos os produtos daquela franquia.

**Architecture:** `products` ganha `sale_value` (valor de venda, base). Nova tabela `franchise_discounts` guarda o % por franquia. `cost` passa a ser derivado pelo servidor (`ROUND(sale_value × (1 − %/100), 2)`). Endpoints GET/PUT gerenciam os percentuais; o PUT recalcula custos em transação. UI: seção colapsável no Estoque + campo "Valor de Venda" no cadastro/edição de produto.

**Tech Stack:** Node.js/Express, MySQL (mysql2/promise pool), Bootstrap 5, SweetAlert2, JS vanilla

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- CommonJS (`require`/`module.exports`) — sem ES modules
- Migrações ficam no startup de `src/database/connection.js`, com `try { } catch (_) {}` por statement (padrão existente)
- Custo é **sempre derivado** pelo servidor — o frontend não envia mais `cost`; envia o valor de venda
- Fórmula do custo: `cost = ROUND(sale_value × (1 − percent/100), 2)`
- `promotion_price` não recebe tratamento de desconto — fica como está
- Seed de percentuais: Boticário 15, Natura 32, Avon 32, Abelha Rainha 20, Eudora 30, Outros 0
- `Auth.apiFetch` para todas as chamadas de API no frontend
- `esc(v)` já existe nas páginas HTML — usar em innerHTML com dados do banco
- Sem testes automatizados — verificar via curl + browser
- Dark theme via CSS custom properties (`var(--border)`, `var(--bg-card)`, `var(--text-muted)`, `var(--accent)`, `var(--text-primary)`, `var(--success)`, `var(--danger)`)

---

### Task 1: Migrações — coluna sale_value, tabela franchise_discounts, seed e backfill

**Files:**
- Modify: `src/database/connection.js`

**Interfaces:**
- Produz: coluna `products.sale_value DECIMAL(10,2)`; tabela `franchise_discounts (franchise VARCHAR(255) PK, percent DECIMAL(5,2))` semeada; `sale_value` preenchido para todos os produtos existentes

- [ ] **Step 1: Adicionar as migrações no bloco de startup**

Em `src/database/connection.js`, logo após a migração existente do `cost_price` (linha com `ALTER TABLE order_products ADD COLUMN cost_price...`), adicionar:

```js
    // Migração: valor de venda (base para cálculo de custo por desconto de franquia)
    try { await conn.query('ALTER TABLE products ADD COLUMN sale_value DECIMAL(10,2) DEFAULT NULL'); } catch (_) {}

    // Migração: tabela de percentuais de desconto por franquia
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS franchise_discounts (
          franchise VARCHAR(255) PRIMARY KEY,
          percent   DECIMAL(5,2) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } catch (_) {}

    // Seed dos percentuais (idempotente — não sobrescreve valores já ajustados pelo usuário)
    try {
      await conn.query(`
        INSERT IGNORE INTO franchise_discounts (franchise, percent) VALUES
        ('Boticário', 15), ('Natura', 32), ('Avon', 32),
        ('Abelha Rainha', 20), ('Eudora', 30), ('Outros', 0)
      `);
    } catch (_) {}

    // Backfill do sale_value reconstruindo a partir do custo já descontado (roda só uma vez)
    try {
      await conn.query(`
        UPDATE products p
        LEFT JOIN franchise_discounts fd ON fd.franchise = p.franchise
        SET p.sale_value = ROUND(p.cost / (1 - COALESCE(fd.percent, 0) / 100), 2)
        WHERE p.sale_value IS NULL
      `);
    } catch (_) {}
```

- [ ] **Step 2: Reiniciar o servidor e verificar as migrações**

Matar qualquer processo node em execução e iniciar:
```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
node src/app.js &
sleep 3
```
Esperado no log: `✅ Banco de dados conectado: db_pedidos` sem erros.

- [ ] **Step 3: Verificar estrutura e dados via node**

```bash
node -e "
require('dotenv').config();
const db = require('./src/database/connection');
(async () => {
  const [fd] = await db.query('SELECT * FROM franchise_discounts ORDER BY franchise');
  console.table(fd);
  const [p] = await db.query('SELECT name, franchise, cost, sale_value FROM products LIMIT 5');
  console.table(p);
  const [nulls] = await db.query('SELECT COUNT(*) AS faltando FROM products WHERE sale_value IS NULL');
  console.log('Produtos sem sale_value:', nulls[0].faltando);
  process.exit(0);
})();
" 2>/dev/null
```
Esperado: 6 franquias com os percentuais corretos; `sale_value` preenchido (ex: Natura cost 23.80 → sale_value ~35.00); `faltando = 0`.

- [ ] **Step 4: Commit**

```bash
git add src/database/connection.js
git commit -m "feat(db): coluna sale_value, tabela franchise_discounts, seed e backfill"
```

---

### Task 2: Backend — controller e rotas de franchise-discounts

**Files:**
- Create: `src/controllers/franchiseDiscountController.js`
- Create: `src/routes/franchiseDiscounts.js`
- Modify: `src/app.js`

**Interfaces:**
- Consome: tabela `franchise_discounts` e coluna `products.sale_value` (Task 1)
- Produz:
  - `GET /api/franchise-discounts` → `[{ franchise, percent }]` (percent como número)
  - `PUT /api/franchise-discounts/:franchise` body `{ percent }` → `{ message, recalculados }`

- [ ] **Step 1: Criar o controller**

Criar `src/controllers/franchiseDiscountController.js`:

```js
const db = require('../database/connection');

// GET /api/franchise-discounts
async function listDiscounts(req, res) {
  try {
    const [rows] = await db.query('SELECT franchise, percent FROM franchise_discounts ORDER BY franchise');
    return res.json(rows.map(r => ({ franchise: r.franchise, percent: parseFloat(r.percent) })));
  } catch (err) {
    console.error('Erro ao listar descontos:', err);
    return res.status(500).json({ error: 'Erro ao buscar descontos.' });
  }
}

// PUT /api/franchise-discounts/:franchise
async function updateDiscount(req, res) {
  const franchise = req.params.franchise;
  const percent = parseFloat(req.body.percent);

  if (!franchise) return res.status(400).json({ error: 'Franquia inválida.' });
  if (isNaN(percent) || percent < 0 || percent >= 100) {
    return res.status(400).json({ error: 'Percentual deve ser um número entre 0 e 99,99.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO franchise_discounts (franchise, percent) VALUES (?, ?) ON DUPLICATE KEY UPDATE percent = ?',
      [franchise, percent, percent]
    );

    const [result] = await conn.query(
      'UPDATE products SET cost = ROUND(sale_value * (1 - ? / 100), 2) WHERE franchise = ? AND sale_value IS NOT NULL',
      [percent, franchise]
    );

    await conn.commit();
    return res.json({ message: 'Desconto atualizado.', recalculados: result.affectedRows });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Erro ao atualizar desconto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar desconto.' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { listDiscounts, updateDiscount };
```

- [ ] **Step 2: Criar o arquivo de rotas**

Criar `src/routes/franchiseDiscounts.js`:

```js
const express = require('express');
const router  = express.Router();
const { listDiscounts, updateDiscount } = require('../controllers/franchiseDiscountController');

router.get('/',           listDiscounts);
router.put('/:franchise', updateDiscount);

module.exports = router;
```

- [ ] **Step 3: Montar a rota no app.js**

Em `src/app.js`, após a linha `const estoqueRoutes = require('./routes/estoque');` adicionar:
```js
const franchiseDiscountRoutes = require('./routes/franchiseDiscounts');
```
E após a linha `app.use('/api/estoque', apiLimiter, auth, estoqueRoutes);` adicionar:
```js
app.use('/api/franchise-discounts', apiLimiter, auth, franchiseDiscountRoutes);
```

- [ ] **Step 4: Testar os endpoints via curl**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
# reiniciar servidor
node src/app.js &
sleep 3
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# listar
curl -s http://localhost:3000/api/franchise-discounts -H "Authorization: Bearer $TOKEN"
echo ""
# atualizar Boticário para 15 (sem mudança de valor, só valida recálculo)
curl -s http://localhost:3000/api/franchise-discounts/Boticário -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"percent":15}'
echo ""
# validar erro
curl -s http://localhost:3000/api/franchise-discounts/Boticário -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"percent":150}'
```
Esperado: GET retorna 6 franquias; PUT válido retorna `{"message":"Desconto atualizado.","recalculados":42}`; PUT inválido retorna erro 400.

- [ ] **Step 5: Commit**

```bash
git add src/controllers/franchiseDiscountController.js src/routes/franchiseDiscounts.js src/app.js
git commit -m "feat(api): endpoints GET/PUT franchise-discounts com recálculo de custo"
```

---

### Task 3: Backend — createProduct e updateProduct usam sale_value

**Files:**
- Modify: `src/controllers/productController.js`

**Interfaces:**
- Consome: tabela `franchise_discounts`, coluna `products.sale_value` (Task 1)
- Produz:
  - `createProduct`: aceita `saleValue` no body, calcula e grava `cost` + `sale_value`
  - `updateProduct`: aceita `sale_value` no body, recalcula e grava `cost` + `sale_value`
  - `getProductById` e `searchProductByCode` retornam também `sale_value`

- [ ] **Step 1: Adicionar helper de cálculo no topo do controller**

Em `src/controllers/productController.js`, após a linha `const db = require('../database/connection');` adicionar:

```js
// Busca o percentual de desconto da franquia (0 se não houver) e calcula o custo
async function calcCost(conn, franchise, saleValue) {
  const [[row]] = await conn.query('SELECT percent FROM franchise_discounts WHERE franchise = ?', [franchise]);
  const percent = row ? parseFloat(row.percent) : 0;
  return Math.round(saleValue * (1 - percent / 100) * 100) / 100;
}
```

- [ ] **Step 2: Reescrever createProduct para usar saleValue**

Substituir a função `createProduct` inteira por:

```js
// POST /api/products
async function createProduct(req, res) {
  const { name, saleValue, franchise, code, promotionPrice, estoqueInicial } = req.body;

  if (!name || saleValue == null || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }
  const sv = parseFloat(saleValue);
  if (isNaN(sv) || sv < 0) {
    return res.status(400).json({ error: 'Valor de venda inválido.' });
  }

  const qtdInicial = parseInt(estoqueInicial) || 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cost = await calcCost(conn, franchise, sv);

    const [result] = await conn.query(
      'INSERT INTO products (name, cost, sale_value, franchise, code, promotion_price, estoque) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, cost, sv, franchise, code, promotionPrice || null, qtdInicial]
    );
    const productId = result.insertId;

    if (qtdInicial > 0) {
      await conn.query(
        'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
        [productId, 'Entrada', qtdInicial, 'Estoque inicial']
      );
    }

    await conn.commit();
    return res.status(201).json({ message: 'Produto cadastrado com sucesso!', productId });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao criar produto:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar produto.' });
  } finally {
    conn.release();
  }
}
```

- [ ] **Step 3: Reescrever updateProduct para usar sale_value**

Substituir a função `updateProduct` inteira por:

```js
// PUT /api/products/:id
async function updateProduct(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { name, sale_value, franchise, code, promotion_price } = req.body;
  if (!name || sale_value == null || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  const sv = parseFloat(sale_value);
  if (isNaN(sv) || sv < 0) {
    return res.status(400).json({ error: 'Valor de venda inválido.' });
  }

  const promoVal = promotion_price != null && promotion_price !== ''
    ? parseFloat(promotion_price)
    : null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cost = await calcCost(conn, franchise, sv);

    const [result] = await conn.query(
      'UPDATE products SET name=?, cost=?, sale_value=?, franchise=?, code=?, promotion_price=? WHERE id=?',
      [name, cost, sv, franchise, code, promoVal, id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    await conn.commit();
    return res.json({ message: 'Produto atualizado com sucesso.' });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao atualizar produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar produto.' });
  } finally {
    conn.release();
  }
}
```

- [ ] **Step 4: Incluir sale_value nos retornos de getProductById e searchProductByCode**

Em `searchProductByCode`, trocar a linha do `return res.json(...)` por:
```js
    return res.json({ id: p.id, name: p.name, cost: p.cost, sale_value: p.sale_value, code: p.code, promotion_price: p.promotion_price ?? null });
```

Em `getProductById`, trocar a linha do `return res.json(...)` por:
```js
    return res.json({ id: p.id, name: p.name, cost: p.cost, sale_value: p.sale_value, franchise: p.franchise, code: p.code, promotion_price: p.promotion_price ?? null });
```

(Obs: `listAllProducts` faz `SELECT *`, então já retorna `sale_value` automaticamente — nenhuma mudança necessária lá.)

- [ ] **Step 5: Testar create e update via curl**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
node src/app.js &
sleep 3
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# criar produto Natura com valor de venda 100 → custo esperado 68.00
curl -s http://localhost:3000/api/products -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $TOKEN" -d '{"name":"TESTE Desconto","saleValue":100,"franchise":"Natura","code":"TST-DESC-1","estoqueInicial":0}'
echo ""
# buscar e conferir cost=68 e sale_value=100
curl -s "http://localhost:3000/api/products/search?code=TST-DESC-1" -H "Authorization: Bearer $TOKEN"
```
Esperado: criação OK; busca retorna `"cost":"68.00"` e `"sale_value":"100.00"`.

Limpar o produto de teste:
```bash
ID=$(curl -s "http://localhost:3000/api/products/search?code=TST-DESC-1" -H "Authorization: Bearer $TOKEN" | grep -o '"id":[0-9]*' | cut -d: -f2)
curl -s http://localhost:3000/api/products/$ID -X DELETE -H "Authorization: Bearer $TOKEN"
```

- [ ] **Step 6: Commit**

```bash
git add src/controllers/productController.js
git commit -m "feat(products): cadastro/edição usa sale_value; custo calculado pelo desconto da franquia"
```

---

### Task 4: Frontend — campo Valor de Venda no cadastro e edição de produto

**Files:**
- Modify: `src/public/produtos.html`

**Interfaces:**
- Consome: `GET /api/franchise-discounts` (Task 2); `createProduct`/`updateProduct` com `saleValue`/`sale_value` (Task 3); `sale_value` retornado em `listAllProducts` e `getProductById`
- Produz: formulário com campo "Valor de Venda" e "Custo" calculado somente leitura

- [ ] **Step 1: Trocar o campo "Valor de Custo" do formulário de cadastro por Valor de Venda + Custo calculado**

Em `src/public/produtos.html`, substituir o bloco do campo de custo (atualmente em torno da linha 388-394):

```html
              <div class="mb-3">
                <label class="form-label">Valor de Custo</label>
                <div class="input-icon-wrap">
                  <i class="bi bi-cash-coin"></i>
                  <input type="number" step="0.01" min="0" class="form-control" id="cost" placeholder="0,00" required>
                </div>
              </div>
```

por:

```html
              <div class="mb-3">
                <label class="form-label">Valor de Venda</label>
                <div class="input-icon-wrap">
                  <i class="bi bi-tag"></i>
                  <input type="number" step="0.01" min="0" class="form-control" id="saleValue" placeholder="0,00" required>
                </div>
              </div>

              <div class="mb-3">
                <label class="form-label">Custo <span style="opacity:.5;font-weight:400">(calculado)</span></label>
                <div class="input-icon-wrap">
                  <i class="bi bi-cash-coin"></i>
                  <input type="number" step="0.01" class="form-control" id="cost" placeholder="0,00" readonly>
                </div>
              </div>
```

- [ ] **Step 2: Trocar o campo de custo do modal de edição por Valor de Venda + Custo calculado**

Substituir o bloco (atualmente em torno da linha 539-542):

```html
          <div class="mb-3">
            <label class="form-label">Valor de Custo (R$)</label>
            <input type="number" step="0.01" min="0" class="form-control" id="edit-cost" required>
          </div>
```

por:

```html
          <div class="mb-3">
            <label class="form-label">Valor de Venda (R$)</label>
            <input type="number" step="0.01" min="0" class="form-control" id="edit-sale-value" required>
          </div>
          <div class="mb-3">
            <label class="form-label">Custo (R$) <span style="opacity:.5;font-weight:400">(calculado)</span></label>
            <input type="number" step="0.01" class="form-control" id="edit-cost" readonly>
          </div>
```

- [ ] **Step 2b: Carregar os percentuais de desconto ao abrir a página**

No `<script>`, localizar onde `loadProducts()` é chamado na inicialização. Adicionar uma variável global e o carregamento dos descontos. Logo após a linha `let allProducts` (ou no topo do script, junto das outras declarações), adicionar:

```js
  let franchiseDiscounts = {};
  async function loadDiscounts() {
    try {
      const res = await Auth.apiFetch('/api/franchise-discounts');
      const list = await res.json();
      franchiseDiscounts = {};
      list.forEach(d => { franchiseDiscounts[d.franchise] = d.percent; });
    } catch { franchiseDiscounts = {}; }
  }
  function calcCostPreview(saleValue, franchise) {
    const pct = franchiseDiscounts[franchise] ?? 0;
    const v = parseFloat(saleValue);
    if (isNaN(v)) return '';
    return (Math.round(v * (1 - pct / 100) * 100) / 100).toFixed(2);
  }
```

E garantir que `loadDiscounts()` é chamado na inicialização — localizar a chamada existente `loadProducts();` no fim do script e adicionar antes dela:
```js
  loadDiscounts();
```

- [ ] **Step 3: Atualizar o custo calculado no formulário de cadastro ao digitar venda ou trocar franquia**

No `<script>`, adicionar listeners. Logo após o bloco que adiciona o `loadDiscounts`/`calcCostPreview`, adicionar:

```js
  function refreshCostPreview() {
    const fr = document.querySelector('.franchise-option:checked')?.value;
    document.getElementById('cost').value = fr ? calcCostPreview(document.getElementById('saleValue').value, fr) : '';
  }
  document.getElementById('saleValue').addEventListener('input', refreshCostPreview);
  document.querySelectorAll('.franchise-option').forEach(r => r.addEventListener('change', refreshCostPreview));
```

- [ ] **Step 4: Atualizar o submit do formulário de cadastro (fila) para usar saleValue**

Substituir o bloco do `productQueue.push({...})` (atualmente em torno da linha 706-712) por:

```js
    productQueue.push({
      name:           document.getElementById('name').value.trim(),
      saleValue:      parseFloat(document.getElementById('saleValue').value),
      franchise:      franchiseSelected.value,
      code:           document.getElementById('code').value.trim(),
      estoqueInicial: parseInt(document.getElementById('estoqueInicial').value) || 0
    });
```

E após `document.getElementById('productForm').reset();` adicionar (para limpar o custo calculado):
```js
    document.getElementById('cost').value = '';
```

- [ ] **Step 5: Ajustar a renderização da fila para mostrar o custo calculado**

Localizar a linha da fila que mostra o custo (em torno da linha 652): `<div class="queue-item-cost">${fmt(p.cost)}</div>`. Substituir por:
```js
        <div class="queue-item-cost">${fmt(parseFloat(calcCostPreview(p.saleValue, p.franchise)) || 0)}</div>
```

- [ ] **Step 6: Atualizar openEdit para popular Valor de Venda e custo calculado**

Substituir a função `openEdit` (linhas ~833-843) por:

```js
  function openEdit(id) {
    const p = allProducts.find(x => x.id === id);
    if (!p) return;
    document.getElementById('edit-id').value         = p.id;
    document.getElementById('edit-name').value       = p.name;
    document.getElementById('edit-code').value       = p.code;
    document.getElementById('edit-sale-value').value = p.sale_value ?? '';
    document.getElementById('edit-cost').value       = p.cost;
    document.getElementById('edit-promotion-price').value = p.promotion_price ?? '';
    document.getElementById('edit-franchise').value  = p.franchise;
    editModal.show();
  }

  function refreshEditCostPreview() {
    const fr = document.getElementById('edit-franchise').value;
    document.getElementById('edit-cost').value = calcCostPreview(document.getElementById('edit-sale-value').value, fr);
  }
  document.getElementById('edit-sale-value').addEventListener('input', refreshEditCostPreview);
  document.getElementById('edit-franchise').addEventListener('change', refreshEditCostPreview);
```

- [ ] **Step 7: Atualizar o submit de edição para enviar sale_value**

Substituir o bloco do `payload` no `edit-form` submit (linhas ~849-855) por:

```js
    const payload  = {
      name:            document.getElementById('edit-name').value.trim(),
      code:            document.getElementById('edit-code').value.trim(),
      sale_value:      parseFloat(document.getElementById('edit-sale-value').value),
      franchise:       document.getElementById('edit-franchise').value,
      promotion_price: promoRaw !== '' ? parseFloat(promoRaw) : null
    };
```

- [ ] **Step 8: Verificar no browser**

1. Abrir http://localhost:3000/produtos.html
2. No cadastro: selecionar franquia Natura, digitar Valor de Venda 100 → campo Custo mostra 68.00 automaticamente (somente leitura)
3. Adicionar à fila → item mostra custo calculado; cadastrar → produto aparece na lista
4. Editar um produto existente → modal abre com Valor de Venda preenchido e Custo calculado; trocar franquia recalcula o custo exibido; salvar funciona
5. Conferir na lista que o custo do produto editado bate com venda × (1 − %)

- [ ] **Step 9: Commit**

```bash
git add src/public/produtos.html
git commit -m "feat(produtos): campo Valor de Venda com custo calculado pelo desconto da franquia"
```

---

### Task 5: Frontend — seção "Descontos por Franquia" no Estoque

**Files:**
- Modify: `src/public/estoque.html`

**Interfaces:**
- Consome: `GET /api/franchise-discounts` e `PUT /api/franchise-discounts/:franchise` (Task 2)
- Produz: painel colapsável para editar percentuais

- [ ] **Step 1: Adicionar o botão "Descontos" no hero, ao lado do "Log Geral"**

Em `src/public/estoque.html`, no hero (em torno da linha 164-167), logo após o botão `#btnLogGeral`, adicionar dentro do mesmo flex (depois do `</button>` do Log Geral e antes do `</div>` que fecha o hero):

```html
      <button id="btnDescontos" onclick="toggleDescontos()"
        style="border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;padding:.45rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .15s">
        <i class="bi bi-percent me-1"></i> Descontos por Franquia
      </button>
```

Para os dois botões ficarem juntos à direita, envolver ambos num wrapper. Substituir o botão `#btnLogGeral` e o novo botão por um único container — ou seja, o bloco final do hero fica:

```html
      <div class="d-flex gap-2 flex-wrap">
        <button id="btnLogGeral" onclick="toggleLog()"
          style="border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;padding:.45rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .15s">
          <i class="bi bi-journal-text me-1"></i> Log Geral
        </button>
        <button id="btnDescontos" onclick="toggleDescontos()"
          style="border:1px solid var(--border);background:var(--bg-card);color:var(--text-primary);border-radius:8px;padding:.45rem 1rem;font-size:.85rem;font-weight:600;cursor:pointer;transition:all .15s">
          <i class="bi bi-percent me-1"></i> Descontos por Franquia
        </button>
      </div>
```

- [ ] **Step 2: Adicionar o painel colapsável após o painel de Log Geral**

Logo após o fechamento do `<!-- Painel Log Geral -->` (a `</div>` que fecha `#logPanel`, em torno da linha 183) e antes do `<!-- Resumo -->`, adicionar:

```html
    <!-- Painel Descontos por Franquia -->
    <div id="descontosPanel" style="display:none;margin-bottom:1.5rem">
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:12px;padding:1.25rem">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <h6 style="margin:0;font-weight:600;color:var(--text-primary)">
            <i class="bi bi-percent me-2" style="color:var(--accent)"></i>Descontos por Franquia
          </h6>
        </div>
        <div style="font-size:.8rem;color:var(--text-muted);margin-bottom:1rem">
          Ao salvar, o custo de todos os produtos da franquia é recalculado: custo = valor de venda × (1 − %).
        </div>
        <div id="descontos-container">
          <div class="empty-state"><i class="bi bi-hourglass-split"></i>Carregando...</div>
        </div>
      </div>
    </div>
```

- [ ] **Step 3: Adicionar as funções toggleDescontos, loadDescontos e salvarDesconto no script**

No bloco `<script>` da página, adicionar (próximo às funções `toggleLog`/`loadLog`):

```js
  let descontosVisible = false;

  function toggleDescontos() {
    descontosVisible = !descontosVisible;
    const panel = document.getElementById('descontosPanel');
    const btn   = document.getElementById('btnDescontos');
    panel.style.display = descontosVisible ? '' : 'none';
    btn.innerHTML = descontosVisible
      ? '<i class="bi bi-x-circle me-1"></i> Fechar Descontos'
      : '<i class="bi bi-percent me-1"></i> Descontos por Franquia';
    if (descontosVisible) loadDescontos();
  }

  async function loadDescontos() {
    const container = document.getElementById('descontos-container');
    container.innerHTML = '<div class="empty-state"><i class="bi bi-hourglass-split"></i>Carregando...</div>';
    try {
      const res  = await Auth.apiFetch('/api/franchise-discounts');
      const rows = await res.json();
      if (!rows.length) {
        container.innerHTML = '<div class="empty-state"><i class="bi bi-inbox"></i>Nenhuma franquia.</div>';
        return;
      }
      container.innerHTML = rows.map(r => `
        <div style="display:flex;align-items:center;gap:.75rem;padding:.6rem .25rem;border-bottom:1px solid var(--border)">
          <div style="flex:1;font-weight:600;color:var(--text-primary)">${esc(r.franchise)}</div>
          <div style="display:flex;align-items:center;gap:.35rem">
            <input type="number" step="0.01" min="0" max="99.99" value="${r.percent}"
              id="desc-${esc(r.franchise)}"
              style="width:90px;padding:.4rem .6rem;border-radius:8px;border:1px solid var(--border);background:var(--bg-hover);color:var(--text-primary);text-align:right">
            <span style="color:var(--text-muted)">%</span>
          </div>
          <button onclick="salvarDesconto('${esc(r.franchise)}')"
            style="border:1px solid rgba(63,185,80,.4);background:rgba(63,185,80,.1);color:#3fb950;border-radius:8px;padding:.4rem .9rem;font-size:.82rem;font-weight:600;cursor:pointer">
            <i class="bi bi-check-lg"></i> Salvar
          </button>
        </div>`).join('');
    } catch (e) {
      container.innerHTML = '<div class="empty-state"><i class="bi bi-exclamation-circle"></i>Erro ao carregar.</div>';
    }
  }

  async function salvarDesconto(franchise) {
    const input = document.getElementById('desc-' + franchise);
    const percent = parseFloat(input.value);
    if (isNaN(percent) || percent < 0 || percent >= 100) {
      return Swal.fire('Atenção', 'Informe um percentual entre 0 e 99,99.', 'warning');
    }
    const res = await Auth.apiFetch(`/api/franchise-discounts/${encodeURIComponent(franchise)}`, {
      method: 'PUT', body: JSON.stringify({ percent })
    });
    const data = await res.json();
    if (!res.ok) return Swal.fire('Erro', data.error || 'Não foi possível salvar.', 'error');
    Swal.fire({ icon: 'success', title: 'Desconto salvo!', text: `${data.recalculados} produto(s) recalculado(s).`, timer: 2200, showConfirmButton: false });
    if (typeof loadEstoque === 'function') loadEstoque();
  }
```

(Nota: `loadEstoque` é a função que recarrega a tabela de estoque — se o nome real for outro, usar o nome correto encontrado no arquivo; a chamada é protegida por `typeof`.)

- [ ] **Step 4: Verificar no browser**

1. Abrir http://localhost:3000/estoque.html
2. Clicar em "Descontos por Franquia" → painel abre listando as 6 franquias com % editável
3. Alterar Natura de 32 para 30 e clicar Salvar → toast "X produto(s) recalculado(s)"
4. Conferir que os custos dos produtos Natura mudaram (abrir produtos.html ou a própria tabela de estoque)
5. Voltar o Natura para 32 e salvar (restaura)

- [ ] **Step 5: Commit**

```bash
git add src/public/estoque.html
git commit -m "feat(estoque): seção Descontos por Franquia com recálculo de custo"
```
