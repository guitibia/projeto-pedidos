# Painel — Notas Fiscais de entrada via upload de XML — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir importar NF-e de compra (XML) no painel: ler a nota, casar os itens com produtos (com memória), criar produtos novos quando preciso, e somar as quantidades no estoque.

**Architecture:** Um parser de XML (`utils/nfe.js`) extrai os dados da NF-e. O `nfController` faz prévia (parse + dedupe + sugestão de vínculo) e importação (transação: grava nota + itens + entrada de estoque + cria produtos + memoriza vínculos). Uma página admin `notas.html` orquestra o fluxo. Reaproveita a semântica de movimentação de estoque existente.

**Tech Stack:** Node/Express, MySQL (mysql2/promise), `fast-xml-parser`, `multer` (memoryStorage), HTML/CSS/JS vanilla.

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Sensível (estoque):** a importação roda numa **transação**; em erro, rollback (sem estoque pela metade). O servidor **re-parseia o XML** na importação — não confia em valores/quantidades vindos do cliente; do cliente vêm só as **decisões** por item (`vincular`/`criar`/`ignorar` + product_id/novo).
- `estoque_movimentacoes`: colunas `product_id`, `tipo` enum('Entrada','Saída'), `quantidade` INT, `observacao`. A **quantidade do estoque é inteira** → `Math.round` da `qCom`.
- Duplicidade pela **chave** (44 dígitos) — `nf_entradas.chave` UNIQUE; reimportar → **409**.
- Admin-only: rotas sob `apiLimiter, auth`. Upload só XML, limite 2MB (multer).
- Migrações idempotentes no `connection.js` (`try { } catch (_) {}` / `CREATE TABLE IF NOT EXISTS`). SQL parametrizado.
- Sem suíte automatizada — node assert (fixture) + curl + navegador (matar `node` após: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`; DB `Teste`→`db_pedidos_teste`).

---

### Task 1: Dependência + parser `utils/nfe.js`

**Files:**
- Modify: `package.json` (dependência)
- Create: `src/utils/nfe.js`

**Interfaces:**
- Produz: `parseNfeXml(xmlString)` → `{ chave, numero, serie, dataEmissao, emitente:{nome,cnpj}, valorTotal, itens:[{cprod,descricao,ncm,quantidade,valorUnit,valorTotal}] }`. Lança `Error` se o XML não for uma NF-e válida.

- [ ] **Step 1: Instalar a dependência**

```bash
npm install fast-xml-parser
```
(adiciona `fast-xml-parser` ao package.json/dependencies.)

- [ ] **Step 2: Criar `src/utils/nfe.js`**

```js
const { XMLParser } = require('fast-xml-parser');

// Lê o XML de uma NF-e (procNFe ou NFe) e devolve os campos relevantes.
// Lança Error se não for uma NF-e válida.
function parseNfeXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let obj;
  try { obj = parser.parse(xml); } catch (e) { throw new Error('XML inválido.'); }

  const infNFe = (obj && ((obj.nfeProc && obj.nfeProc.NFe && obj.nfeProc.NFe.infNFe) ||
                          (obj.NFe && obj.NFe.infNFe))) || null;
  if (!infNFe) throw new Error('XML não é uma NF-e válida.');

  const chave = String(infNFe['@_Id'] || '').replace(/^NFe/i, '').replace(/\D/g, '');
  if (chave.length !== 44) throw new Error('Chave de acesso inválida.');

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const icmsTot = (infNFe.total && infNFe.total.ICMSTot) || {};

  let det = infNFe.det || [];
  det = Array.isArray(det) ? det : [det];
  const itens = det.map(function (d) {
    const p = (d && d.prod) || {};
    return {
      cprod: String(p.cProd != null ? p.cProd : ''),
      descricao: String(p.xProd != null ? p.xProd : ''),
      ncm: String(p.NCM != null ? p.NCM : ''),
      quantidade: Number(p.qCom) || 0,
      valorUnit: Number(p.vUnCom) || 0,
      valorTotal: Number(p.vProd) || 0,
    };
  });

  return {
    chave,
    numero: String(ide.nNF != null ? ide.nNF : ''),
    serie: String(ide.serie != null ? ide.serie : ''),
    dataEmissao: ide.dhEmi || ide.dEmi || null,
    emitente: { nome: String(emit.xNome || ''), cnpj: String(emit.CNPJ || '').replace(/\D/g, '') },
    valorTotal: Number(icmsTot.vNF) || 0,
    itens,
  };
}

