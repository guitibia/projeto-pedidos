# Número do boleto na promissória — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um campo opcional "Nº boleto" por linha ao cadastrar promissória, salvá-lo por parcela e mostrá-lo no card da parcela; os já cadastrados ficam sem número.

**Architecture:** Coluna nova `parcelas.numero_boleto` (nullable). `createPromissoria` grava; `listPromissorias` retorna. UI: input por linha no modal + exibição no card. Cada linha do modal já é 1 boleto = 1 parcela.

**Tech Stack:** Node/Express (CommonJS), MySQL (mysql2/promise), testes `node:test`, front vanilla JS + Bootstrap/SweetAlert.

## Global Constraints

- Branch `Teste` apenas; banco `db_pedidos_teste`. NUNCA mergear em `main` sem pedido explícito.
- Migração idempotente: `ALTER TABLE ... ADD COLUMN` em `try/catch` no bloco de migrações de `connection.js`.
- `numero_boleto` é **opcional** (nunca bloqueia o cadastro); vazio → `NULL`. Coluna `VARCHAR(60) NULL`.
- Parcelas antigas ficam sem número (nulo). Dado no DOM via padrão do arquivo (`esc` onde houver).
- Testes: `node --test test/<arq>.test.js` com timeout/kill (o pool MySQL não fecha sozinho): `node --test test/X.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`; validar 0 `not ok`; NÃO matar o node da porta 3000 do usuário.

---

## File Structure

- `src/database/connection.js` — **MODIFICAR**: migração da coluna.
- `src/controllers/promissoriaController.js` — **MODIFICAR**: `createPromissoria` grava, `listPromissorias` retorna.
- `src/public/promissorias.html` — **MODIFICAR**: input no modal + coleta no submit + exibição no card.
- Test: `test/promissoria-boleto.test.js`.

---

### Task 1: Backend — coluna + salvar + retornar

**Files:**
- Modify: `src/database/connection.js` (bloco de migrações)
- Modify: `src/controllers/promissoriaController.js` (`createPromissoria` ~linha 29-32, `listPromissorias` ~54-77)
- Test: `test/promissoria-boleto.test.js`

**Interfaces:**
- Produces: coluna `parcelas.numero_boleto VARCHAR(60) NULL`. `createPromissoria` aceita `numero_boleto` em cada item de `itens` e grava na `parcelas`. `listPromissorias` retorna `numero_boleto` em cada parcela.

- [ ] **Step 1: Escrever o teste (falha primeiro)**

Criar `test/promissoria-boleto.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { createPromissoria, listPromissorias } = require('../src/controllers/promissoriaController');

function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }
async function cleanup(){
  await db.query("DELETE parc FROM parcelas parc JOIN promissorias p ON p.id=parc.promissoria_id JOIN notas_fiscais nf ON nf.id=p.nota_fiscal_id WHERE nf.fornecedor='zz_test_forn'");
  await db.query("DELETE p FROM promissorias p JOIN notas_fiscais nf ON nf.id=p.nota_fiscal_id WHERE nf.fornecedor='zz_test_forn'");
  await db.query("DELETE FROM notas_fiscais WHERE fornecedor='zz_test_forn'");
}

test('createPromissoria grava numero_boleto quando informado e NULL quando vazio', async () => {
  const res = mockRes();
  await createPromissoria({ body: { fornecedor: 'zz_test_forn', itens: [
    { data_vencimento: '2026-08-10', valor: 100, numero_boleto: 'BOL-123' },
    { data_vencimento: '2026-09-10', valor: 200, numero_boleto: '' },
  ] } }, res);
  assert.strictEqual(res.statusCode, 201);
  const [rows] = await db.query(
    "SELECT parc.numero_boleto, parc.valor FROM parcelas parc JOIN promissorias p ON p.id=parc.promissoria_id JOIN notas_fiscais nf ON nf.id=p.nota_fiscal_id WHERE nf.fornecedor='zz_test_forn' ORDER BY parc.valor");
  assert.strictEqual(rows.length, 2);
  assert.strictEqual(rows[0].numero_boleto, 'BOL-123');   // valor 100
  assert.strictEqual(rows[1].numero_boleto, null);        // valor 200 (vazio -> null)
  await cleanup();
});

test('listPromissorias retorna numero_boleto na parcela', async () => {
  let res = mockRes();
  await createPromissoria({ body: { fornecedor: 'zz_test_forn', itens: [ { data_vencimento: '2026-08-10', valor: 100, numero_boleto: 'BOL-999' } ] } }, res);
  res = mockRes();
  await listPromissorias({}, res);
  const achou = res.body.some(prom => (prom.parcelas||[]).some(p => p.numero_boleto === 'BOL-999'));
  assert.ok(achou, 'listPromissorias deve trazer numero_boleto');
  await cleanup();
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `node --test test/promissoria-boleto.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: FAIL (coluna `numero_boleto` não existe / não é retornada).

