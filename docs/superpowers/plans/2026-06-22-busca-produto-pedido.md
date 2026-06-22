# Busca de Produto na Criação de Pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o `<select>` de produto na criação de pedido por um combobox de busca que mostra o nome completo e filtra por nome ou código, mantendo a franquia primeiro.

**Architecture:** Tudo em `src/public/pedidos.html`. O `<select id="products">` vira um `<input id="productSearch">` + painel de resultados `#productResults` + hidden `#selectedProductId`. Os produtos da franquia ficam num array `currentProducts`; um objeto `selectedProduct` é a fonte da seleção, lido pelo preenchimento de Custo/Venda, pelo checkbox promo e pelo botão Adicionar.

**Tech Stack:** HTML + JS vanilla, Bootstrap 5, tema escuro via CSS custom properties

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- Arquivo único: `src/public/pedidos.html` — sem mudança de backend
- Mantém a Franquia primeiro; a busca opera só dentro da franquia escolhida
- Resultados mostram **nome completo + código** (`COD xxx`). Sem preço.
- Busca por `name` OU `code`, case-insensitive (`toLowerCase`)
- `Auth.apiFetch` para chamadas de API; `esc()` em todo HTML com dados do banco
- Preserva o auto-fill: Custo de `cost`; Venda de `sale_value` só quando vazia; promo edita custo e usa `promotion_price`; desmarcar promo volta Venda para `sale_value`
- Tema escuro: `var(--bg-card)`, `var(--border)`, `var(--text-primary)`, `var(--text-muted)`, `var(--bg-hover)`, `var(--accent)`
- Sem testes automatizados — verificar via browser/curl

---

### Task 1: Combobox de busca (markup, CSS, seleção por mouse + integração)

**Files:**
- Modify: `src/public/pedidos.html`

**Interfaces:**
- Consome: `GET /api/products?franchise=` (retorna `id, name, code, cost, sale_value, promotion_price`)
- Produz: estado global `currentProducts` (array) e `selectedProduct` (objeto|null); funções `renderProductResults(query)`, `hideProductResults()`, `selectProductById(id)`

- [ ] **Step 1: Substituir o markup do produto (select → combobox)**

Localizar o bloco da coluna Produto e substituir:

```html
              <div class="col-12 col-sm-6">
                <label class="form-label">Produto</label>
                <div class="input-icon-wrap">
                  <i class="bi bi-tag"></i>
                  <select id="products" class="form-select">
                    <option value="">Selecione um produto</option>
                  </select>
                </div>
              </div>
```

por:

```html
              <div class="col-12 col-sm-6">
                <label class="form-label">Produto</label>
                <div class="input-icon-wrap" style="position:relative">
                  <i class="bi bi-tag"></i>
                  <input type="text" id="productSearch" class="form-control" placeholder="Selecione a franquia primeiro" autocomplete="off" disabled>
                  <input type="hidden" id="selectedProductId">
                  <div id="productResults" class="product-results" style="display:none"></div>
                </div>
              </div>
```

- [ ] **Step 2: Adicionar o CSS do combobox**

Dentro do `<style>` da página (antes do `</style>`), adicionar:

```css
    .product-results {
      position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:50;
      background:var(--bg-card); border:1px solid var(--border); border-radius:10px;
      max-height:260px; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,.35); padding:.25rem;
    }
    .product-results-item {
      padding:.5rem .65rem; border-radius:7px; cursor:pointer; font-size:.85rem;
      color:var(--text-primary); display:flex; justify-content:space-between; gap:.5rem; align-items:center;
    }
    .product-results-item:hover, .product-results-item.active { background:var(--bg-hover); }
    .product-results-item .prod-cod { font-size:.72rem; color:var(--text-muted); white-space:nowrap; }
    .product-results-empty { padding:.6rem .65rem; font-size:.83rem; color:var(--text-muted); }
```

- [ ] **Step 3: Declarar o estado e substituir o handler de change da franquia**

