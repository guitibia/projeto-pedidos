# Fase 3 — Tema Claro/Escuro — Design

**Data:** 2026-06-22
**Branch:** Teste
**Parte de:** pacote de melhorias visuais/utilitários (Fase 3 de 4)

## Objetivo

Adicionar um tema claro completo, com botão de alternância e persistência, mantendo o escuro como padrão.

## Contexto / auditoria

- `src/public/css/styles.css` define os tokens em `:root` e os componentes usam `var(--token)`.
- As páginas usam `var(--token)` ~391 vezes (adaptam sozinhas ao trocar os tokens).
- Cores estruturais **fixas** que quebram no claro são poucas e localizadas:
  - **`#8b949e`** (= text-muted) nas páginas: `index.html` (2), `produtos.html` (2). Em `styles.css`: linhas ~448, ~475, ~611 (relativas+44).
  - **`rgba(255,255,255,.0x)`** (tints de hover que somem no claro): `clientes.html` (1), `estoque.html` (1), `index.html` (2), `pedidos.html` (2), `produtos.html` (3); `styles.css` linha 742 (shimmer do skeleton).
  - Em `styles.css` (regras de componente): `#30363d`, `#484f58`, `#1c2128`, `#0d1117`, `#f0f6fc` em scrollbar e afins.
- **Fora de escopo:** `login.html` (continua sempre escuro, sem botão) e páginas legadas não linkadas no menu (`create-product.html`, `list-products.html`, `list-orders.html`, `create-order.html`).

## Decisões

- **Padrão = escuro.** Claro é opt-in via botão.
- **Cores semânticas iguais nos dois temas** (`--accent #388bfd`, `--success #3fb950`, `--danger #f85149`, `--warning #d29922`). Motivo: muitas páginas usam essas cores **fixas inline**; manter os tokens iguais evita "dois tons" do mesmo vermelho/verde. São saturadas o suficiente para ler no claro em elementos de UI/badges.
- **Botão de alternância** no rodapé da sidebar, ao lado de "Sair", em todas as páginas.

## Componentes

### 1. Paleta clara em `css/styles.css`

Adicionar dois tokens novos ao `:root` (valores do tema escuro) e o bloco de override do tema claro:

```css
:root {
  /* ...tokens existentes... */
  --hover-tint:       rgba(255,255,255,.05);
  --skeleton-shimmer: rgba(255,255,255,.06);
}

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
  /* aliases de compatibilidade */
  --card-bg:      #ffffff;
  --border-color: #d0d7de;
  --text-color:   #1f2328;
  --bg-color:     #f6f8fa;
  /* tints */
  --hover-tint:       rgba(0,0,0,.05);
  --skeleton-shimmer: rgba(0,0,0,.05);
}
```

(As cores semânticas `--accent/--success/--danger/--warning/--info` **não** são sobrescritas.)

### 2. Tokenizar as cores estruturais fixas

- **`styles.css`**: scrollbar e regras que usam `#30363d`/`#484f58`/`#1c2128`/`#0d1117`/`#f0f6fc`/`#8b949e` → trocar pelos tokens equivalentes (`--border`, `--text-muted`, `--bg-hover`, `--bg-input`, `--text-heading`, `--text-muted`). O shimmer do skeleton (`rgba(255,255,255,.06)`) → `var(--skeleton-shimmer)`.
- **Páginas (6 ativas)**: `#8b949e` → `var(--text-muted)`; `rgba(255,255,255,.0x)` → `var(--hover-tint)`.

### 3. `src/public/js/theme.js` (novo) — aplicar tema sem flash

Carregado de forma **síncrona no `<head>`** (antes do primeiro paint):

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

Incluir `<script src="/js/theme.js"></script>` no `<head>` (após o `<link>` do `styles.css`) das 6 páginas ativas.

### 4. Botão no rodapé da sidebar

Em cada uma das 6 páginas, no `.sidebar-footer` (junto do "Sair"), adicionar antes do botão Sair:

```html
<button class="btn-logout" id="theme-toggle" onclick="toggleTheme()" style="margin-bottom:.5rem"><i class="bi bi-sun"></i> Tema claro</button>
```

## Validação

Testar **as duas paletas** em todas as 6 páginas: contraste de texto, badges de status, skeleton, modais, command palette, sidebar. Ajustar qualquer ponto que fique ilegível no claro (ex: badge específico) trocando a cor por token ou variante mais escura.

## Casos de borda

- Sem flash: o tema é aplicado pelo script no `<head>` antes do paint.
- `localStorage` indisponível (modo privado): cai no padrão escuro silenciosamente (try/catch).
- `login.html` permanece escuro (não recebe `theme.js` nem botão).
- O `data-theme` fica em `<html>`; todos os `var(--token)` reavaliam automaticamente.

## Fora de escopo (Fase 4)

- Export CSV/PDF e gráfico de vendas.