- [ ] **Step 3: Migração da coluna**

Em `src/database/connection.js`, no bloco de migrações (após a última migração existente, ex.: a de `demanda_cod_vinculos`), inserir:

```js
    // Migração: número do boleto na parcela da promissória
    for (const sql of [
      'ALTER TABLE parcelas ADD COLUMN numero_boleto VARCHAR(60) NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 4: `createPromissoria` grava o número**

Em `src/controllers/promissoriaController.js`, o INSERT em `parcelas` (dentro do `for (const item of itens)`), trocar:

```js
      await conn.query(
        'INSERT INTO parcelas (promissoria_id, numero_parcela, data_vencimento, valor) VALUES (?, ?, ?, ?)',
        [promResult.insertId, 1, item.data_vencimento, item.valor]
      );
```

por:

```js
      const numBoleto = String(item.numero_boleto || '').trim().slice(0, 60) || null;
      await conn.query(
        'INSERT INTO parcelas (promissoria_id, numero_parcela, data_vencimento, valor, numero_boleto) VALUES (?, ?, ?, ?, ?)',
        [promResult.insertId, 1, item.data_vencimento, item.valor, numBoleto]
      );
```

- [ ] **Step 5: `listPromissorias` retorna o número**

Em `listPromissorias`, no SELECT das parcelas incluir `parc.numero_boleto` (ache o SELECT que traz `parc.*`/os campos da parcela — se já for `parc.*`/`SELECT *`, o campo vem automático; se lista colunas explícitas, adicione `parc.numero_boleto`). E no objeto empurrado em `prom.parcelas.push({...})`, incluir `numero_boleto: row.numero_boleto` (mesmo nome de coluna que o SELECT retorna).

- [ ] **Step 6: Rodar e ver passar**

Run: `node --test test/promissoria-boleto.test.js & TP=$!; sleep 25; kill $TP 2>/dev/null`
Expected: PASS (2/2). Mate o node de teste depois.

- [ ] **Step 7: Commit**

```bash
git add src/database/connection.js src/controllers/promissoriaController.js test/promissoria-boleto.test.js
git commit -m "feat(promissorias): número do boleto por parcela (coluna + salva + retorna)"
```

---

### Task 2: UI — campo no modal + exibição no card

**Files:**
- Modify: `src/public/promissorias.html` (`criarLinha` ~315-330; submit `itens` ~342-345; mapeamento em `loadPromissorias` ~504-514; card da parcela ~424-433)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `POST /api/promissorias` (aceita `numero_boleto` por item), `GET /api/promissorias` (retorna `numero_boleto`).

- [ ] **Step 1: Input "Nº boleto" em cada linha do modal**

Em `criarLinha()` (o `div.innerHTML`), adicionar o input do boleto entre o valor e o botão remover:

```js
    div.innerHTML = `
      <input type="date" class="form-control form-control-sm prom-data" required style="flex:1">
      <input type="number" step="0.01" class="form-control form-control-sm prom-valor" placeholder="Valor" required style="flex:1">
      <input type="text" class="form-control form-control-sm prom-boleto" placeholder="Nº boleto (opcional)" style="flex:1.2">
      <button type="button" class="btn-remover-linha" title="Remover" style="padding:.3rem .5rem;border-radius:7px;border:1px solid rgba(248,81,73,.3);background:rgba(248,81,73,.06);color:#f85149;cursor:pointer;font-size:.85rem;flex-shrink:0">
        <i class="bi bi-x-lg"></i>
      </button>`;