module.exports = { parseNfeXml };
```

- [ ] **Step 3: Teste unit com fixture (node assert)**

Criar `scratch-nfe-test.js` na raiz (temporário, NÃO commitar):
```js
const assert = require('assert');
const { parseNfeXml } = require('./src/utils/nfe');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
 <NFe><infNFe Id="NFe12345678901234567890123456789012345678901234" versao="4.00">
  <ide><nNF>7</nNF><serie>1</serie><dhEmi>2026-06-20T10:00:00-03:00</dhEmi></ide>
  <emit><CNPJ>14200166000187</CNPJ><xNome>Fornecedor Beleza LTDA</xNome></emit>
  <det nItem="1"><prod><cProd>A100</cProd><xProd>Creme Hidratante 200ml</xProd><NCM>33049910</NCM><qCom>12.0000</qCom><vUnCom>9.5000</vUnCom><vProd>114.00</vProd></prod></det>
  <det nItem="2"><prod><cProd>B200</cProd><xProd>Perfume Floral 50ml</xProd><NCM>33030010</NCM><qCom>6.0000</qCom><vUnCom>30.0000</vUnCom><vProd>180.00</vProd></prod></det>
  <total><ICMSTot><vNF>294.00</vNF></ICMSTot></total>
 </infNFe></NFe></nfeProc>`;

const nf = parseNfeXml(XML);
assert.strictEqual(nf.chave.length, 44, 'chave 44');
assert.strictEqual(nf.chave, '12345678901234567890123456789012345678901234');
assert.strictEqual(nf.numero, '7');
assert.strictEqual(nf.emitente.nome, 'Fornecedor Beleza LTDA');
assert.strictEqual(nf.emitente.cnpj, '14200166000187');
assert.strictEqual(nf.valorTotal, 294);
assert.strictEqual(nf.itens.length, 2);
assert.strictEqual(nf.itens[0].cprod, 'A100');
assert.strictEqual(nf.itens[0].quantidade, 12);
assert.strictEqual(nf.itens[0].valorUnit, 9.5);
// 1 item só (det objeto, não array)
const XML1 = XML.replace(/<det nItem="2">[\s\S]*?<\/det>/, '');
assert.strictEqual(parseNfeXml(XML1).itens.length, 1, 'det único vira array de 1');
// inválido
assert.throws(() => parseNfeXml('<x/>'), /NF-e válida/);
console.log('OK parseNfeXml');
```
Rodar: `node scratch-nfe-test.js` → espera `OK parseNfeXml`. Depois apagar: `rm scratch-nfe-test.js`.

- [ ] **Step 4: Commit** (sem o scratch)

```bash
git add package.json package-lock.json src/utils/nfe.js
git commit -m "feat(nf): parser de XML de NF-e (fast-xml-parser) + utils/nfe"
```

---

### Task 2: Migrações + prévia da nota

**Files:**
- Modify: `src/database/connection.js`, `src/app.js`
- Create: `src/controllers/nfController.js`, `src/routes/nf.js`

**Interfaces:**
- Consome: `parseNfeXml` (utils/nfe), `auth`, `apiLimiter`, `multer`.
- Produz: `POST /api/nf/preview` (multipart, campo `xml`) → `{ chave, numero, serie, dataEmissao, emitente, valorTotal, itens:[{...,sugestaoProductId}], jaImportada }`. (Tabelas `nf_entradas`, `nf_entrada_itens`, `nf_item_vinculos`.)

- [ ] **Step 1: Migrações no `connection.js`**

Após a última migração existente, adicionar:
```js
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS nf_entradas (id INT AUTO_INCREMENT PRIMARY KEY, chave VARCHAR(44) NOT NULL UNIQUE, emitente_nome VARCHAR(160), emitente_cnpj VARCHAR(14), numero VARCHAR(20), serie VARCHAR(10), valor_total DECIMAL(12,2), data_emissao DATETIME NULL, xml LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE IF NOT EXISTS nf_entrada_itens (id INT AUTO_INCREMENT PRIMARY KEY, nf_id INT NOT NULL, cprod VARCHAR(60), descricao VARCHAR(255), ncm VARCHAR(10), quantidade DECIMAL(12,3), valor_unit DECIMAL(12,4), valor_total DECIMAL(12,2), product_id INT NULL, INDEX (nf_id))',
      'CREATE TABLE IF NOT EXISTS nf_item_vinculos (id INT AUTO_INCREMENT PRIMARY KEY, emitente_cnpj VARCHAR(14) NOT NULL, cprod VARCHAR(60) NOT NULL, product_id INT NOT NULL, UNIQUE KEY uq_vinc (emitente_cnpj, cprod))',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 2: Criar `src/controllers/nfController.js` (multer + preview)**

```js
const db = require('../database/connection');
const multer = require('multer');
const { parseNfeXml } = require('../utils/nfe');

