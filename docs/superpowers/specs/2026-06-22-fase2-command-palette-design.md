# Fase 2 — Command Palette + Atalhos — Design

**Data:** 2026-06-22
**Branch:** Teste
**Parte de:** pacote de melhorias visuais/utilitários (Fase 2 de 4)

## Objetivo

Adicionar uma command palette (Ctrl+K) para navegar e pular direto para qualquer cliente, produto ou pedido, além de atalhos de teclado globais e um painel de ajuda que mostra o que cada tecla faz.

## Contexto

- Todas as páginas autenticadas incluem `/js/auth.js` (objeto global `Auth` com `apiFetch`). A command palette será um novo `/js/command-palette.js` incluído logo após o `auth.js` em cada página.
- Endpoints existentes: `GET /api/clients`, `GET /api/products/all`, `GET /api/orders`.
- Páginas: `index.html`, `clientes.html`, `produtos.html`, `pedidos.html`, `estoque.html`, `promissorias.html`. (login.html **não** recebe a palette.)
- Tema escuro via tokens (`--bg-card`, `--border`, `--text-primary`, `--text-muted`, `--accent`, `--bg-hover`).

## Componentes

### 1. `src/public/js/command-palette.js` (novo, compartilhado)

Script autoinicializável (IIFE) que ao carregar:
- **Injeta no DOM** (uma vez) o overlay da palette e o modal de ajuda, ambos ocultos. Sem precisar editar o `<body>` de cada página.
- **Estilos:** injeta um `<style>` próprio (escopo por classes `cmdk-*`) usando os tokens do tema.
- **Atalhos globais** (via `keydown` no `document`), só disparam quando o foco **não** está em `input`, `textarea`, `select` ou elemento `contenteditable`:
  - `Ctrl+K` (ou `Cmd+K`) **ou** `/` → abre a palette
  - `n` → `/pedidos.html` (novo pedido) · `p` → `/produtos.html` · `c` → `/clientes.html` · `d` → `/` (dashboard) · `e` → `/estoque.html`
  - `?` → abre o painel de ajuda de atalhos
  - `Esc` → fecha palette/ajuda se abertos
- **Palette aberta:**
  - Campo de busca no topo; `↑`/`↓` movem o destaque; `Enter` executa o item destacado; `Esc` fecha; clique fora fecha.
  - **Itens fixos (sempre):** navegação (Dashboard, Clientes, Produtos, Pedidos, Estoque, Promissórias), ações (Novo pedido, Novo produto) e "Atalhos de teclado" (abre a ajuda).
  - **Busca de entidades:** ao digitar (≥ 2 caracteres), busca clientes/produtos/pedidos. Os dados são carregados via `Auth.apiFetch` na primeira abertura e cacheados em memória; filtro client-side (case-insensitive) por nome (clientes), nome/código (produtos), id/cliente (pedidos). Cada resultado mostra ícone + rótulo + tipo.
  - **Executar entidade:**
    - produto → `window.location = '/produtos.html?q=' + encodeURIComponent(nome)`
    - cliente → `window.location = '/clientes.html?client=' + id`
    - pedido → `window.location = '/pedidos.html?order=' + id`
- **Painel de ajuda (`?`)**: modal listando todos os atalhos em tabela (tecla → ação): `Ctrl+K` / `/`, `n`, `p`, `c`, `d`, `e`, `?`, `Esc`, e dentro da palette `↑`/`↓`/`Enter`.

### 2. Leitura de parâmetros nas páginas de destino

- **`produtos.html`** — após `loadProducts()`, se houver `?q=` na URL, preencher `#search` com o valor e chamar `applyFiltersAndSort()`.
- **`clientes.html`** — após `loadClients()`, se houver `?client=<id>`, setar `#clientSelect.value` e chamar `loadClientOrders()`.
- **`pedidos.html`** — após `loadOrders()`, se houver `?order=<id>`, chamar `switchTab` para a aba "listar" e `viewOrder(<id>)`.

### 3. Inclusão do script

Adicionar `<script src="/js/command-palette.js"></script>` logo após `<script src="/js/auth.js"></script>` em cada uma das 6 páginas.

## Abordagem

1. **command-palette.js** primeiro (componente isolado, autoinicializável) + inclusão nas páginas — já entrega navegação, ações, atalhos e ajuda.
2. **Busca de entidades** (depende de apiFetch — já disponível) dentro do mesmo arquivo.
3. **Deep-links** nas 3 páginas de destino.

## Casos de borda

- Atalhos de letra única são ignorados quando há campo de texto focado (evita disparo acidental ao digitar).
- Se uma chamada de entidade falhar, a palette ainda funciona com navegação/ações (busca de entidade apenas não retorna resultados daquele tipo).
- `Ctrl+K` recebe `preventDefault` para não acionar atalhos do navegador.
- Reabrir a palette reaproveita os dados já carregados (cache em memória da sessão da página).
- A palette não é injetada no `login.html` (não incluímos o script lá).

## Fora de escopo (outras fases)

- Tema claro/escuro (Fase 3).
- Export CSV/PDF e gráfico de vendas (Fase 4).
