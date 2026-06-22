# Fase 4 — Export CSV/PDF + Gráfico de Vendas Diário — Design

**Data:** 2026-06-22
**Branch:** Teste
**Parte de:** pacote de melhorias visuais/utilitários (Fase 4 de 4)

## Objetivo

Permitir exportar listas em CSV e PDF (Pedidos, Produtos, Estoque, Promissórias) e adicionar uma visão de vendas por dia (últimos 30) no gráfico do dashboard, via alternância com a visão mensal já existente.

## Contexto

- O dashboard já tem um gráfico `#salesChart` (Chart.js) com **Vendas & Lucro — últimos 12 meses** (`d.vendasMensais`).
- `dashboardController.getDashboard` já agrega mensal; falta o diário.
- Dados já carregados nas páginas: `produtos.html` → `allProducts`; `estoque.html` → `allEstoque`; `pedidos.html` → `orders` (local, precisa virar módulo); `promissorias.html` → `todasParcelas` (local, precisa virar módulo).
- Existe o padrão de "imprimir" via `window.open` + `print()` em `pedidos.html` (reaproveitar para PDF).
- Tema claro/escuro por tokens (Fase 3).

## Componentes

### 1. `src/public/js/export-utils.js` (novo, compartilhado)

```js
function exportCsv(filename, headers, rows) {
  const esc = v => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const linhas = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const csv = '﻿' + linhas.join('\r\n');                 // BOM p/ Excel + acentos
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename.endsWith('.csv') ? filename : filename + '.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportPdf(title, headers, rows) {
  const w = window.open('', '', 'width=900,height=650');
  const th = headers.map(h => `<th>${h}</th>`).join('');
  const trs = rows.map(r => `<tr>${r.map(c => `<td>${c == null ? '' : c}</td>`).join('')}</tr>`).join('');
  w.document.write(`<html><head><title>${title}</title><style>
    body{font-family:Arial,sans-serif;padding:24px;color:#222}
    h3{text-align:center;margin:0 0 16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th,td{border:1px solid #ccc;padding:6px 8px;text-align:left}
    th{background:#f0f0f0}
    </style></head><body>
    <h3>${title}</h3>
    <table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>
    </body></html>`);
  w.document.close();
  w.focus();
  w.print();
}
```

Incluir `<script src="/js/export-utils.js"></script>` (após `auth.js`) em: `pedidos.html`, `produtos.html`, `estoque.html`, `promissorias.html`.

### 2. Botões de exportar por página

Cada página ganha, na barra de cabeçalho/contagem, dois botões pequenos **CSV** e **PDF** que montam `headers` + `rows` a partir dos dados em memória e chamam os helpers.

- **`pedidos.html`** (aba Listar) — capturar os pedidos em um `let allOrders = []` (preenchido em `loadOrders`). Colunas: `Nº, Cliente, Pagamento, Status, Total`. Linhas a partir de `allOrders`.
- **`produtos.html`** — usar `allProducts`. Colunas: `Nome, Código, Franquia, Custo, Venda, Estoque` (custo de `cost`, venda de `sale_value`).
- **`estoque.html`** — usar `allEstoque`. Colunas: `Produto, Código, Franquia, Custo, Estoque, Entradas, Saídas`.
- **`promissorias.html`** — capturar as parcelas em `let allParcelas = []` (preenchido em `loadPromissorias`). Colunas: `Fornecedor, Parcela, Valor, Status, Vencimento`.

Valores monetários no CSV/PDF: número com 2 casas (sem "R$", para facilitar no Excel) ou `fmt()` no PDF — usar número simples nos dois para consistência.

### 3. Gráfico diário no dashboard

**Backend (`dashboardController.js`)** — adicionar agregação diária (espelha a mensal), retornando `vendasDiarias: { labels, vendas, lucro }` dos últimos 30 dias:

```js
const [diarios] = await db.query(`
  SELECT DATE(o.created_at) AS dia,
         SUM(op.sale_price * op.quantity)                AS totalVendas,
         SUM((op.sale_price - p.cost) * op.quantity)     AS totalLucro
  FROM orders o
  JOIN order_products op ON o.id = op.order_id
  JOIN products p ON op.product_id = p.id
  WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
  GROUP BY dia ORDER BY dia ASC
`);
const diasLabels = [], diasVendas = [], diasLucro = [];
for (let i = 29; i >= 0; i--) {
  const d = new Date(); d.setDate(d.getDate() - i);
  const key   = d.toISOString().slice(0, 10);
  const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  const found = diarios.find(r => (r.dia instanceof Date ? r.dia.toISOString().slice(0,10) : String(r.dia).slice(0,10)) === key);
  diasLabels.push(label);
  diasVendas.push(found ? parseFloat(found.totalVendas) : 0);
  diasLucro.push(found ? parseFloat(found.totalLucro) : 0);
}
```
Incluir `vendasDiarias: { labels: diasLabels, vendas: diasVendas, lucro: diasLucro }` no `res.json`.

**Frontend (`index.html`)** — acima do `#salesChart`, dois pills **"30 dias"** e **"12 meses"**; o título do card vira dinâmico. Guardar `d.vendasDiarias` e `d.vendasMensais`; uma função `setChartRange('dia'|'mes')` troca labels + datasets e dá `salesChart.update()`. Default ao carregar = **30 dias**.

## Casos de borda

- Lista vazia ao exportar → avisar via `Swal` ("Nada para exportar.") em vez de gerar arquivo vazio.
- CSV usa `;` como separador (padrão BR no Excel) e BOM para acentos.
- PDF depende do diálogo de impressão do navegador (salvar como PDF) — sem dependência nova.
- Sem dados nos últimos 30 dias → gráfico mostra a linha em zero (labels presentes).
- `DATE(o.created_at)` pode vir como `Date` ou string dependendo do driver — o `found` trata os dois casos.

## Fora de escopo

- Exportar Clientes/Dashboard (YAGNI; foco nas 4 listas escolhidas).
- Filtros de período no export (exporta o que está carregado na tela).
