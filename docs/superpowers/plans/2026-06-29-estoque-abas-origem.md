# Estoque — Abas por origem (Geral / NF / Manual) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na aba Estoque, alternar entre Geral / NF / Manual, mostrando nas visões de origem quanto entrou por aquela origem (exato) e uma estimativa do estoque atual dela.

**Architecture:** `listEstoque` passa a devolver `entradasNF`/`entradasManual` por produto (SUM CASE por origem). O `estoque.html` ganha 3 abas que filtram a lista já carregada (`allEstoque`) e, nas abas de origem, calculam no front a estimativa proporcional. Só leitura — não altera estoque.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla.

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Só leitura de estoque** — nenhuma mutação de quantidade nesta feature.
- Estimativa: `estAtualNF = totalEnt>0 ? Math.round(estoque*entradasNF/totalEnt) : 0`; `estAtualManual = estoque - estAtualNF` (complemento → as duas somam o estoque atual real). `totalEnt = entradasNF + entradasManual`.
- Filtro das abas: geral=todos; nf=`entradasNF>0`; manual=`entradasManual>0`.
- Alternar aba **re-renderiza sem refetch** (reusa `allEstoque`).
- Valores dinâmicos escapados (`esc`); divisão por zero tratada.
- Sem suíte automatizada — curl/node + navegador (matar `node` após: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`; DB `Teste`→`db_pedidos_teste`). Admin token: `JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")`.

---

### Task 1: Backend — entradas por origem no listEstoque

**Files:**
- Modify: `src/controllers/estoqueController.js` (listEstoque, ~l.4-15)

**Interfaces:**
- Produz: `GET /api/estoque` passa a incluir por produto `entradasNF` e `entradasManual` (números).

- [ ] **Step 1: Acrescentar as duas colunas ao SELECT**

Em `listEstoque`, trocar a query por:
```js
    const [rows] = await db.query(`
      SELECT p.id, p.name, p.code, p.franchise, p.cost, p.estoque,
             IFNULL(SUM(CASE WHEN m.tipo='Entrada' THEN m.quantidade ELSE 0 END), 0) AS totalEntradas,
             IFNULL(SUM(CASE WHEN m.tipo='Saída'   THEN m.quantidade ELSE 0 END), 0) AS totalSaidas,
             IFNULL(SUM(CASE WHEN m.tipo='Entrada' AND m.origem='NF'     THEN m.quantidade ELSE 0 END), 0) AS entradasNF,
             IFNULL(SUM(CASE WHEN m.tipo='Entrada' AND m.origem='Manual' THEN m.quantidade ELSE 0 END), 0) AS entradasManual
      FROM products p
      LEFT JOIN estoque_movimentacoes m ON m.product_id = p.id
      GROUP BY p.id
      ORDER BY p.franchise, p.name
    `);
```
(só adiciona `entradasNF` e `entradasManual`; o resto igual.)

- [ ] **Step 2: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")
echo "amostra de /api/estoque (campos de origem):"
curl -s http://localhost:3000/api/estoque -H "Authorization: Bearer $JWT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);const comNF=a.filter(p=>Number(p.entradasNF)>0).slice(0,3);const comMan=a.filter(p=>Number(p.entradasManual)>0).slice(0,3);console.log('tem entradasNF/entradasManual:', a.length? ('entradasNF' in a[0] && 'entradasManual' in a[0]) : 'sem produtos');console.log('exemplos NF:', comNF.map(p=>({nome:p.name,estoque:p.estoque,eNF:p.entradasNF,eMan:p.entradasManual})));console.log('exemplos Manual:', comMan.map(p=>({nome:p.name,eMan:p.entradasManual})));})"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: cada produto tem `entradasNF` e `entradasManual`; produtos que receberam por NF mostram `entradasNF>0`; manuais mostram `entradasManual>0`.

- [ ] **Step 3: Commit**

```bash
git add src/controllers/estoqueController.js
git commit -m "feat(estoque): listEstoque devolve entradasNF/entradasManual por produto"
```

---

### Task 2: Frontend — abas Geral/NF/Manual + estimativa

**Files:**
- Modify: `src/public/estoque.html`

**Interfaces:**
- Consome: `GET /api/estoque` (agora com `entradasNF`/`entradasManual`); `render(items)`, `allEstoque`, `esc`, `fmt` já existentes.

- [ ] **Step 1: Botões das abas + estado**

No `estoque.html`, adicionar acima do `#resumo-grid` (ou logo abaixo do cabeçalho da página) um grupo de 3 botões de aba:
```html
    <div id="estoque-abas" style="display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem">
      <button type="button" class="aba-btn active" data-aba="geral"><i class="bi bi-boxes"></i> Geral</button>
      <button type="button" class="aba-btn" data-aba="nf"><i class="bi bi-receipt"></i> NF</button>
      <button type="button" class="aba-btn" data-aba="manual"><i class="bi bi-hand-index"></i> Manual</button>
    </div>
```
CSS (no `<style>`, no estilo dos botões existentes; ajuste as variáveis do tema):
```css
    .aba-btn { font-size:.85rem; border:1px solid var(--border-color,#30363d); background:transparent; color:var(--text-muted,#8b949e); border-radius:8px; padding:.4rem .9rem; cursor:pointer; display:inline-flex; align-items:center; gap:.4rem; }
    .aba-btn.active { background:var(--accent,#3fb950); color:#fff; border-color:transparent; }
```
No `<script>`, uma variável de estado (perto dos outros `let`): `let estoqueAba = 'geral';` e o wire dos botões:
```js
  document.querySelectorAll('#estoque-abas .aba-btn').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('#estoque-abas .aba-btn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      estoqueAba = b.dataset.aba;
      render(allEstoque); // re-renderiza sem refetch
    });
  });
```

- [ ] **Step 2: Filtrar por aba no início do render**

No começo de `render(items)`, aplicar o filtro da aba (e uma legenda quando for NF/Manual). Substituir a primeira linha de `render` por:
```js
  function render(items) {
    const container = document.getElementById('estoque-container');
    // filtro por aba (origem)
    let lista = items;
    if (estoqueAba === 'nf')     lista = items.filter(p => Number(p.entradasNF) > 0);
    if (estoqueAba === 'manual') lista = items.filter(p => Number(p.entradasManual) > 0);
    const legenda = document.getElementById('estoque-legenda');
    if (legenda) legenda.style.display = (estoqueAba === 'geral') ? 'none' : '';
    items = lista; // o resto do render usa `items`
```
E adicionar, uma vez, um elemento de legenda no HTML (abaixo das abas):
```html
    <div id="estoque-legenda" style="display:none;font-size:.76rem;color:var(--text-muted,#8b949e);margin:-.4rem 0 .8rem">
      "Entrou" é exato (soma das entradas dessa origem). "Atual (est.)" é uma estimativa — as vendas saem do estoque único.
    </div>
```
(Garanta que o restante do `render` continue usando a variável `items` — agora já filtrada.)

- [ ] **Step 3: Colunas de origem na linha do produto (abas NF/Manual)**

No map que monta cada `.produto-row` (~l.484-490), acrescentar, quando `estoqueAba !== 'geral'`, os números de origem. Para cada produto `p`, calcular antes do template:
```js
            }).map(p => {
              const eNF = Number(p.entradasNF) || 0, eMan = Number(p.entradasManual) || 0;
              const totalEnt = eNF + eMan;
              const estAtualNF = totalEnt > 0 ? Math.round(p.estoque * eNF / totalEnt) : 0;
              const estAtualManual = p.estoque - estAtualNF;
              const ent = estoqueAba === 'nf' ? eNF : eMan;
              const estAtual = estoqueAba === 'nf' ? estAtualNF : estAtualManual;
              const origemInfo = (estoqueAba === 'geral') ? '' :
                `<div style="font-size:.72rem;color:var(--text-muted,#8b949e);margin-top:2px">
                   Entrou por ${estoqueAba === 'nf' ? 'NF' : 'Manual'}: <strong>${ent}</strong> un ·
                   Atual (est.): <strong>~${estAtual}</strong> un
                 </div>`;
              return `
            <div class="produto-row">
              <div>
                <div class="produto-nome">${esc(p.name)}</div>
                <div class="produto-code">${esc(p.code)}</div>
                ${origemInfo}
              </div>
              <div class="estoque-badge ${nivelClass(p.estoque)}">${p.estoque} un</div>
              <div class="produto-valor">
                <div class="valor-unit">${fmt(p.cost)}</div>
                ${p.estoque > 1 ? `<div class="valor-total">${fmt(parseFloat(p.cost) * p.estoque)} total</div>` : ''}
              </div>
              <button class="btn-mov" data-id="${p.id}" data-nome="${esc(p.name)}" onclick="abrirMovBtn(this)">
                <i class="bi bi-arrow-left-right"></i> Movimentar
              </button>
              <button class="btn-hist" data-id="${p.id}" data-nome="${esc(p.name)}" onclick="abrirHistBtn(this)">
`;
```
(Mantém o resto do `.produto-row` idêntico ao atual — só troca o `.map(p => \`...\`)` por `.map(p => { ...calcula...; return \`...\`; })` e insere `${origemInfo}` sob o código do produto. Verifique que o fechamento do `.map`/template continua correto no arquivo original.)

- [ ] **Step 4: Verificar (estático + lógica da estimativa)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "estoque 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/estoque.html
node -e "const h=require('fs').readFileSync('src/public/estoque.html','utf8'); console.log('abas:', h.includes('estoque-abas')&&h.includes(\"data-aba=\"), '| estoqueAba:', h.includes('estoqueAba'), '| estAtualManual:', h.includes('estAtualManual'), '| legenda:', h.includes('estoque-legenda')); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
node -e "const round=Math.round; const estoque=7,eNF=12,eMan=6; const totalEnt=eNF+eMan; const estAtualNF=totalEnt>0?round(estoque*eNF/totalEnt):0; const estAtualManual=estoque-estAtualNF; console.log('estimativa soma o estoque:', estAtualNF+estAtualManual===estoque, '(NF',estAtualNF,'+ Man',estAtualManual,'=',estoque+')');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; abas/estoqueAba/estAtualManual/legenda true; JS parse OK; a estimativa NF+Manual soma o estoque (7).

- [ ] **Step 5: Teste no navegador (manual)**

`npm run dev` → Estoque: aba **Geral** = como hoje; **NF** lista só produtos que receberam por NF, mostrando "Entrou por NF" + "Atual (est.)"; **Manual** idem; conferir que num produto a estimativa NF + Manual = estoque atual; alternar abas não recarrega da rede.

- [ ] **Step 6: Commit**

```bash
git add src/public/estoque.html
git commit -m "feat(estoque): abas Geral/NF/Manual com entradas por origem + estimativa de estoque atual"
```
