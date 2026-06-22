# Fase 1 — Polimento Visual Global — Design

**Data:** 2026-06-22
**Branch:** Teste
**Parte de:** pacote de melhorias visuais/utilitários (Fase 1 de 4)

## Objetivo

Elevar o polimento visual do sistema com mudanças de baixo risco que valem para todas as páginas: números tabulares, foco visível para teclado, respeito a `prefers-reduced-motion`, skeleton loaders no carregamento e empty states mais ricos.

## Contexto

- CSS compartilhado em `src/public/css/styles.css` com tokens (`--accent`, `--bg-card`, `--border`, `--text-muted`, `--text-primary`, `--success`...).
- Cada página tem um `<style>` inline; a classe `.empty-state` é **redefinida inline** em várias páginas (base: `text-align:center; padding:3rem 1rem; color:var(--text-muted)`), então o que for global não pode colidir com ela.
- Placeholders de carregamento usam `<div class="empty-state"><i class="bi bi-hourglass-split"></i>Carregando...</div>`.
- Páginas principais: `index.html` (dashboard), `pedidos.html`, `clientes.html`, `produtos.html`, `estoque.html`, `promissorias.html`.

## Componentes

### 1. CSS global novo em `css/styles.css` (não conflita com regras inline)

- **Números tabulares:** `body { font-variant-numeric: tabular-nums; }` — dígitos de largura fixa em toda a UI.
- **Foco visível:**
  ```css
  :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: 4px; }
  ```
- **Movimento reduzido:**
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; scroll-behavior: auto !important; }
  }
  ```
- **Skeleton (shimmer):**
  ```css
  .skeleton { position:relative; overflow:hidden; background:var(--bg-hover); border-radius:8px; }
  .skeleton::after { content:""; position:absolute; inset:0; transform:translateX(-100%);
    background:linear-gradient(90deg, transparent, rgba(255,255,255,.06), transparent); animation:skeleton-shimmer 1.2s infinite; }
  @keyframes skeleton-shimmer { 100% { transform:translateX(100%); } }
  .skeleton-line { height:14px; margin:.4rem 0; }
  .skeleton-row { height:64px; margin-bottom:.6rem; }
  ```
- **Empty state rico (classes novas que as páginas não definem, então não colidem):**
  ```css
  .empty-rich { text-align:center; padding:3rem 1rem; color:var(--text-muted); }
  .empty-rich .empty-rich-icon { font-size:3rem; opacity:.25; display:block; margin-bottom:.75rem; }
  .empty-rich .empty-rich-title { font-size:1rem; font-weight:600; color:var(--text-primary); margin-bottom:.25rem; }
  .empty-rich .empty-rich-sub { font-size:.85rem; margin-bottom:1rem; }
  .empty-rich .empty-rich-action { display:inline-flex; align-items:center; gap:.4rem; padding:.5rem 1rem; border-radius:8px;
    background:var(--accent); color:#fff; font-size:.85rem; font-weight:600; text-decoration:none; border:none; cursor:pointer; }
  ```

### 2. Skeleton loaders por página

Substituir o placeholder `"Carregando..."` dos containers de lista pelas marcas de skeleton **enquanto os dados não chegaram**. Padrão reutilizável: uma função JS local `skeletonRows(n)` que retorna `n` divs `<div class="skeleton skeleton-row"></div>`. Aplicar onde hoje há "Carregando..." nas páginas:
- `pedidos.html` — lista de pedidos
- `clientes.html` — lista de clientes
- `produtos.html` — lista de produtos
- `estoque.html` — tabela de estoque (e manter o padrão nos painéis Log/Descontos)
- `promissorias.html` — lista de promissórias
- `index.html` — cards/listas do dashboard que carregam assíncrono

### 3. Empty states ricos por página

Onde a lista volta **vazia** (não carregando), usar `.empty-rich` com ícone + título + subtítulo + ação:
- Pedidos vazio → "Nenhum pedido ainda" + botão que foca/abre o formulário de novo pedido.
- Clientes vazio → "Nenhum cliente cadastrado" + ação para cadastrar.
- Produtos vazio → "Nenhum produto" + ação para cadastrar.
- Estoque/Promissórias vazio → ícone + título + subtítulo (sem ação obrigatória).

Onde já existe um empty state simples e adequado (ex: "Nenhuma movimentação ainda" no histórico), manter — o foco é nas listas principais.

## Abordagem

- **Global primeiro** (Task de CSS no `styles.css`) — efeito imediato em todas as páginas sem tocar HTML.
- **Depois por página** — aplicar skeleton e empty-rich, agrupando as páginas de lista e tratando o dashboard à parte (estrutura diferente).

## Casos de borda

- O `font-variant-numeric: tabular-nums` no `body` afeta texto comum também; é aceitável e desejável num app de dados (alinhamento de números). Inter renderiza bem.
- As regras `.empty-state` inline das páginas continuam válidas; as novas usam nomes distintos (`.empty-rich`, `.skeleton*`) para evitar colisão de cascata.
- Skeleton só aparece no estado de carregamento; ao chegar os dados, o conteúdo real substitui (já é o fluxo atual, só troca o placeholder).

## Fora de escopo (outras fases)

- Command palette / atalhos (Fase 2).
- Tema claro/escuro (Fase 3).
- Export CSV/PDF e gráfico de vendas (Fase 4).