const uploadXml = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single('xml');

// POST /api/nf/preview — lê o XML e devolve a prévia (não grava nada)
function preview(req, res) {
  uploadXml(req, res, async function (err) {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 2MB, XML).' });
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo XML da nota.' });
    let nf;
    try { nf = parseNfeXml(req.file.buffer.toString('utf8')); }
    catch (e) { return res.status(400).json({ error: e.message || 'XML inválido.' }); }
    try {
      const [[dup]] = await db.query('SELECT id FROM nf_entradas WHERE chave = ?', [nf.chave]);
      for (const it of nf.itens) {
        const [[v]] = await db.query(
          'SELECT product_id FROM nf_item_vinculos WHERE emitente_cnpj = ? AND cprod = ?',
          [nf.emitente.cnpj, it.cprod]
        );
        it.sugestaoProductId = v ? v.product_id : null;
      }
      return res.json(Object.assign({}, nf, { jaImportada: !!dup }));
    } catch (e) { console.error('Erro preview NF:', e); return res.status(500).json({ error: 'Erro ao processar a nota.' }); }
  });
}

module.exports = { uploadXml, preview };
```

- [ ] **Step 3: Criar `src/routes/nf.js` + montar no app.js**

`src/routes/nf.js`:
```js
const express = require('express');
const router = express.Router();
const c = require('../controllers/nfController');
router.post('/preview', c.preview);
module.exports = router;
```
Em `src/app.js`, junto às rotas admin (após `/api/delivery-zones`):
```js
const nfRoutes = require('./routes/nf');
app.use('/api/nf', apiLimiter, auth, nfRoutes);
```

- [ ] **Step 4: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")
cat > scratch-nf.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe12345678901234567890123456789012345678901234" versao="4.00"><ide><nNF>7</nNF><serie>1</serie><dhEmi>2026-06-20T10:00:00-03:00</dhEmi></ide><emit><CNPJ>14200166000187</CNPJ><xNome>Fornecedor Beleza LTDA</xNome></emit><det nItem="1"><prod><cProd>A100</cProd><xProd>Creme Hidratante 200ml</xProd><NCM>33049910</NCM><qCom>12.0000</qCom><vUnCom>9.5000</vUnCom><vProd>114.00</vProd></prod></det><total><ICMSTot><vNF>114.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>
EOF
echo -n "preview sem auth -> 401/403: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/nf/preview -X POST -F "xml=@scratch-nf.xml"
echo "preview com auth:"; curl -s http://localhost:3000/api/nf/preview -X POST -H "Authorization: Bearer $JWT" -F "xml=@scratch-nf.xml"
rm -f scratch-nf.xml
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: sem auth → 401/403; com auth → JSON com `chave` (44), `emitente`, `itens` (1) com `sugestaoProductId:null`, `jaImportada:false`.

- [ ] **Step 5: Commit**

```bash
git add src/database/connection.js src/controllers/nfController.js src/routes/nf.js src/app.js
git commit -m "feat(nf): migrações (nf_entradas/itens/vinculos) + prévia da nota (/api/nf/preview)"
```

---

### Task 3: Importar (transação) + listar + detalhe

**Files:**
- Modify: `src/controllers/nfController.js`, `src/routes/nf.js`

**Interfaces:**
- Consome: `uploadXml`, `parseNfeXml`, tabelas da T2, `products`/`estoque_movimentacoes`.
- Produz: `POST /api/nf/importar` (multipart: `xml` + `decisoes` JSON) → 201 `{ ok, nfId }` (ou 409 duplicada); `GET /api/nf` (lista); `GET /api/nf/:id` (detalhe).

- [ ] **Step 1: `importar` + helper de data no `nfController.js`**

Adicionar (e exportar `importar`, `listar`, `detalhe`):
```js
function toMysqlDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// POST /api/nf/importar — grava a nota + entradas de estoque (transação)
function importar(req, res) {
  uploadXml(req, res, async function (err) {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 2MB, XML).' });
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo XML da nota.' });
    let decisoes;
    try { decisoes = JSON.parse(req.body.decisoes || '{}'); } catch (_) { decisoes = {}; }
    const xml = req.file.buffer.toString('utf8');
    let nf;
    try { nf = parseNfeXml(xml); } catch (e) { return res.status(400).json({ error: e.message || 'XML inválido.' }); }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[dup]] = await conn.query('SELECT id FROM nf_entradas WHERE chave = ?', [nf.chave]);
      if (dup) { await conn.rollback(); conn.release(); return res.status(409).json({ error: 'Esta nota já foi importada.' }); }

      const [r] = await conn.query(
        'INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero, serie, valor_total, data_emissao, xml) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [nf.chave, nf.emitente.nome, nf.emitente.cnpj, nf.numero, nf.serie, nf.valorTotal, toMysqlDate(nf.dataEmissao), xml]
      );
      const nfId = r.insertId;

      for (const it of nf.itens) {
        const d = decisoes[it.cprod] || { acao: 'ignorar' };
        let productId = null;

        if (d.acao === 'vincular' && d.product_id) {
          productId = parseInt(d.product_id, 10) || null;
        } else if (d.acao === 'criar' && d.novo) {
          const [pr] = await conn.query(
            'INSERT INTO products (name, cost, sale_value, franchise, code, estoque) VALUES (?, ?, ?, ?, ?, 0)',
            [String(d.novo.name || it.descricao).slice(0, 200),
             it.valorUnit,
             Number(d.novo.sale_value) || it.valorUnit,
             String(d.novo.franchise || 'Outros').slice(0, 60),
             String(d.novo.code || it.cprod).slice(0, 60)]
          );
          productId = pr.insertId;
        }

        await conn.query(
          'INSERT INTO nf_entrada_itens (nf_id, cprod, descricao, ncm, quantidade, valor_unit, valor_total, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [nfId, it.cprod, it.descricao, it.ncm, it.quantidade, it.valorUnit, it.valorTotal, productId]
        );

        if (productId) {
          const qtd = Math.max(0, Math.round(Number(it.quantidade) || 0));
          if (qtd > 0) {
            await conn.query('UPDATE products SET estoque = estoque + ? WHERE id = ?', [qtd, productId]);
            await conn.query(
              'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
              [productId, 'Entrada', qtd, 'NF ' + nf.numero]
            );
          }
          await conn.query(
            'INSERT INTO nf_item_vinculos (emitente_cnpj, cprod, product_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)',
            [nf.emitente.cnpj, it.cprod, productId]
          );
        }
      }

      await conn.commit();
      return res.status(201).json({ ok: true, nfId, message: 'Nota importada e estoque atualizado.' });
    } catch (e) {
      await conn.rollback();
      console.error('Erro importar NF:', e);
      return res.status(500).json({ error: 'Erro ao importar a nota.' });
    } finally { conn.release(); }
  });
}