Substituir o handler atual da franquia:

```js
  document.getElementById('franchiseId').addEventListener('change', async (e) => {
    const f  = e.target.value;
    const ps = document.getElementById('products');
    ps.innerHTML = '<option value="">Selecione um produto</option>';
    document.getElementById('productCost').value = '';
    if (!f) return;
    const res  = await Auth.apiFetch(`/api/products?franchise=${encodeURIComponent(f)}`);
    const data = await res.json();
    data.forEach(p => ps.insertAdjacentHTML('beforeend',
      `<option value="${p.id}" data-cost="${p.cost}" data-sale-value="${p.sale_value || ''}" data-promo-price="${p.promotion_price || ''}">${esc(p.name)} — COD ${esc(p.code)}</option>`));
  });
```

por (declara o estado + recarrega o array):

```js
  let currentProducts = [];
  let selectedProduct = null;
  let resultsActiveIndex = -1;

  document.getElementById('franchiseId').addEventListener('change', async (e) => {
    const f = e.target.value;
    const searchEl = document.getElementById('productSearch');
    currentProducts = [];
    selectedProduct = null;
    document.getElementById('selectedProductId').value = '';
    searchEl.value = '';
    document.getElementById('productCost').value = '';
    document.getElementById('salePrice').value = '';
    hideProductResults();
    if (!f) {
      searchEl.disabled = true;
      searchEl.placeholder = 'Selecione a franquia primeiro';
      return;
    }
    const res = await Auth.apiFetch(`/api/products?franchise=${encodeURIComponent(f)}`);
    currentProducts = await res.json();
    searchEl.disabled = false;
    searchEl.placeholder = 'Buscar produto por nome ou código';
  });
```

- [ ] **Step 4: Substituir o handler de change do `#products` pelas funções do combobox**

Substituir todo o handler antigo:

```js
  document.getElementById('products').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    document.getElementById('productCost').value = opt?.dataset.cost ? parseFloat(opt.dataset.cost).toFixed(2) : '';
    const saleEl = document.getElementById('salePrice');
    const sv = opt?.dataset.saleValue;
    if (saleEl.value === '' && sv) {
      saleEl.value = parseFloat(sv).toFixed(2);
    }
  });
```

por (render/hide/select + listeners de focus/input):

```js
  function renderProductResults(query) {
    const box = document.getElementById('productResults');
    const q = (query || '').trim().toLowerCase();
    const list = q
      ? currentProducts.filter(p => p.name.toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q))
      : currentProducts;
    resultsActiveIndex = -1;
    if (!list.length) {
      box.innerHTML = '<div class="product-results-empty">Nenhum produto encontrado</div>';
      box.style.display = '';
      return;
    }
    box.innerHTML = list.map(p =>
      `<div class="product-results-item" data-id="${p.id}">
         <span>${esc(p.name)}</span>
         <span class="prod-cod">COD ${esc(String(p.code))}</span>
       </div>`).join('');
    box.style.display = '';
    box.querySelectorAll('.product-results-item').forEach(el => {
      el.addEventListener('mousedown', (ev) => { ev.preventDefault(); selectProductById(el.dataset.id); });
    });
  }

  function hideProductResults() {
    document.getElementById('productResults').style.display = 'none';
    resultsActiveIndex = -1;
  }

  function selectProductById(id) {
    const p = currentProducts.find(x => String(x.id) === String(id));
    if (!p) return;
    selectedProduct = p;
    document.getElementById('selectedProductId').value = p.id;
    document.getElementById('productSearch').value = `${p.name} — COD ${p.code}`;
    document.getElementById('productCost').value = p.cost != null ? parseFloat(p.cost).toFixed(2) : '';
    const saleEl = document.getElementById('salePrice');
    if (saleEl.value === '' && p.sale_value) {
      saleEl.value = parseFloat(p.sale_value).toFixed(2);
    }
    hideProductResults();
  }

  const productSearchEl = document.getElementById('productSearch');
  productSearchEl.addEventListener('focus', () => {
    if (productSearchEl.disabled) return;
    productSearchEl.select();
    renderProductResults(selectedProduct ? '' : productSearchEl.value);
  });
  productSearchEl.addEventListener('input', () => {
    selectedProduct = null;
    document.getElementById('selectedProductId').value = '';
    renderProductResults(productSearchEl.value);
  });
```