```

- [ ] **Step 2: Coletar o boleto no submit**

No submit (onde monta `itens`), trocar:

```js
    const itens = Array.from(document.querySelectorAll('.linha-prom')).map(linha => ({
      data_vencimento: linha.querySelector('.prom-data').value,
      valor:           parseFloat(linha.querySelector('.prom-valor').value)
    }));
```

por:

```js
    const itens = Array.from(document.querySelectorAll('.linha-prom')).map(linha => ({
      data_vencimento: linha.querySelector('.prom-data').value,
      valor:           parseFloat(linha.querySelector('.prom-valor').value),
      numero_boleto:   linha.querySelector('.prom-boleto').value
    }));
```

(A validação de data/valor continua igual — o boleto é opcional.)

- [ ] **Step 3: Trazer o número pro card (mapeamento)**

Em `loadPromissorias`, no `todasParcelas.push({...})`, incluir o campo:

```js
        todasParcelas.push({
          promId:     prom.id,
          fornecedor: prom.fornecedor,
          numParcela: parc.numero,
          valor:      parc.valor,
          status:     parc.status,
          vencimento: parc.data_vencimento,
          numeroBoleto: parc.numero_boleto || null
        });
```

- [ ] **Step 4: Mostrar no card da parcela**

No render do card (dentro de `parcelas.map(parc => ...)`), logo após a `<div class="parcela-footer">...</div>`, adicionar (só quando houver número):

```js
              ${parc.numeroBoleto ? `<div style="font-size:.68rem;color:var(--text-muted);margin-top:.15rem"><i class="bi bi-upc-scan"></i> Boleto ${esc(parc.numeroBoleto)}</div>` : ''}
```

(Se `esc` não existir neste arquivo, use uma sanitização simples inline ou `String(parc.numeroBoleto).replace(/[<>]/g,'')`; confira se o arquivo já tem um helper `esc`.)

- [ ] **Step 5: Smoke manual**

Run: `npm run dev` (use a 3000 do usuário; se subir node só pra testar, mate só ele). Cadastrar uma promissória nova com "Nº boleto" preenchido numa linha e vazio noutra → salvar; conferir que o card da parcela com número mostra "Boleto ..." e o sem número fica igual aos antigos. Confirmar que dá pra cadastrar deixando o boleto em branco (opcional).

- [ ] **Step 6: Commit**

```bash
git add src/public/promissorias.html
git commit -m "feat(promissorias): campo 'Nº boleto' no cadastro + exibição no card da parcela"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** coluna nula (T1), createPromissoria grava opcional (T1), listPromissorias retorna (T1), input por linha no modal (T2), coleta no submit (T2), exibição no card (T2). Antigos ficam sem número (coluna nula). ✔
- **Consistência:** `numero_boleto` (coluna/JSON) e `numeroBoleto` (mapeamento client) — nomes coerentes entre backend, mapeamento e card. `prom-boleto` a classe do input. ✔
- **Sem placeholders de lógica:** passos com código real; o único ponto "confirmar no arquivo" é se o SELECT de `listPromissorias` usa `*` ou colunas explícitas (o implementador lê e adapta) e se há helper `esc`.
- **Riscos:** migração aditiva idempotente; campo opcional (não quebra cadastro nem cards antigos); tudo na `Teste`.

## Ordem de execução

T1 (backend) → T2 (UI). Cada task é um commit testável.