async function listar(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT n.id, n.chave, n.emitente_nome, n.numero, n.valor_total, n.data_emissao, n.created_at,
              (SELECT COUNT(*) FROM nf_entrada_itens i WHERE i.nf_id = n.id) AS qtd_itens
       FROM nf_entradas n ORDER BY n.created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (e) { console.error('Erro listar NF:', e); return res.status(500).json({ error: 'Erro ao listar notas.' }); }
}

async function detalhe(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[nf]] = await db.query('SELECT id, chave, emitente_nome, emitente_cnpj, numero, serie, valor_total, data_emissao, created_at FROM nf_entradas WHERE id = ?', [id]);
    if (!nf) return res.status(404).json({ error: 'Nota não encontrada.' });
    const [itens] = await db.query(
      `SELECT i.id, i.cprod, i.descricao, i.quantidade, i.valor_unit, i.valor_total, i.product_id, p.name AS produto_nome
       FROM nf_entrada_itens i LEFT JOIN products p ON p.id = i.product_id WHERE i.nf_id = ? ORDER BY i.id`, [id]);
    return res.json(Object.assign({}, nf, { itens }));
  } catch (e) { console.error('Erro detalhe NF:', e); return res.status(500).json({ error: 'Erro.' }); }
}
```
Atualizar o `module.exports` para incluir `importar, listar, detalhe`.

- [ ] **Step 2: Registrar as rotas em `src/routes/nf.js`**

```js
router.get('/', c.listar);
router.get('/:id', c.detalhe);
router.post('/importar', c.importar);
```
(mantendo o `router.post('/preview', c.preview)`; declarar `GET /:id` depois de `GET /` — não há colisão com `/preview`/`/importar` pois são POST.)

- [ ] **Step 3: Verificar (fluxo completo)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")
# limpa resíduo
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query(\"DELETE FROM nf_entradas WHERE chave='12345678901234567890123456789012345678901234'\");process.exit(0)})()" 2>/dev/null
# produto alvo p/ vincular
PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id,estoque FROM products ORDER BY id LIMIT 1');console.log(p.id+':'+p.estoque);process.exit(0)})()" 2>/dev/null)
PROD_ID=${PID%%:*}; EST0=${PID##*:}
cat > scratch-nf.xml <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe12345678901234567890123456789012345678901234" versao="4.00"><ide><nNF>7</nNF><serie>1</serie><dhEmi>2026-06-20T10:00:00-03:00</dhEmi></ide><emit><CNPJ>14200166000187</CNPJ><xNome>Fornecedor Beleza LTDA</xNome></emit><det nItem="1"><prod><cProd>A100</cProd><xProd>Creme Hidratante 200ml</xProd><NCM>33049910</NCM><qCom>12.0000</qCom><vUnCom>9.5000</vUnCom><vProd>114.00</vProd></prod></det><total><ICMSTot><vNF>114.00</vNF></ICMSTot></total></infNFe></NFe></nfeProc>
EOF
echo -n "importar (vincular A100->produto, +12) -> 201: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/nf/importar -X POST -H "Authorization: Bearer $JWT" -F "xml=@scratch-nf.xml" -F "decisoes={\"A100\":{\"acao\":\"vincular\",\"product_id\":$PROD_ID}}"
echo -n "reimportar mesma chave -> 409: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/nf/importar -X POST -H "Authorization: Bearer $JWT" -F "xml=@scratch-nf.xml" -F "decisoes={\"A100\":{\"acao\":\"vincular\",\"product_id\":$PROD_ID}}"
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT estoque FROM products WHERE id=?',[$PROD_ID]);console.log('estoque', $EST0, '->', p.estoque, '(esperado +12)');const [[m]]=await db.query(\"SELECT quantidade,observacao FROM estoque_movimentacoes WHERE product_id=? ORDER BY id DESC LIMIT 1\",[$PROD_ID]);console.log('movimentacao:', m&&m.quantidade, m&&m.observacao);const [[v]]=await db.query(\"SELECT product_id FROM nf_item_vinculos WHERE emitente_cnpj='14200166000187' AND cprod='A100'\");console.log('vinculo memorizado:', v&&v.product_id);process.exit(0)})()" 2>/dev/null
echo "listar:"; curl -s http://localhost:3000/api/nf -H "Authorization: Bearer $JWT" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log(a.length,'nota(s); primeira:',a[0]&&{numero:a[0].numero,total:a[0].valor_total,itens:a[0].qtd_itens})})"
# limpeza: estorna o estoque do teste e apaga a nota
node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{await db.query('UPDATE products SET estoque=? WHERE id=?',[$EST0,$PROD_ID]);await db.query(\"DELETE FROM estoque_movimentacoes WHERE observacao='NF 7' AND product_id=?\",[$PROD_ID]);await db.query(\"DELETE FROM nf_item_vinculos WHERE cprod='A100' AND emitente_cnpj='14200166000187'\");await db.query(\"DELETE FROM nf_entradas WHERE chave='12345678901234567890123456789012345678901234'\");console.log('limpeza ok');process.exit(0)})()" 2>/dev/null
rm -f scratch-nf.xml
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: importar → 201; reimportar → **409**; estoque +12; movimentação 'NF 7' qtd 12; vínculo memorizado = PROD_ID; listar mostra a nota; limpeza ok.

- [ ] **Step 4: Commit**

```bash
git add src/controllers/nfController.js src/routes/nf.js
git commit -m "feat(nf): importar nota (transação: estoque + criar produto + memória) + listar/detalhe"
```

---

### Task 4: Página admin "Notas"

**Files:**
- Create: `src/public/notas.html`
- Modify: `src/public/painel.html` e demais páginas admin com `<nav class="sidebar-nav">` (link "Notas")

**Interfaces:**
- Consome: `POST /api/nf/preview`, `POST /api/nf/importar`, `GET /api/nf`, `GET /api/nf/:id`, `GET /api/products` (para o select de vínculo).

- [ ] **Step 1: Criar `src/public/notas.html` (modelar em `estoque.html`)**

READ `src/public/estoque.html` e copie a moldura: `<head>` (`/js/theme.js`, Bootstrap, SweetAlert2 `Swal`, `/js/auth.js`, CSS/sidebar), o bloco da sidebar (`<nav class="sidebar-nav">` com os nav-links) marcando "Notas" como ativo, e o boot `Auth.requireAuth(); Auth.initSidebar();`. Conteúdo:
- **Importar nota:** um `<input type="file" accept=".xml" id="nf-file">` + botão "Ler nota". Ao escolher e ler: `Auth.apiFetch('/api/nf/preview', { method:'POST', body: <FormData com 'xml'> })`. (Como é multipart, NÃO defina Content-Type manualmente; deixe o `FormData`; o `Auth.apiFetch` adiciona o token — confira no auth.js que ele não força `Content-Type: application/json` quando o body é FormData; se forçar, faça um `fetch` direto adicionando só o header Authorization de `Auth.getToken()`.)
- **Prévia:** mostra fornecedor, número, data, total; se `jaImportada`, um aviso "Esta nota já foi importada". Uma **tabela de itens**: descrição, qtd, valor unit, e uma coluna **Ação** por item com um `<select>` (`Vincular` / `Criar produto` / `Ignorar`). 
  - `Vincular`: aparece um `<select>` de produtos (carregados de `GET /api/products`), pré-selecionado com `item.sugestaoProductId` quando houver.
  - `Criar produto`: aparecem campos rápidos — Franquia (`<select>` com Boticário/Natura/Abelha Rainha/Eudora/Avon/Outros) e Preço de venda (number); o nome e o código já vêm do XML (mostrados/editáveis).
  - `Ignorar`: nada.
- **Importar:** botão "Importar nota" → monta `decisoes` = `{ [cprod]: { acao, product_id?, novo?:{name,franchise,sale_value,code} } }` e faz `POST /api/nf/importar` com `FormData` contendo o MESMO arquivo (`#nf-file`.files[0]) + `decisoes` (JSON string). Sucesso → Swal + recarrega o histórico e limpa a prévia. Trata 409 (já importada) e 400 (xml inválido) com mensagem.
- **Histórico:** tabela de `GET /api/nf` (fornecedor, número, total, data, nº itens) com botão "ver" → `GET /api/nf/:id` (mostra os itens num modal/área). Escapar valores no innerHTML (usar o `esc()` do estoque.html).