- [ ] **Step 5: Atualizar o checkbox promo para ler de `selectedProduct`**

Substituir o handler:

```js
  document.getElementById('promotionalPrice').addEventListener('change', (e) => {
    const costEl     = document.getElementById('productCost');
    const opt        = document.getElementById('products').selectedOptions[0];
    const promoPrice = opt?.dataset?.promoPrice;
    costEl.readOnly  = !e.target.checked;
    if (e.target.checked) {
      if (promoPrice) {
        document.getElementById('salePrice').value = promoPrice;
      }
      // Foco no Custo para o usuário editar o valor de custo promocional
      costEl.focus();
      costEl.select();
    } else {
      const sv = opt?.dataset?.saleValue;
      document.getElementById('salePrice').value = sv ? parseFloat(sv).toFixed(2) : '';
    }
  });
```

por:

```js
  document.getElementById('promotionalPrice').addEventListener('change', (e) => {
    const costEl = document.getElementById('productCost');
    costEl.readOnly = !e.target.checked;
    if (e.target.checked) {
      if (selectedProduct?.promotion_price) {
        document.getElementById('salePrice').value = parseFloat(selectedProduct.promotion_price).toFixed(2);
      }
      // Foco no Custo para o usuário editar o valor de custo promocional
      costEl.focus();
      costEl.select();
    } else {
      document.getElementById('salePrice').value = selectedProduct?.sale_value ? parseFloat(selectedProduct.sale_value).toFixed(2) : '';
    }
  });
```

- [ ] **Step 6: Atualizar o botão Adicionar para ler de `selectedProduct`**

Substituir o início do handler do `#addProductBtn`:

```js
  document.getElementById('addProductBtn').addEventListener('click', () => {
    const sel       = document.getElementById('products');
    const opt       = sel.selectedOptions[0];
    const productId = sel.value;
    const salePrice = parseFloat(document.getElementById('salePrice').value);
    const qty       = parseInt(document.getElementById('productQuantity').value) || 1;
    const isPromo   = document.getElementById('promotionalPrice').checked;
    const cost      = parseFloat(document.getElementById('productCost').value);

    if (!productId || isNaN(salePrice) || salePrice <= 0 || qty < 1) {
      return Swal.fire('Atenção', 'Preencha produto, valor de venda e quantidade corretamente.', 'warning');
    }

    const productName  = opt.textContent.split(' — COD ')[0];
    const totalProduct = salePrice * qty;
    const entry        = { id: productId, salePrice, quantity: qty, isPromotionalPrice: isPromo, productCost: isPromo ? cost : null };
```

por:

```js
  document.getElementById('addProductBtn').addEventListener('click', () => {
    const salePrice = parseFloat(document.getElementById('salePrice').value);
    const qty       = parseInt(document.getElementById('productQuantity').value) || 1;
    const isPromo   = document.getElementById('promotionalPrice').checked;
    const cost      = parseFloat(document.getElementById('productCost').value);

    if (!selectedProduct || isNaN(salePrice) || salePrice <= 0 || qty < 1) {
      return Swal.fire('Atenção', 'Selecione o produto, valor de venda e quantidade corretamente.', 'warning');
    }

    const productName  = selectedProduct.name;
    const totalProduct = salePrice * qty;
    const entry        = { id: selectedProduct.id, salePrice, quantity: qty, isPromotionalPrice: isPromo, productCost: isPromo ? cost : null };
```

