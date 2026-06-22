# Fase 1 — Polimento Visual Global — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar polimento visual de baixo risco em todo o sistema: números tabulares, foco visível, movimento reduzido, skeleton loaders e empty states ricos.

**Architecture:** CSS global novo em `src/public/css/styles.css` (classes que não colidem com regras inline). Cada página de lista troca o placeholder "Carregando..." por skeleton e usa empty state rico quando a lista vem vazia.

**Tech Stack:** HTML + CSS + JS vanilla, Bootstrap 5

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- CSS global vai em `src/public/css/styles.css`; classes novas usam nomes distintos (`.skeleton*`, `.empty-rich*`) para não colidir com `.empty-state` inline das páginas
- `font-variant-numeric: tabular-nums` no `body`
- Foco: `:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px }`
- Tokens existentes: `--accent`, `--bg-card`, `--bg-hover`, `--border`, `--text-primary`, `--text-muted`, `--success`
- Sem mudança de backend; sem testes automatizados — verificar via browser/curl
- Páginas de lista: `pedidos.html`, `clientes.html`, `produtos.html`, `estoque.html`, `promissorias.html`; dashboard: `index.html`

---

### Task 1: CSS global no styles.css

**Files:**
- Modify: `src/public/css/styles.css`

**Interfaces:**
- Produz: regras globais `tabular-nums`, `:focus-visible`, `prefers-reduced-motion`; classes `.skeleton`, `.skeleton-line`, `.skeleton-row`; classes `.empty-rich`, `.empty-rich-icon`, `.empty-rich-title`, `.empty-rich-sub`, `.empty-rich-action`

- [ ] **Step 1: Adicionar tabular-nums ao body**

Em `src/public/css/styles.css`, na regra `body { ... }` existente, acrescentar a linha:
```css
  font-variant-numeric: tabular-nums;
```

- [ ] **Step 2: Adicionar foco visível e movimento reduzido**

Logo após a regra `body { ... }`, adicionar:
```css
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: .01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: .01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- [ ] **Step 3: Adicionar skeleton e empty-rich**

No fim do arquivo `styles.css`, adicionar:
```css
/* ── Skeleton loaders ── */
.skeleton { position:relative; overflow:hidden; background:var(--bg-hover); border-radius:8px; }
.skeleton::after {
  content:""; position:absolute; inset:0; transform:translateX(-100%);
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent);
  animation:skeleton-shimmer 1.2s infinite;
}
@keyframes skeleton-shimmer { 100% { transform:translateX(100%); } }
.skeleton-line { height:14px; margin:.4rem 0; }
.skeleton-row  { height:64px; margin-bottom:.6rem; }

