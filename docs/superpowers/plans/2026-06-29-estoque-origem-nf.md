# Estoque — Origem (NF × Manual) + ação visual na nota — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Marcar a origem (NF/Manual) de cada movimentação de estoque (com filtro e selo na tela) e deixar a escolha de ação por item da nota mais visual (pills).

**Architecture:** Uma coluna `origem` (+ `nf_id`) em `estoque_movimentacoes`; a importação de NF grava 'NF', a movimentação manual grava 'Manual'; o log retorna/filtra por origem; a tela do estoque mostra um selo e um filtro; a nota troca o `<select>` de ação por pills. A quantidade do produto continua única (NF e manual somam juntos).

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla (Bootstrap, Auth.apiFetch).

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Quantidade do produto inalterada** — origem é só rótulo; NF e manual somam no mesmo `products.estoque`.
- Migração **não-destrutiva** (só `ADD COLUMN`) + backfill idempotente; migrações no `connection.js` em `try { } catch (_) {}`.
- `origem` ∈ {'Manual','NF'} validado no backend; filtro inválido → retorna tudo.
- SQL parametrizado; valores dinâmicos escapados (`esc`) nas telas.
- Sem suíte automatizada — curl + node + navegador (matar `node` após: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`; DB `Teste`→`db_pedidos_teste`). Admin token p/ curl: `JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")`.

---

### Task 1: Banco + backend (origem nas movimentações)

**Files:**
- Modify: `src/database/connection.js`, `src/controllers/estoqueController.js`, `src/controllers/nfController.js`

**Interfaces:**
- Produz: `estoque_movimentacoes.origem` ('Manual'/'NF') + `nf_id`; `GET /api/estoque/log` retorna `origem`/`nf_id` e aceita `?origem=NF|Manual`.

- [ ] **Step 1: Migração + backfill no connection.js**

Após a última migração existente, adicionar:
```js
    for (const sql of [
      "ALTER TABLE estoque_movimentacoes ADD COLUMN origem ENUM('Manual','NF') NOT NULL DEFAULT 'Manual'",
      'ALTER TABLE estoque_movimentacoes ADD COLUMN nf_id INT NULL',
      "UPDATE estoque_movimentacoes SET origem='NF' WHERE observacao LIKE 'NF %'",
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 2: `movimentar` grava origem 'Manual'**

Em `src/controllers/estoqueController.js`, no `movimentar`, trocar o INSERT:
```js
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
      [id, tipo, qtd, observacao || null]
    );
```
por:
```js
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao, origem) VALUES (?, ?, ?, ?, ?)',
      [id, tipo, qtd, observacao || null, 'Manual']
    );
```

- [ ] **Step 3: `importar` grava origem 'NF' + nf_id**

Em `src/controllers/nfController.js`, no `importar`, trocar o INSERT da movimentação:
```js
            await conn.query(
              'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
              [productId, 'Entrada', qtd, 'NF ' + nf.numero]
            );
```
por:
```js
            await conn.query(
              'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao, origem, nf_id) VALUES (?, ?, ?, ?, ?, ?)',
              [productId, 'Entrada', qtd, 'NF ' + nf.numero, 'NF', nfId]
            );
