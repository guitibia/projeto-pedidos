# Nome de produto da NF em Title Case (pt-BR) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Nomes de produto vindos da NF (hoje em CAIXA ALTA) ficam em Title Case pt-BR ao importar, e os produtos já cadastrados "gritando" são corrigidos uma única vez.

**Architecture:** Um módulo puro `utils/textcase.js` (`titleCasePtBr` + `isShoutingName`), consumido pelo parser NF (`nfe.js` → `nomeSugerido`), pelo preview (`notas.html`), pela criação (`nfController.js`) e por um backfill one-shot em `connection.js`.

**Tech Stack:** Node 22 (Express, MySQL), fast-xml-parser (já usado), `node:test` nativo.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Regra `titleCasePtBr`: `String(str).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_,sep,ch) => sep + ch.toUpperCase())`. `null`/vazio → `''`.
- `isShoutingName`: true se há palavra que começa com letra e nenhuma palavra-com-letra tem minúscula; ignora tokens que começam com dígito (`100ml`).
- `nf_entrada_itens.descricao` continua gravando o texto **cru** da nota (não title-case).
- Backfill: one-shot guardado por `store_settings.skey='produtos_titlecase_backfill'`, best-effort (`try/catch`), só normaliza nomes "gritando".
- Sem mudança de schema. Manter `.slice(0,200)` no nome.

---

### Task 1: Módulo `utils/textcase.js`

**Files:**
- Create: `src/utils/textcase.js`
- Test: `test/textcase.test.js`

**Interfaces:**
- Produces:
  - `titleCasePtBr(str: any) → string`
  - `isShoutingName(str: any) → boolean`

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/textcase.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { titleCasePtBr, isShoutingName } = require('../src/utils/textcase');

test('titleCasePtBr: exemplos reais da NF', () => {
  assert.strictEqual(titleCasePtBr('THE BLEND EDP CARDAMOM 100ml'), 'The Blend Edp Cardamom 100ml');
  assert.strictEqual(titleCasePtBr('LILY OL PERF DES CPO 150ml V11'), 'Lily Ol Perf Des Cpo 150ml V11');
  assert.strictEqual(titleCasePtBr('QDB BAT EF MAT BERE 330 4,0g'), 'Qdb Bat Ef Mat Bere 330 4,0g');
  assert.strictEqual(titleCasePtBr('MALBEC DES COL MAGNETIC V3 100ml'), 'Malbec Des Col Magnetic V3 100ml');
});

test('titleCasePtBr: acentos pt-BR', () => {
  assert.strictEqual(titleCasePtBr('ÁGUA DE COLÔNIA'), 'Água De Colônia');
});

test('titleCasePtBr: vazio e null', () => {
  assert.strictEqual(titleCasePtBr(''), '');
  assert.strictEqual(titleCasePtBr(null), '');
});

test('isShoutingName: caixa alta (mesmo com unidade minúscula) é shouting', () => {
  assert.strictEqual(isShoutingName('THE BLEND EDP CARDAMOM 100ml'), true);
  assert.strictEqual(isShoutingName('QDB BAT EF MAT BERE 330 4,0g'), true);
  assert.strictEqual(isShoutingName('MALBEC DES COL MAGNETIC V3 100ml'), true);
});

test('isShoutingName: nome já formatado NÃO é shouting', () => {
  assert.strictEqual(isShoutingName('Creme de Corpo Eudora - 400ml'), false);
  assert.strictEqual(isShoutingName('Batom Una CC Violeta 62'), false);
  assert.strictEqual(isShoutingName('Lapis Labial Una Rosa Pequeno'), false);
});