/* ── Empty state rico ── */
.empty-rich { text-align:center; padding:3rem 1rem; color:var(--text-muted); }
.empty-rich-icon  { font-size:3rem; opacity:.25; display:block; margin-bottom:.75rem; }
.empty-rich-title { font-size:1rem; font-weight:600; color:var(--text-primary); margin-bottom:.25rem; }
.empty-rich-sub   { font-size:.85rem; margin-bottom:1rem; }
.empty-rich-action {
  display:inline-flex; align-items:center; gap:.4rem; padding:.5rem 1rem; border-radius:8px;
  background:var(--accent); color:#fff; font-size:.85rem; font-weight:600; text-decoration:none; border:none; cursor:pointer;
}
.empty-rich-action:hover { filter:brightness(1.08); color:#fff; }
```

- [ ] **Step 4: Verificar**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
curl -s http://localhost:3000/css/styles.css | grep -c "tabular-nums\|focus-visible\|skeleton\|empty-rich"
```
Esperado: contagem ≥ 5. Abrir qualquer página e confirmar que números em tabelas alinham e o foco por Tab mostra anel azul.

- [ ] **Step 5: Commit**

```bash
git add src/public/css/styles.css
git commit -m "feat(ui): CSS global — tabular-nums, focus-visible, reduced-motion, skeleton, empty-rich"
```

---

### Task 2: Skeleton + empty states nas páginas de lista

**Files:**
- Modify: `src/public/pedidos.html`
- Modify: `src/public/clientes.html`
- Modify: `src/public/produtos.html`
- Modify: `src/public/estoque.html`
- Modify: `src/public/promissorias.html`

**Interfaces:**
- Consome: classes `.skeleton`, `.skeleton-row`, `.empty-rich*` (Task 1)
- Produz: helper local `skeletonRows(n)` em cada página e empty states ricos nas listas principais

- [ ] **Step 1: Adicionar o helper skeletonRows em cada página de lista**

No bloco `<script>` de cada uma das 5 páginas, adicionar (uma vez por página, junto das funções utilitárias):
```js
  function skeletonRows(n = 5) {
    return Array.from({ length: n }, () => '<div class="skeleton skeleton-row"></div>').join('');
  }
```

- [ ] **Step 2: Trocar o placeholder "Carregando..." pelo skeleton no início do load de cada lista**

Em cada página, na função que carrega a lista principal, **antes** do `await Auth.apiFetch(...)`, definir o conteúdo do container como skeleton em vez de "Carregando...". Padrão:
```js
  container.innerHTML = skeletonRows(6);
```
Aplicar nos containers das listas principais:
- `pedidos.html` → container da lista de pedidos
- `clientes.html` → container da lista de clientes
- `produtos.html` → container da lista de produtos
- `estoque.html` → container `#estoque-container`
- `promissorias.html` → container da lista de promissórias

Onde o HTML inicial já tem `<div class="empty-state">...Carregando...</div>`, trocar o conteúdo inicial por `<div class="skeleton skeleton-row"></div>` repetido (3–4×) para o primeiro paint não mostrar texto.

- [ ] **Step 3: Usar empty state rico quando a lista vier vazia**

Em cada página, no ramo de lista vazia da função de render, usar `.empty-rich`. Conteúdo por página:

`pedidos.html` (lista vazia):
```html
<div class="empty-rich">
  <i class="bi bi-bag-x empty-rich-icon"></i>
  <div class="empty-rich-title">Nenhum pedido ainda</div>
  <div class="empty-rich-sub">Crie seu primeiro pedido para começar.</div>
  <button class="empty-rich-action" onclick="document.getElementById('clientId')?.focus()"><i class="bi bi-plus-circle"></i> Criar pedido</button>
</div>
```

`clientes.html` (lista vazia):
```html
<div class="empty-rich">
  <i class="bi bi-people empty-rich-icon"></i>
  <div class="empty-rich-title">Nenhum cliente cadastrado</div>
  <div class="empty-rich-sub">Cadastre um cliente para começar a registrar pedidos.</div>
</div>
```

`produtos.html` (lista vazia):
```html
<div class="empty-rich">
  <i class="bi bi-box empty-rich-icon"></i>
  <div class="empty-rich-title">Nenhum produto</div>
  <div class="empty-rich-sub">Cadastre produtos para usá-los nos pedidos.</div>
</div>
```

`estoque.html` (lista vazia):
```html
<div class="empty-rich">
  <i class="bi bi-archive empty-rich-icon"></i>
  <div class="empty-rich-title">Estoque vazio</div>
  <div class="empty-rich-sub">Nenhum produto em estoque ainda.</div>
</div>
```

`promissorias.html` (lista vazia):
```html
<div class="empty-rich">
  <i class="bi bi-receipt empty-rich-icon"></i>
  <div class="empty-rich-title">Nenhuma promissória</div>
  <div class="empty-rich-sub">As promissórias dos pedidos parcelados aparecem aqui.</div>
</div>
```

Manter empty states já existentes e adequados em painéis secundários (ex: histórico "Nenhuma movimentação ainda").

- [ ] **Step 4: Verificar no browser**

Reiniciar o servidor; abrir cada página. Durante o carregamento deve aparecer o shimmer (skeleton); listas vazias mostram o empty state rico. Como o banco de teste tem dados, para ver o empty state pode-se filtrar por um termo inexistente (onde houver busca) ou confiar na inspeção do código do ramo vazio.

- [ ] **Step 5: Commit**

```bash
git add src/public/pedidos.html src/public/clientes.html src/public/produtos.html src/public/estoque.html src/public/promissorias.html
git commit -m "feat(ui): skeleton loaders e empty states ricos nas páginas de lista"
```

---

### Task 3: Skeleton + empty states no dashboard

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consome: `.skeleton`, `.skeleton-line`, `.skeleton-row`, `.empty-rich*` (Task 1)
- Produz: skeleton nos blocos assíncronos do dashboard e empty state quando não há dados

- [ ] **Step 1: Skeleton nos blocos que carregam assíncrono**

Em `index.html`, nas seções que buscam dados (cards de resumo, lista de últimos pedidos, alertas de estoque), definir o conteúdo inicial como skeleton antes do fetch:
```js
  container.innerHTML = skeletonRows(4);
```
Adicionar o helper `skeletonRows` (mesmo da Task 2, Step 1) no script do dashboard se ainda não existir.

- [ ] **Step 2: Empty state quando não há pedidos/dados**

Onde a lista de últimos pedidos vier vazia, usar:
```html
<div class="empty-rich">
  <i class="bi bi-clipboard-data empty-rich-icon"></i>
  <div class="empty-rich-title">Sem dados ainda</div>
  <div class="empty-rich-sub">Os pedidos e indicadores aparecem aqui assim que houver movimento.</div>
</div>
```

- [ ] **Step 3: Verificar no browser**

Reiniciar; abrir o dashboard. Durante o carregamento deve aparecer skeleton nos blocos; sem dados, o empty state.

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html
git commit -m "feat(ui): skeleton e empty state no dashboard"
```
