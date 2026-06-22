# Fase 4 — Export CSV/PDF + Gráfico Diário — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exportar listas em CSV/PDF (Pedidos, Produtos, Estoque, Promissórias) e adicionar a visão de vendas por dia (30) ao gráfico do dashboard via toggle.

**Architecture:** Um `/js/export-utils.js` compartilhado expõe `exportCsv`/`exportPdf`. Cada página de lista monta cabeçalhos+linhas dos dados em memória e chama os helpers. O `dashboardController` ganha `vendasDiarias`; o `index.html` ganha um toggle 30 dias/12 meses que troca os dados do gráfico existente.

**Tech Stack:** JS vanilla, Chart.js (já presente), Node/Express, MySQL

## Global Constraints

- Branch de trabalho: `Teste` — nunca commitar direto na `main`
- Novo arquivo: `src/public/js/export-utils.js`, incluído após `auth.js` em pedidos/produtos/estoque/promissorias
- CSV: separador `;`, BOM para acentos; valores monetários como número com 2 casas (sem "R$")
- PDF: `window.open` + `print()` (sem dependência nova)
- Lista vazia ao exportar → `Swal.fire('Atenção','Nada para exportar.','info')`
- Gráfico: toggle "30 dias"/"12 meses"; default 30 dias; mantém séries Vendas + Lucro
- `Auth.apiFetch` para API; tokens de tema; sem testes automatizados — verificar via browser/curl

---

### Task 1: export-utils.js + inclusão

**Files:**
- Create: `src/public/js/export-utils.js`
- Modify: `pedidos.html`, `produtos.html`, `estoque.html`, `promissorias.html`

**Interfaces:**
- Produz: `exportCsv(filename, headers, rows)` e `exportPdf(title, headers, rows)` (globais)

- [ ] **Step 1: Criar `src/public/js/export-utils.js`**

```js
function exportCsv(filename, headers, rows) {
  const esc = v => {
    const s = (v == null ? '' : String(v)).replace(/"/g, '""');
    return /[",\n;]/.test(s) ? `"${s}"` : s;
  };
  const linhas = [headers.map(esc).join(';'), ...rows.map(r => r.map(esc).join(';'))];
  const csv = '﻿' + linhas.join('\r\n');
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

- [ ] **Step 2: Incluir o script nas 4 páginas**

Após `<script src="/js/auth.js"></script>` em `pedidos.html`, `produtos.html`, `estoque.html`, `promissorias.html`, adicionar:
```html
<script src="/js/export-utils.js"></script>
```

- [ ] **Step 3: Verificar**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
curl -s -o /dev/null -w "export-utils.js: %{http_code}\n" http://localhost:3000/js/export-utils.js
node -e "new Function(require('fs').readFileSync('src/public/js/export-utils.js','utf8')); console.log('export-utils OK')"
for f in pedidos produtos estoque promissorias; do echo -n "$f: "; curl -s http://localhost:3000/$f.html | grep -c "export-utils.js"; done
```
Esperado: `200`; `export-utils OK`; cada página `1`.

- [ ] **Step 4: Commit**

```bash
git add src/public/js/export-utils.js src/public/pedidos.html src/public/produtos.html src/public/estoque.html src/public/promissorias.html
git commit -m "feat(export): export-utils.js (CSV/PDF) incluído nas páginas de lista"
```

---

### Task 2: Botões e dados de exportação por página

**Files:**
- Modify: `pedidos.html`, `produtos.html`, `estoque.html`, `promissorias.html`

**Interfaces:**
- Consome: `exportCsv`, `exportPdf` (Task 1)
- Produz: botões CSV/PDF e funções de exportação por página

- [ ] **Step 1: produtos.html — botões + função**

No cabeçalho onde está `id="product-count"`, adicionar ao lado:
```html
<button class="btn btn-sm btn-outline-secondary" onclick="exportarProdutos('csv')"><i class="bi bi-filetype-csv"></i> CSV</button>
<button class="btn btn-sm btn-outline-secondary" onclick="exportarProdutos('pdf')"><i class="bi bi-filetype-pdf"></i> PDF</button>
```
No `<script>`, adicionar:
```js
  function exportarProdutos(fmtTipo) {
    if (!allProducts.length) return Swal.fire('Atenção', 'Nada para exportar.', 'info');
    const headers = ['Nome', 'Código', 'Franquia', 'Custo', 'Venda', 'Estoque'];
    const rows = allProducts.map(p => [p.name, p.code, p.franchise,
      Number(p.cost || 0).toFixed(2), Number(p.sale_value || 0).toFixed(2), p.estoque]);
    if (fmtTipo === 'csv') exportCsv('produtos', headers, rows);
    else exportPdf('Produtos', headers, rows);
  }
```

- [ ] **Step 2: estoque.html — botões + função**

