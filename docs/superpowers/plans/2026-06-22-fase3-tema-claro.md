# Fase 3 — Tema Claro/Escuro — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um tema claro completo com botão de alternância e persistência, mantendo o escuro como padrão.

**Architecture:** `html[data-theme="light"]` sobrescreve os tokens estruturais em `styles.css`. Cores estruturais fixas (poucas) viram tokens. Um `theme.js` síncrono no `<head>` aplica o tema antes do paint; botão no rodapé da sidebar alterna e persiste em localStorage.

**Tech Stack:** CSS custom properties, JS vanilla, Bootstrap Icons

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- Padrão = escuro; claro é opt-in (`data-theme="light"` em `<html>`)
- Cores semânticas (`--accent #388bfd`, `--success #3fb950`, `--danger #f85149`, `--warning #d29922`) **iguais nos dois temas** (não sobrescrever)
- Páginas ativas: `index.html`, `clientes.html`, `produtos.html`, `pedidos.html`, `estoque.html`, `promissorias.html`
- `login.html` e páginas legadas (`create-product`, `list-products`, `list-orders`, `create-order`) ficam de fora
- `theme.js` carregado **síncrono no `<head>`**, após o `<link>` do `styles.css`
- Sem testes automatizados — verificar via browser/curl

---

### Task 1: Paleta clara e tokenização em styles.css

**Files:**
- Modify: `src/public/css/styles.css`

**Interfaces:**
- Produz: tokens `--hover-tint`, `--skeleton-shimmer`; bloco `html[data-theme="light"]`; cores estruturais via token

- [ ] **Step 1: Adicionar os dois tokens novos ao :root**

No bloco `:root { ... }`, logo após os aliases de compatibilidade (`--bg-color: #0d1117;`), adicionar:
```css
  --hover-tint:       rgba(255,255,255,.05);
  --skeleton-shimmer: rgba(255,255,255,.06);
```

- [ ] **Step 2: Adicionar o bloco do tema claro**

Logo após o fechamento do `:root { ... }` (antes de `*, *::before, *::after`), adicionar:
```css
html[data-theme="light"] {
  --bg:           #f6f8fa;
  --bg-card:      #ffffff;
  --bg-input:     #ffffff;
  --bg-hover:     #eef1f4;
  --bg-table-hd:  #f6f8fa;
  --border:       #d0d7de;
  --border-focus: #0969da;
  --text-primary: #1f2328;
  --text-muted:   #59636e;
  --text-heading: #1f2328;
  --sidebar-bg:     #ffffff;
  --sidebar-hover:  #eef1f4;
  --sidebar-active: #0969da;
  --shadow-sm: 0 1px 3px rgba(0,0,0,.08);
  --shadow-md: 0 4px 16px rgba(0,0,0,.10);
  --shadow-lg: 0 8px 28px rgba(0,0,0,.14);
  --card-bg:      #ffffff;
  --border-color: #d0d7de;
  --text-color:   #1f2328;
  --bg-color:     #f6f8fa;
  --hover-tint:       rgba(0,0,0,.05);
  --skeleton-shimmer: rgba(0,0,0,.05);
}
```

- [ ] **Step 3: Tokenizar a scrollbar**

Trocar:
```css
::-webkit-scrollbar-thumb { background: #30363d; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #484f58; }
```
por:
```css
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-muted); }
```

- [ ] **Step 4: Tokenizar cores estruturais nos componentes**

Aplicar estas substituições pontuais (cada `old` é único no arquivo):
- `.stat-card.gray   .stat-value { color: #8b949e; }` → `color: var(--text-muted);`
- `.stat-card.gray   .stat-icon { background: rgba(72,79,88,.2);     color: #8b949e; }` → `color: var(--text-muted);` (manter o `background` como está)
- `.form-control::placeholder { color: #484f58; }` → `color: var(--text-muted);`
- A regra que contém `background: #1c2128;` → `background: var(--bg-hover);`
- `.table-striped tbody tr:nth-child(even) td { background: #0d1117; }` → `background: var(--bg);`
- `.badge.bg-secondary { background: rgba(139,148,158,.15) !important; color: #8b949e; border: 1px solid var(--border); }` → `color: var(--text-muted);`

- [ ] **Step 5: Tokenizar o shimmer do skeleton**

Trocar a linha do gradiente do skeleton:
```css
  background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent);
```
por:
```css
  background:linear-gradient(90deg, transparent, var(--skeleton-shimmer), transparent);
```