- [ ] **Step 7: Limpar o combobox ao final do Adicionar**

No mesmo handler do `#addProductBtn`, localizar o bloco de reset no final:

```js
    document.getElementById('salePrice').value = '';
    document.getElementById('productQuantity').value = 1;
    document.getElementById('promotionalPrice').checked = false;
    document.getElementById('productCost').readOnly = true;
  });
```

substituir por (limpa também a busca e a seleção):

```js
    document.getElementById('salePrice').value = '';
    document.getElementById('productQuantity').value = 1;
    document.getElementById('promotionalPrice').checked = false;
    document.getElementById('productCost').readOnly = true;
    document.getElementById('productSearch').value = '';
    document.getElementById('selectedProductId').value = '';
    selectedProduct = null;
  });
```

- [ ] **Step 8: Verificar no browser (mouse)**

Reiniciar e testar:
```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pedidos.html
```
Esperado: `200`.

No navegador (http://localhost:3000/pedidos.html → novo pedido):
1. Antes de escolher franquia, o campo Produto está desabilitado com "Selecione a franquia primeiro"
2. Escolher Boticário → campo habilita; focar nele → abre lista com TODOS os produtos da franquia (nome completo + COD)
3. Digitar "aero" → filtra para os Aerosol; digitar "20" → filtra por código
4. Clicar num resultado → campo preenche com "Nome — COD x", Custo e Venda preenchem automaticamente
5. Adicionar à lista → item entra; campo de busca limpa
6. Marcar promo → custo editável; desmarcar → Venda volta ao sale_value

- [ ] **Step 9: Commit**

```bash
git add src/public/pedidos.html
git commit -m "feat(pedidos): combobox de busca de produto por nome/código na criação de pedido"
```

---

### Task 2: Navegação por teclado e fechar ao clicar fora

**Files:**
- Modify: `src/public/pedidos.html`

**Interfaces:**
- Consome: `renderProductResults`, `hideProductResults`, `selectProductById`, `resultsActiveIndex`, `#productSearch`, `#productResults` (Task 1)
- Produz: navegação por setas/Enter/Esc e fechamento ao clicar fora

- [ ] **Step 1: Adicionar navegação por teclado e clique-fora**

Logo após os listeners de `focus`/`input` do `#productSearch` (criados na Task 1, Step 4), adicionar:

```js
  function updateActiveItem(items) {
    items.forEach((el, i) => el.classList.toggle('active', i === resultsActiveIndex));
    if (resultsActiveIndex >= 0) items[resultsActiveIndex].scrollIntoView({ block: 'nearest' });
  }

  productSearchEl.addEventListener('keydown', (e) => {
    const box = document.getElementById('productResults');
    if (box.style.display === 'none') return;
    const items = Array.from(box.querySelectorAll('.product-results-item'));
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      resultsActiveIndex = Math.min(resultsActiveIndex + 1, items.length - 1);
      updateActiveItem(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      resultsActiveIndex = Math.max(resultsActiveIndex - 1, 0);
      updateActiveItem(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = resultsActiveIndex >= 0 ? items[resultsActiveIndex] : items[0];
      if (target) selectProductById(target.dataset.id);
    } else if (e.key === 'Escape') {
      hideProductResults();
    }
  });

  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#productResults') && e.target.id !== 'productSearch') {
      hideProductResults();
    }
  });
```

- [ ] **Step 2: Verificar no browser (teclado)**

No navegador, com a lista de produtos aberta:
1. Setas ↓/↑ movem o destaque (item com fundo destacado)
2. Enter seleciona o item destacado (ou o primeiro, se nenhum destacado) → preenche Custo/Venda
3. Esc fecha a lista
4. Clicar fora do campo/lista fecha a lista

- [ ] **Step 3: Commit**

```bash
git add src/public/pedidos.html
git commit -m "feat(pedidos): navegação por teclado e fechar ao clicar fora no combobox de produto"
```