No hero (ao lado dos botões "Log Geral"/"Descontos"), adicionar:
```html
<button class="btn btn-sm btn-outline-secondary" onclick="exportarEstoque('csv')"><i class="bi bi-filetype-csv"></i> CSV</button>
<button class="btn btn-sm btn-outline-secondary" onclick="exportarEstoque('pdf')"><i class="bi bi-filetype-pdf"></i> PDF</button>
```
No `<script>`:
```js
  function exportarEstoque(fmtTipo) {
    if (!allEstoque.length) return Swal.fire('Atenção', 'Nada para exportar.', 'info');
    const headers = ['Produto', 'Código', 'Franquia', 'Custo', 'Estoque', 'Entradas', 'Saídas'];
    const rows = allEstoque.map(p => [p.name, p.code, p.franchise,
      Number(p.cost || 0).toFixed(2), p.estoque, p.totalEntradas, p.totalSaidas]);
    if (fmtTipo === 'csv') exportCsv('estoque', headers, rows);
    else exportPdf('Estoque', headers, rows);
  }
```

- [ ] **Step 3: pedidos.html — capturar pedidos + botões + função**

Adicionar `let allOrders = [];` junto das variáveis de lista. Em `loadOrders`, após `const orders = await res.json();`, adicionar `allOrders = orders;`.
No cabeçalho da aba listar (perto de `id="order-count"`), adicionar:
```html
<button class="btn btn-sm btn-outline-secondary" onclick="exportarPedidos('csv')"><i class="bi bi-filetype-csv"></i> CSV</button>
<button class="btn btn-sm btn-outline-secondary" onclick="exportarPedidos('pdf')"><i class="bi bi-filetype-pdf"></i> PDF</button>
```
No `<script>`:
```js
  function exportarPedidos(fmtTipo) {
    if (!allOrders.length) return Swal.fire('Atenção', 'Nada para exportar.', 'info');
    const headers = ['Nº', 'Cliente', 'Pagamento', 'Status', 'Total'];
    const rows = allOrders.map(o => [o.id, o.client_name, o.payment_method, o.status,
      Number(o.total_cost || 0).toFixed(2)]);
    if (fmtTipo === 'csv') exportCsv('pedidos', headers, rows);
    else exportPdf('Pedidos', headers, rows);
  }
```

- [ ] **Step 4: promissorias.html — capturar parcelas + botões + função**

Adicionar `let allParcelas = [];` junto das variáveis. Em `loadPromissorias`, após montar `todasParcelas`, adicionar `allParcelas = todasParcelas;`.
No cabeçalho (perto de `id="prom-count"`), adicionar:
```html
<button class="btn btn-sm btn-outline-secondary" onclick="exportarPromissorias('csv')"><i class="bi bi-filetype-csv"></i> CSV</button>
<button class="btn btn-sm btn-outline-secondary" onclick="exportarPromissorias('pdf')"><i class="bi bi-filetype-pdf"></i> PDF</button>
```
No `<script>`:
```js
  function exportarPromissorias(fmtTipo) {
    if (!allParcelas.length) return Swal.fire('Atenção', 'Nada para exportar.', 'info');
    const headers = ['Fornecedor', 'Parcela', 'Valor', 'Status', 'Vencimento'];
    const rows = allParcelas.map(p => [p.fornecedor, p.numParcela,
      Number(p.valor || 0).toFixed(2), p.status, p.vencimento || '']);
    if (fmtTipo === 'csv') exportCsv('promissorias', headers, rows);
    else exportPdf('Promissórias', headers, rows);
  }
```

- [ ] **Step 5: Verificar**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
for f in produtos estoque pedidos promissorias; do echo -n "$f: "; curl -s -o /dev/null -w "%{http_code} " http://localhost:3000/$f.html; done; echo
node -e "for (const f of ['produtos','estoque','pedidos','promissorias']) { const h=require('fs').readFileSync('src/public/'+f+'.html','utf8'); const m=h.match(/<script>([\s\S]*?)<\/script>/); if(m) new Function(m[1]); } console.log('JS OK')"
```
Esperado: todas 200; `JS OK`. No navegador: clicar CSV baixa o arquivo; PDF abre o diálogo de impressão.

- [ ] **Step 6: Commit**

```bash
git add src/public/produtos.html src/public/estoque.html src/public/pedidos.html src/public/promissorias.html
git commit -m "feat(export): botões CSV/PDF em Produtos, Estoque, Pedidos e Promissórias"
```

---

### Task 3: Backend — vendasDiarias no dashboard

**Files:**
- Modify: `src/controllers/dashboardController.js`

**Interfaces:**
- Produz: `vendasDiarias: { labels, vendas, lucro }` (30 dias) no JSON do dashboard

- [ ] **Step 1: Adicionar a agregação diária**

Em `dashboardController.js`, logo após o bloco que monta `mesesLabels/mesesVendas/mesesLucro` (antes de "Pedidos por status"), adicionar:
```js
    // Vendas e lucro diários dos últimos 30 dias
    const [diarios] = await db.query(`
      SELECT DATE(o.created_at) AS dia,
             SUM(op.sale_price * op.quantity)            AS totalVendas,
             SUM((op.sale_price - p.cost) * op.quantity) AS totalLucro
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      GROUP BY dia ORDER BY dia ASC
    `);
    const diasLabels = [], diasVendas = [], diasLucro = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const found = diarios.find(r => {
        const rd = r.dia instanceof Date
          ? `${r.dia.getFullYear()}-${String(r.dia.getMonth()+1).padStart(2,'0')}-${String(r.dia.getDate()).padStart(2,'0')}`
          : String(r.dia).slice(0, 10);
        return rd === key;
      });
      diasLabels.push(label);
      diasVendas.push(found ? parseFloat(found.totalVendas) : 0);
      diasLucro.push(found ? parseFloat(found.totalLucro) : 0);
    }