test('isShoutingName: sem letras é false', () => {
  assert.strictEqual(isShoutingName('330 100'), false);
  assert.strictEqual(isShoutingName(''), false);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test test/textcase.test.js`
Expected: FAIL — `Cannot find module '../src/utils/textcase'`.

- [ ] **Step 3: Implementar o módulo**

Criar `src/utils/textcase.js`:

```js
// Title Case pt-BR: sobe a 1ª letra de cada palavra que começa com letra;
// palavras que começam com dígito/símbolo (100ml, 4,0g) ficam minúsculas.
function titleCasePtBr(str) {
  return String(str == null ? '' : str)
    .toLowerCase()
    .replace(/(^|\s)(\p{L})/gu, function (_m, sep, ch) { return sep + ch.toUpperCase(); });
}

// true se há ao menos uma palavra que começa com letra e NENHUMA dessas
// palavras-com-letra contém minúscula (nome "gritando"). Ignora tokens
// que começam com dígito (ex.: "100ml"), então "ABC 100ml" é shouting.
function isShoutingName(str) {
  const words = String(str == null ? '' : str).split(/\s+/).filter(Boolean);
  let hasLetterWord = false;
  for (const w of words) {
    if (/^\p{L}/u.test(w)) {
      hasLetterWord = true;
      if (/\p{Ll}/u.test(w)) return false; // já tem minúscula → não está gritando
    }
  }
  return hasLetterWord;
}

module.exports = { titleCasePtBr, isShoutingName };
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/textcase.test.js`
Expected: PASS — 6 testes verdes.

- [ ] **Step 5: Commit**

```bash
git add src/utils/textcase.js test/textcase.test.js
git commit -m "feat(textcase): titleCasePtBr + isShoutingName com testes"
```

---

### Task 2: `nomeSugerido` no parser + preview usa ele

**Files:**
- Modify: `src/utils/nfe.js` (topo: require; map de itens ~26-34: add `nomeSugerido`)
- Modify: `src/public/notas.html` (input `criar-nome-<idx>`, ~linha 633)
- Test: `test/nfe-nomesugerido.test.js`

**Interfaces:**
- Consumes: `titleCasePtBr` de `../utils/textcase`.
- Produces: cada item de `parseNfe(xml)` passa a ter `nomeSugerido` (string title-cased); `descricao` permanece crua.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/nfe-nomesugerido.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { parseNfe } = require('../src/utils/nfe');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe Id="NFe35240101010101010101010101010101010101010101">
  <ide><nNF>123</nNF><serie>1</serie><dhEmi>2024-01-01T00:00:00-03:00</dhEmi></ide>
  <emit><xNome>FORNECEDOR TESTE</xNome><CNPJ>11111111000111</CNPJ></emit>
  <det nItem="1"><prod>
    <cProd>ABC1</cProd>
    <xProd>THE BLEND EDP CARDAMOM 100ml</xProd>
    <NCM>33030010</NCM>
    <cEAN>7891111111111</cEAN>
    <qCom>2</qCom><vUnCom>10.00</vUnCom><vProd>20.00</vProd>
  </prod></det>
  <total><ICMSTot><vNF>20.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

test('parseNfe: item traz nomeSugerido em title case e descricao crua', () => {
  const nf = parseNfe(XML);
  const it = nf.itens[0];
  assert.strictEqual(it.descricao, 'THE BLEND EDP CARDAMOM 100ml');
  assert.strictEqual(it.nomeSugerido, 'The Blend Edp Cardamom 100ml');
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test test/nfe-nomesugerido.test.js`
Expected: FAIL — `it.nomeSugerido` é `undefined` (assert de igualdade falha).

> Se `parseNfe` não estiver exportado por esse nome, ajuste o import ao export real do módulo (`module.exports`) e mantenha o resto do teste. Não altere a estrutura do XML.

- [ ] **Step 3: Adicionar o require e o campo no parser**

Em `src/utils/nfe.js`, no topo (junto aos outros `require`), adicionar:

```js
const { titleCasePtBr } = require('./textcase');
```

No `map` de itens, logo após a linha `descricao: String(p.xProd != null ? p.xProd : ''),`, adicionar:

```js
      nomeSugerido: titleCasePtBr(String(p.xProd != null ? p.xProd : '')),
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `node --test test/nfe-nomesugerido.test.js`
Expected: PASS.

- [ ] **Step 5: Preview usa `nomeSugerido`**

Em `src/public/notas.html`, no input do nome ao criar (hoje):

```html
<input type="text" class="form-control form-control-sm" id="criar-nome-${idx}" placeholder="Nome do produto" value="${esc(item.descricao)}">
```

trocar o `value` para:

```html
<input type="text" class="form-control form-control-sm" id="criar-nome-${idx}" placeholder="Nome do produto" value="${esc(item.nomeSugerido || item.descricao)}">
```

Não mexer na linha `item-desc` (continua mostrando `item.descricao` cru).

- [ ] **Step 6: Verificar o parse do HTML/JS e o valor novo**

```bash
node -e "const h=require('fs').readFileSync('src/public/notas.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; usa nomeSugerido:', h.includes('item.nomeSugerido || item.descricao'));"
```
Expected: `parse OK; usa nomeSugerido: true`.

- [ ] **Step 7: Commit**

```bash
git add src/utils/nfe.js src/public/notas.html test/nfe-nomesugerido.test.js
git commit -m "feat(nf): parser sugere nome em title case e preview usa ele"
```

---

### Task 3: Criação em title case + backfill one-shot dos atuais

**Files:**
- Modify: `src/controllers/nfController.js` (topo: require; ação `criar` INSERT ~72)
- Modify: `src/database/connection.js` (novo bloco backfill antes de `conn.release()`, ~207)

**Interfaces:**
- Consumes: `titleCasePtBr`, `isShoutingName` de `../utils/textcase`.
- Produces: produtos criados pela NF com nome title-cased; nomes "gritando" existentes corrigidos uma vez.

- [ ] **Step 1: Criação usa `titleCasePtBr`**

Em `src/controllers/nfController.js`, adicionar no topo (junto aos outros require):

```js
const { titleCasePtBr } = require('../utils/textcase');
```

Na ação `criar`, trocar a 1ª coluna do INSERT products (hoje):

```js
            [String(d.novo.name || it.descricao).slice(0, 200),
```

por:

```js
            [titleCasePtBr(String(d.novo.name || it.nomeSugerido || it.descricao)).slice(0, 200),
```

Não alterar mais nada no INSERT nem o `nf_entrada_itens` (que continua com `it.descricao` cru).

- [ ] **Step 2: Backfill one-shot em `connection.js`**

Em `src/database/connection.js`, imediatamente antes de `conn.release();` (após o bloco de migração de EAN, ~206), inserir:

```js
    // Backfill one-shot: nomes de produto "gritando" (CAIXA ALTA) viram Title Case.
    // Só mexe nos 100% maiúsculos; nomes já formatados ficam intactos.
    try {
      const [[done]] = await conn.query("SELECT svalue FROM store_settings WHERE skey = 'produtos_titlecase_backfill'");
      if (!done) {
        const { titleCasePtBr, isShoutingName } = require('../utils/textcase');
        const [rows] = await conn.query('SELECT id, name FROM products');
        for (const r of rows) {
          if (isShoutingName(r.name)) {
            const novo = titleCasePtBr(r.name).slice(0, 200);
            if (novo !== r.name) await conn.query('UPDATE products SET name = ? WHERE id = ?', [novo, r.id]);
          }
        }
        await conn.query("INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('produtos_titlecase_backfill', '1')");
      }
    } catch (_) {}
```

- [ ] **Step 3: Sanidade dos requires**

```bash
node -e "require('./src/controllers/nfController'); require('./src/utils/textcase'); console.log('requires OK')"
```
Expected: `requires OK`.

- [ ] **Step 4: Rodar o boot uma vez na Teste e conferir o backfill**

Subir o app uma vez (dispara o boot/backfill no banco `db_pedidos_teste`), depois encerrar e conferir:

```bash
node src/app.js & sleep 5; kill %1 2>/dev/null
node -e "require('dotenv').config(); const db=require('./src/database/connection'); const {isShoutingName}=require('./src/utils/textcase'); (async()=>{ const [f]=await db.query(\"SELECT svalue FROM store_settings WHERE skey='produtos_titlecase_backfill'\"); const [rows]=await db.query('SELECT name FROM products'); const gritando=rows.filter(r=>isShoutingName(r.name)); console.log('flag:', f[0] && f[0].svalue, '| ainda gritando:', gritando.length); process.exit(0); })();"
```
Expected: `flag: 1 | ainda gritando: 0`. Encerrar node pendente (liberar porta 3000).

- [ ] **Step 5: Commit**

```bash
git add src/controllers/nfController.js src/database/connection.js
git commit -m "feat(nf): cria produto em title case + backfill one-shot dos nomes gritando"
```

---

## Verificação final (após as 3 tasks)

- [ ] `node --test test/textcase.test.js test/nfe-nomesugerido.test.js` → todos verdes.
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
- [ ] Lembrete: o backfill roda uma vez na produção no próximo deploy (guardado por flag) — sem ação manual.