- [ ] **Step 2: Link "Notas" no menu**

Adicionar o nav-link `<a class="nav-link" href="/notas.html"><i class="bi bi-receipt-cutoff"></i> Notas</a>` após o link "Estoque" em todas as páginas admin que contêm `<nav class="sidebar-nav">` (grep por `href="/estoque.html"`). Em `notas.html`, o link de Notas leva `class="nav-link active"`.

- [ ] **Step 3: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "notas.html 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/notas.html
node -e "const h=require('fs').readFileSync('src/public/notas.html','utf8'); console.log('usa /api/nf:', h.includes('/api/nf'), '| preview:', h.includes('/api/nf/preview'), '| importar:', h.includes('/api/nf/importar'), '| FormData:', h.includes('FormData')); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
echo -n "painel tem link Notas: "; curl -s http://localhost:3000/painel.html | grep -c "notas.html"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; usa /api/nf/preview e /api/nf/importar; FormData true; JS parse OK; painel com link ≥ 1.

- [ ] **Step 4: Teste no navegador (manual)**

`npm run dev` → painel → Notas: subir um XML de NF-e real → conferir a prévia (fornecedor/itens/valores) → vincular um item a um produto (ou criar) → Importar → conferir no Estoque que a quantidade subiu e a nota no histórico. Subir a mesma nota de novo → aviso de já importada.

- [ ] **Step 5: Commit**

```bash
git add src/public/notas.html src/public/painel.html src/public/*.html
git commit -m "feat(painel): página de Notas (upload XML, prévia, importar, histórico)"
```