```
(`nfId` já está em escopo — é o `insertId` da nota, definido antes do loop.)

- [ ] **Step 4: `logGeral` retorna + filtra por origem**

Em `src/controllers/estoqueController.js`, substituir o corpo do `logGeral` por:
```js
async function logGeral(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  const origem = req.query.origem;
  const filtra = (origem === 'NF' || origem === 'Manual');
  const where = filtra ? 'WHERE m.origem = ?' : '';
  const params = filtra ? [origem, limit] : [limit];
  try {
    const [rows] = await db.query(
      `SELECT m.id, p.name AS product_name, p.franchise, p.code,
              m.tipo, m.quantidade, m.observacao, m.origem, m.nf_id, m.created_at
       FROM estoque_movimentacoes m
       JOIN products p ON p.id = m.product_id
       ${where}
       ORDER BY m.created_at DESC
       LIMIT ?`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar log geral:', err);
    return res.status(500).json({ error: 'Erro ao buscar log.' });
  }
}
```

- [ ] **Step 5: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [c]=await db.query('SHOW COLUMNS FROM estoque_movimentacoes');const n=c.map(x=>x.Field);console.log('tem origem:',n.includes('origem'),'| nf_id:',n.includes('nf_id'));process.exit(0)})()" 2>/dev/null
# movimentação manual num produto qualquer
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id FROM products ORDER BY id LIMIT 1');console.log(p.id);process.exit(0)})()" 2>/dev/null)
curl -s http://localhost:3000/api/estoque/$PID/movimentacao -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"tipo":"Entrada","quantidade":2,"observacao":"teste manual origem"}' >/dev/null
echo "log (deve ter origem/nf_id):"; curl -s "http://localhost:3000/api/estoque/log?limit=3" -H "Authorization: Bearer $JWT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log(a.slice(0,3).map(r=>({tipo:r.tipo,origem:r.origem,nf_id:r.nf_id,obs:r.observacao})))})"
echo -n "filtro ?origem=Manual (todos Manual): "; curl -s "http://localhost:3000/api/estoque/log?origem=Manual&limit=50" -H "Authorization: Bearer $JWT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log(a.every(r=>r.origem==='Manual'), '('+a.length+' regs)')})"
# limpa a movimentação de teste
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"DELETE FROM estoque_movimentacoes WHERE observacao='teste manual origem'\");await db.query('UPDATE products SET estoque=estoque-2 WHERE id=?',[$PID]);process.exit(0)})()" 2>/dev/null
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: tem origem/nf_id true; o log mostra `origem:'Manual'` na movimentação de teste; o filtro `?origem=Manual` retorna só Manual.

- [ ] **Step 6: Commit**

```bash
git add src/database/connection.js src/controllers/estoqueController.js src/controllers/nfController.js
git commit -m "feat(estoque): origem (NF/Manual) + nf_id nas movimentações; log retorna e filtra por origem"
```

---

### Task 2: Estoque — selo de origem + filtro

**Files:**
- Modify: `src/public/estoque.html`

**Interfaces:**
- Consome: `GET /api/estoque/:id/historico` (agora com `origem`/`nf_id`), `GET /api/estoque/log?origem=` (com `origem`/`nf_id`).

- [ ] **Step 1: Helper de selo de origem**

No `<script>` de `estoque.html`, adicionar um helper (perto do `fmtDt`/`esc`):
```js
  function origemBadge(r) {
    if (r.origem === 'NF') {
      var href = '/notas.html';
      return '<a href="' + href + '" class="fr-badge badge-ok" title="Entrada via Nota Fiscal' + (r.nf_id ? ' #' + r.nf_id : '') + '" style="text-decoration:none">📄 NF</a>';
    }
    return '<span class="fr-badge badge-low">✋ Manual</span>';
  }
```
(reusa as classes `.fr-badge`/`.badge-ok`/`.badge-low` já existentes.)

- [ ] **Step 2: Selo no histórico por produto**

No render do histórico por produto (o `rows.map` que monta `.hist-row`, ~l.582), incluir o selo na primeira coluna, abaixo da observação:
```js
    document.getElementById('hist-body').innerHTML = rows.map(r => `
      <div class="hist-row">
        <div>
          <div style="font-size:.82rem;font-weight:600;color:${r.tipo==='Entrada'?'#3fb950':'#f85149'}">
            <i class="bi bi-${r.tipo==='Entrada'?'plus':'dash'}-circle"></i> ${r.tipo}
            ${origemBadge(r)}
          </div>
          <div style="font-size:.72rem;color:var(--text-muted)">${esc(r.observacao || '—')}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:.9rem;font-weight:700">${r.quantidade} un</div>
          <div style="font-size:.7rem;color:var(--text-muted)">${fmtDt(r.created_at)}</div>
        </div>
      </div>`).join('');
```

- [ ] **Step 3: Coluna Origem + filtro no log geral**

No log geral (`loadLog`, ~l.611):
- Adicionar uma coluna "Origem" no `<thead>` (após "Tipo") e a célula correspondente no `<tbody>` usando `${origemBadge(r)}`.
- Antes da tabela (ou no cabeçalho do painel de log), adicionar um seletor de filtro com 3 botões/opções **Todos / NF / Manual** (ids `#log-filtro`), que ao mudar chama `loadLog()`.
- `loadLog()` passa a montar a URL com o filtro: `var f = (window.__logOrigem || ''); var url = '/api/estoque/log?limit=100' + (f ? '&origem=' + f : '');`. Guardar o filtro escolhido em `window.__logOrigem` ('', 'NF' ou 'Manual') quando o usuário clica nos botões, e então `loadLog()`.

- [ ] **Step 4: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "estoque 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/estoque.html
node -e "const h=require('fs').readFileSync('src/public/estoque.html','utf8'); console.log('origemBadge:', h.includes('origemBadge'), '| filtro origem:', h.includes('__logOrigem')||h.includes('log-filtro'), '| usa origem no log url:', /origem=/.test(h)); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; origemBadge true; filtro true; usa origem na url true; JS parse OK.

- [ ] **Step 5: Commit**

```bash
git add src/public/estoque.html
git commit -m "feat(estoque): selo de origem (NF/Manual) no histórico e log + filtro por origem"
```

---

### Task 3: Notas — ação por item em pills

**Files:**
- Modify: `src/public/notas.html`

**Interfaces:**
- Consome: o `previaData`/itens já carregados; a montagem do `decisoes` na importação (lê a ação ativa por item).

- [ ] **Step 1: CSS das pills**

No `<style>` de `notas.html`, adicionar (equivalente ao `.tipo-pill` do estoque):
```css
    .acao-pills { display:flex; gap:.35rem; flex-wrap:wrap; }
    .acao-pill { font-size:.8rem; border:1px solid var(--border); background:transparent; color:var(--text-muted); border-radius:8px; padding:.35rem .7rem; cursor:pointer; display:inline-flex; align-items:center; gap:.35rem; }
    .acao-pill.active { background:var(--accent, #6d4aff); color:#fff; border-color:transparent; }
```
(ajuste as variáveis para as do tema da página.)

- [ ] **Step 2: Render do item com pills (em vez do select)**

No `renderPrevia` (onde cada item monta a linha com o `<select>` de ação), trocar o `<select>` por 3 pills + um contêiner de campos que muda conforme a ação. Para cada item de índice `i` (cprod `it.cprod`):
```html
  <div class="acao-pills" data-item="${i}">
    <button type="button" class="acao-pill active" data-acao="vincular"><i class="bi bi-link-45deg"></i> Vincular</button>
    <button type="button" class="acao-pill" data-acao="criar"><i class="bi bi-plus-square"></i> Criar</button>
    <button type="button" class="acao-pill" data-acao="ignorar"><i class="bi bi-slash-circle"></i> Ignorar</button>
  </div>
  <div class="acao-campos" data-campos="${i}">
    <!-- vincular: select de produtos (com sugestão); criar: franquia + preço; ignorar: vazio -->
  </div>
```
Manter a lógica que já popula o select de produtos (para "vincular") e os campos de "criar" — só que agora dentro do `.acao-campos`, exibidos conforme a pill ativa.

- [ ] **Step 3: Wire das pills + leitura na importação**

- Ao clicar numa pill: marca `active` só nela (dentro do mesmo `.acao-pills`), guarda a ação escolhida do item (ex.: num atributo `data-acao-sel` no contêiner do item, ou num objeto `acoes[i]`), e mostra/oculta os campos correspondentes em `.acao-campos`.
- Inicial: "vincular" ativo (como hoje o select inicia).
- Na montagem do `decisoes` (no importar), em vez de ler o `<select>.value`, ler a ação ativa do item (a pill `.active` ou o `acoes[i]`), e os campos conforme a ação (product_id do select para vincular; name/franchise/sale_value/code para criar). O formato do `decisoes` enviado ao `/api/nf/importar` é o MESMO (`{[cprod]:{acao,product_id?,novo?{...}}}`) — só muda de onde a UI lê a ação.

- [ ] **Step 4: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "notas 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/notas.html
node -e "const h=require('fs').readFileSync('src/public/notas.html','utf8'); console.log('acao-pill:', h.includes('acao-pill'), '| 3 acoes:', h.includes('vincular')&&h.includes('criar')&&h.includes('ignorar'), '| decisoes ainda montado:', h.includes('decisoes')); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; acao-pill true; 3 ações true; decisoes ainda presente; JS parse OK.

- [ ] **Step 5: Teste no navegador (manual)**

`npm run dev` → painel → Notas: subir o XML → cada item mostra as 3 pills; clicar troca o campo (vincular mostra o select; criar mostra franquia+preço; ignorar limpa) → Importar funciona igual. Estoque → histórico/log mostram o selo de origem; filtro NF/Manual funciona.

- [ ] **Step 6: Commit**

```bash
git add src/public/notas.html
git commit -m "feat(nf): ação por item da nota em pills (Vincular/Criar/Ignorar) no lugar do select"
```