```

- [ ] **Step 2: Incluir no res.json**

No objeto retornado, após `vendasMensais: { ... },`, adicionar:
```js
      vendasDiarias: { labels: diasLabels, vendas: diasVendas, lucro: diasLucro },
```

- [ ] **Step 3: Verificar via curl**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
node src/app.js &
sleep 3
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST -H "Content-Type: application/json" -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
curl -s http://localhost:3000/api/dashboard -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);console.log('vendasDiarias labels:', j.vendasDiarias.labels.length, '| vendas len:', j.vendasDiarias.vendas.length);})"
```
Esperado: `labels: 30 | vendas len: 30`.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/dashboardController.js
git commit -m "feat(dashboard): agregação de vendas/lucro diários (últimos 30 dias)"
```

---

### Task 4: Frontend — toggle 30 dias / 12 meses

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consome: `d.vendasDiarias` e `d.vendasMensais` (Task 3)
- Produz: toggle que troca os dados do `salesChart`

- [ ] **Step 1: Adicionar o toggle e tornar o título dinâmico**

Substituir:
```html
            <h6 class="card-title mb-3" style="color:var(--text-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.5px">Vendas & Lucro — Últimos 12 Meses</h6>
            <canvas id="salesChart" height="100"></canvas>
```
por:
```html
            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <h6 class="card-title m-0" id="salesChartTitle" style="color:var(--text-muted);font-size:.8rem;text-transform:uppercase;letter-spacing:.5px">Vendas & Lucro — Últimos 30 Dias</h6>
              <div class="btn-group btn-group-sm" role="group">
                <button type="button" class="btn btn-outline-secondary active" id="range-dia" onclick="setChartRange('dia')">30 dias</button>
                <button type="button" class="btn btn-outline-secondary" id="range-mes" onclick="setChartRange('mes')">12 meses</button>
              </div>
            </div>
            <canvas id="salesChart" height="100"></canvas>
```

- [ ] **Step 2: Guardar os dois conjuntos e trocar via função**

Substituir o bloco que popula o gráfico:
```js
      // Gráfico vendas + lucro
      salesChart.data.labels = d.vendasMensais.labels;
      salesChart.data.datasets[0].data = d.vendasMensais.vendas;
      salesChart.data.datasets[1].data = d.vendasMensais.lucro;
      salesChart.update();
```
por:
```js
      // Gráfico vendas + lucro — guarda os dois conjuntos e aplica o range atual
      chartData = { dia: d.vendasDiarias, mes: d.vendasMensais };
      setChartRange(currentRange);
```

E adicionar, no escopo do script (perto da criação de `salesChart`), as variáveis e a função:
```js
  let chartData = { dia: { labels: [], vendas: [], lucro: [] }, mes: { labels: [], vendas: [], lucro: [] } };
  let currentRange = 'dia';
  function setChartRange(range) {
    currentRange = range;
    const set = chartData[range];
    salesChart.data.labels = set.labels;
    salesChart.data.datasets[0].data = set.vendas;
    salesChart.data.datasets[1].data = set.lucro;
    salesChart.update();
    document.getElementById('salesChartTitle').textContent =
      range === 'dia' ? 'Vendas & Lucro — Últimos 30 Dias' : 'Vendas & Lucro — Últimos 12 Meses';
    document.getElementById('range-dia').classList.toggle('active', range === 'dia');
    document.getElementById('range-mes').classList.toggle('active', range === 'mes');
  }
```

- [ ] **Step 3: Verificar no browser**

Reiniciar o servidor; abrir o dashboard. O gráfico inicia em **30 dias** (30 rótulos de data dd/mm); clicar em "12 meses" troca para os 12 meses; voltar funciona; título acompanha.

```bash
node -e "const h=require('fs').readFileSync('src/public/index.html','utf8'); const m=h.match(/<script>([\s\S]*?)<\/script>/); new Function(m[1]); console.log('index JS OK')"
```

- [ ] **Step 4: Commit**

```bash
git add src/public/index.html
git commit -m "feat(dashboard): toggle 30 dias / 12 meses no gráfico de vendas"
```
