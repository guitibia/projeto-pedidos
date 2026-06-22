# Venda Automática na Criação de Pedido — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ao selecionar um produto na criação de pedido, preencher automaticamente o campo Venda com o `sale_value` do produto, só quando o campo estiver vazio.

**Architecture:** Mudança 100% frontend em `src/public/pedidos.html`. Cada `<option>` de produto passa a carregar `data-sale-value`; o handler de seleção preenche a Venda a partir desse atributo quando o campo está vazio; o desmarcar do checkbox promo restaura a Venda para o `sale_value`.

**Tech Stack:** HTML + JS vanilla, Bootstrap 5

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- Arquivo único: `src/public/pedidos.html` — nenhuma mudança de backend
- Venda (`#salePrice`) preenche com `sale_value` **somente quando vazia** — nunca sobrescreve valor digitado na seleção de produto
- Venda permanece editável
- `Auth.apiFetch` para chamadas de API; `esc()` para dados do banco em HTML
- Origem da Venda: `sale_value` (valor de cadastro), nunca `cost + %`
- `GET /api/products?franchise=` já retorna `sale_value` (SELECT *) — não precisa tocar
- Sem testes automatizados — verificar via browser/curl

---

### Task 1: Venda automática a partir de sale_value

**Files:**
- Modify: `src/public/pedidos.html`

**Interfaces:**
- Consome: `sale_value` retornado por `GET /api/products?franchise=` (já existe)
- Produz: campo `#salePrice` auto-preenchido a partir de `data-sale-value` da option selecionada

- [ ] **Step 1: Adicionar data-sale-value à montagem das options**

Em `src/public/pedidos.html`, no handler `franchiseId` change (em torno da linha 524-525), substituir a linha que insere a option:

```js
    data.forEach(p => ps.insertAdjacentHTML('beforeend',
      `<option value="${p.id}" data-cost="${p.cost}" data-promo-price="${p.promotion_price || ''}">${esc(p.name)} — COD ${esc(p.code)}</option>`));
```

por:

```js
    data.forEach(p => ps.insertAdjacentHTML('beforeend',
      `<option value="${p.id}" data-cost="${p.cost}" data-sale-value="${p.sale_value || ''}" data-promo-price="${p.promotion_price || ''}">${esc(p.name)} — COD ${esc(p.code)}</option>`));
```

- [ ] **Step 2: Preencher Venda ao selecionar produto (só quando vazia)**

Substituir o handler de change do `#products` (em torno das linhas 528-531):

```js
  document.getElementById('products').addEventListener('change', (e) => {
    const opt = e.target.selectedOptions[0];
    document.getElementById('productCost').value = opt?.dataset.cost ? parseFloat(opt.dataset.cost).toFixed(2) : '';
  });
```

por:

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

- [ ] **Step 3: Desmarcar promo restaura a Venda para sale_value**

No handler de change do `#promotionalPrice` (em torno das linhas 533-548), o ramo `else` (desmarcar) hoje limpa a Venda:

```js
    } else {
      document.getElementById('salePrice').value = '';
    }
```

Substituir por (restaura o `sale_value` do produto selecionado):

```js
    } else {
      const sv = opt?.dataset?.saleValue;
      document.getElementById('salePrice').value = sv ? parseFloat(sv).toFixed(2) : '';
    }
```

(Obs: a variável `opt` já existe nesse handler — `const opt = document.getElementById('products').selectedOptions[0];`.)

- [ ] **Step 4: Verificar no browser**

Reiniciar o servidor e testar:
```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/pedidos.html
```
Esperado: `200`.

No navegador (http://localhost:3000/pedidos.html), abrir o formulário de novo pedido:
1. Selecionar franquia Boticário → produto "Aerosol Man Masculino" → Custo mostra 33,92 e Venda preenche 39,91 automaticamente
2. Apagar a Venda, digitar 50, trocar de produto → Venda permanece 50 (não sobrescreve valor digitado)
3. Adicionar à lista → Venda limpa; selecionar outro produto → Venda preenche com o sale_value dele
4. Marcar "valor promocional", editar o custo, desmarcar → Venda volta para o sale_value do produto

- [ ] **Step 5: Commit**

```bash
git add src/public/pedidos.html
git commit -m "feat(pedidos): Venda preenche automaticamente com sale_value ao selecionar produto"
```