- [ ] **Step 6: Verificar**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
curl -s http://localhost:3000/css/styles.css | grep -c "data-theme=\"light\"\|--hover-tint\|--skeleton-shimmer"
```
Esperado: ≥ 3.

- [ ] **Step 7: Commit**

```bash
git add src/public/css/styles.css
git commit -m "feat(ui): paleta de tema claro e tokenização de cores estruturais"
```

---

### Task 2: theme.js + inclusão no head + botão na sidebar

**Files:**
- Create: `src/public/js/theme.js`
- Modify: `src/public/index.html`, `clientes.html`, `produtos.html`, `pedidos.html`, `estoque.html`, `promissorias.html`

**Interfaces:**
- Consome: tokens do tema claro (Task 1)
- Produz: globais `toggleTheme()`, `syncThemeBtn()`; aplica tema cedo

- [ ] **Step 1: Criar `src/public/js/theme.js`**

```js
(function () {
  try { if (localStorage.getItem('theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}
})();
function toggleTheme() {
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) { document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('theme', 'dark'); } catch (e) {} }
  else { document.documentElement.setAttribute('data-theme', 'light'); try { localStorage.setItem('theme', 'light'); } catch (e) {} }
  syncThemeBtn();
}
function syncThemeBtn() {
  var b = document.getElementById('theme-toggle');
  if (!b) return;
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  b.innerHTML = isLight ? '<i class="bi bi-moon-stars"></i> Tema escuro' : '<i class="bi bi-sun"></i> Tema claro';
}
document.addEventListener('DOMContentLoaded', syncThemeBtn);
```

- [ ] **Step 2: Incluir o theme.js no `<head>` das 6 páginas**

Em cada página, logo após `<link rel="stylesheet" href="/css/styles.css">`, adicionar:
```html
  <script src="/js/theme.js"></script>
```

- [ ] **Step 3: Adicionar o botão de alternância no rodapé da sidebar das 6 páginas**

Em cada página, dentro de `<div class="sidebar-footer">`, **antes** do `<button class="btn-logout" id="btn-logout">`, adicionar:
```html
    <button class="btn-logout" id="theme-toggle" onclick="toggleTheme()" style="margin-bottom:.5rem"><i class="bi bi-sun"></i> Tema claro</button>
```

- [ ] **Step 4: Verificar**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
curl -s -o /dev/null -w "theme.js: %{http_code}\n" http://localhost:3000/js/theme.js
for f in index clientes produtos pedidos estoque promissorias; do
  echo -n "$f head+btn: "; curl -s http://localhost:3000/$f.html | grep -c "js/theme.js\|id=\"theme-toggle\""
done
node -e "new Function(require('fs').readFileSync('src/public/js/theme.js','utf8')); console.log('theme.js OK')"
```
Esperado: `theme.js: 200`; cada página retorna `2`; `theme.js OK`.
No navegador: clicar em "Tema claro" no rodapé → a interface fica clara; recarregar → continua clara (persistiu); clicar de novo → volta ao escuro.

- [ ] **Step 5: Commit**

```bash
git add src/public/js/theme.js src/public/index.html src/public/clientes.html src/public/produtos.html src/public/pedidos.html src/public/estoque.html src/public/promissorias.html
git commit -m "feat(ui): theme.js e botão de alternância de tema na sidebar"
```

---

### Task 3: Tokenizar cores estruturais fixas nas páginas

**Files:**
- Modify: `src/public/index.html`, `produtos.html`, `clientes.html`, `estoque.html`, `pedidos.html`

**Interfaces:**
- Consome: tokens `--text-muted`, `--hover-tint` (Task 1)
- Produz: páginas sem cor estrutural fixa que quebre no claro

- [ ] **Step 1: Trocar `#8b949e` por `var(--text-muted)` nas páginas**

Usar replace-all do literal `#8b949e` → `var(--text-muted)` em:
- `src/public/index.html`
- `src/public/produtos.html`

(Comando seguro por arquivo, ex.: substituir todas as ocorrências de `#8b949e`.)

- [ ] **Step 2: Trocar `rgba(255,255,255,.0x)` por `var(--hover-tint)` nas páginas**

Substituir cada ocorrência de `rgba(255,255,255,.03)`, `rgba(255,255,255,.04)`, `rgba(255,255,255,.06)` por `var(--hover-tint)` em:
- `src/public/clientes.html` (`.03`)
- `src/public/estoque.html` (`.06`)
- `src/public/index.html` (`.04`, `.06`)
- `src/public/pedidos.html` (`.03` ×2)
- `src/public/produtos.html` (`.03`, `.06`, `.04`)

- [ ] **Step 3: Verificar que não sobrou cor estrutural fixa nas páginas ativas**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos/src/public"
echo "restantes (esperado 0):"
grep -roE "rgba\(255,\s?255,\s?255|#8b949e" index.html clientes.html produtos.html pedidos.html estoque.html | wc -l
node -e "for (const f of ['index','clientes','produtos','pedidos','estoque','promissorias']) { const h=require('fs').readFileSync(f+'.html','utf8'); const m=h.match(/<script>([\s\S]*?)<\/script>/); if(m) new Function(m[1]); } console.log('JS OK')"
```
Esperado: `0`; `JS OK`.

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html src/public/produtos.html src/public/clientes.html src/public/estoque.html src/public/pedidos.html
git commit -m "feat(ui): tokeniza cores estruturais das páginas para o tema claro"
```

---

### Task 4: Teste visual das duas paletas e ajustes

**Files:**
- Modify: (conforme necessário) páginas/`styles.css` para corrigir contraste no claro

**Interfaces:**
- Consome: tudo das Tasks 1–3

- [ ] **Step 1: Testar cada página nos dois temas**

Reiniciar o servidor. No navegador, com `Tema claro` ativo, abrir cada página e verificar:
- Dashboard: cards, gráfico, tabela de últimos pedidos, badges
- Clientes / Produtos / Pedidos / Estoque / Promissórias: listas, badges de status, skeleton (recarregar), modais, command palette (Ctrl+K)
- Sidebar, foco por teclado (anel azul), empty states

Procurar texto/badge ilegível (baixo contraste) no claro.

- [ ] **Step 2: Corrigir pontos ilegíveis**

Para cada ponto problemático achado, trocar a cor fixa por token apropriado (ex.: texto `var(--text-muted)`/`var(--text-primary)`) ou, se for um badge semântico ilegível, escurecer só aquele texto. Aplicar a correção mínima no arquivo correspondente.

(Se nenhum ponto for encontrado, registrar "sem ajustes necessários" e pular o commit deste passo.)

- [ ] **Step 3: Commit (se houve ajustes)**

```bash
git add -A
git commit -m "fix(ui): ajustes de contraste no tema claro"
```
