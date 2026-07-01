# Tratamento de imagem de produto (Nível 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Toda imagem de produto (colada por URL ou enviada por upload) é baixada/lida, padronizada (800×800 contain, fundo branco, WebP) e salva como cópia local em `/uploads/products/`.

**Architecture:** Um módulo puro `utils/imageProcessor.js` (baixar + tratar/gravar, sem Express/DB). O `productController` passa a chamá-lo em `setProductImageUrl` (URL) e `setProductImage` (upload via multer em memória), com um helper `replaceProductImage` que atualiza o banco e apaga a imagem local antiga.

**Tech Stack:** Node 22 (Express, MySQL), `sharp` (novo, runtime), `multer` memoryStorage, `fetch` global. Testes com `node:test` nativo.

## Global Constraints

- Branch **Teste**; NÃO publicar em produção sem pedido explícito.
- Padrões de tratamento: **800×800**, `fit: 'contain'`, fundo branco `{ r:255, g:255, b:255, alpha:1 }`, **WebP qualidade 80**.
- Download: timeout **8000 ms**, limite **10 MB**, exige `content-type` `^image/`.
- Upload: mantém limite **4 MB** e `fileFilter` `image/*`.
- Falha ao baixar/processar URL → **422**, mantém a foto atual (não altera banco).
- `sharp` é dependência de **runtime** (`dependencies`), pois `deploy/deploy.sh` roda `npm ci --omit=dev`.
- Sem mudança de schema; `products.image` guarda o caminho local (`/uploads/products/pN_<ts>.webp`).
- Endpoint é admin-only (atrás de auth); não expor a usuários finais.

---

### Task 1: Módulo `imageProcessor.js` (baixar + tratar/gravar)

**Files:**
- Modify: `package.json` (adicionar `sharp` em `dependencies`)
- Create: `src/utils/imageProcessor.js`
- Test: `test/imageProcessor.test.js`

**Interfaces:**
- Consumes: `sharp`, `fetch` global, `fs`, `path`.
- Produces:
  - `async fetchImageBuffer(url: string) → Buffer` — lança `Error` se URL não http(s), resposta não-ok, `content-type` não-imagem, vazia ou > 10 MB.
  - `async processAndSaveProductImage(buffer: Buffer, productId: number|string) → string` — grava `.webp` e retorna caminho relativo `'/uploads/products/p<id>_<ts>.webp'`; lança se o buffer não for imagem válida.
  - `UPLOAD_DIR: string` — caminho absoluto de `src/public/uploads/products`.

- [ ] **Step 1: Instalar sharp e verificar o require**

```bash
npm install sharp
node -e "console.log('sharp', require('sharp').versions.sharp)"
```
Expected: imprime a versão do sharp (ex.: `sharp 0.34.x`). `package.json` passa a listar `sharp` em `dependencies` e `package-lock.json` é atualizado.

- [ ] **Step 2: Escrever o teste que falha**

Criar `test/imageProcessor.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { fetchImageBuffer, processAndSaveProductImage, UPLOAD_DIR } = require('../src/utils/imageProcessor');

async function makePng() {
  return await sharp({ create: { width: 50, height: 80, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
}

test('processAndSaveProductImage gera webp 800x800', async () => {
  const png = await makePng();
  const rel = await processAndSaveProductImage(png, 999999);
  assert.match(rel, /^\/uploads\/products\/p999999_\d+\.webp$/);
  const abs = path.join(UPLOAD_DIR, path.basename(rel));
  assert.ok(fs.existsSync(abs), 'arquivo salvo em disco');
  const meta = await sharp(abs).metadata();
  assert.strictEqual(meta.width, 800);
  assert.strictEqual(meta.height, 800);
  assert.strictEqual(meta.format, 'webp');
  fs.unlinkSync(abs);
});

test('fetchImageBuffer rejeita URL sem http/https', async () => {
  await assert.rejects(() => fetchImageBuffer('ftp://x/y.png'), /inválida/i);
});

test('fetchImageBuffer baixa imagem de servidor http local', async () => {
  const png = await makePng();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
    res.end(png);
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    const buf = await fetchImageBuffer('http://127.0.0.1:' + port + '/foto.png');
    assert.ok(Buffer.isBuffer(buf) && buf.length === png.length);
  } finally { server.close(); }
});

test('fetchImageBuffer rejeita content-type não-imagem', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html></html>');
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    await assert.rejects(() => fetchImageBuffer('http://127.0.0.1:' + port + '/x'), /não aponta para uma imagem/i);
  } finally { server.close(); }
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `node --test test/imageProcessor.test.js`
Expected: FAIL — `Cannot find module '../src/utils/imageProcessor'`.

- [ ] **Step 4: Implementar o módulo**

Criar `src/utils/imageProcessor.js`:

```js
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');
const TARGET = 800;
const BG = { r: 255, g: 255, b: 255, alpha: 1 };
const QUALITY = 80;
const MAX_DOWNLOAD = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 8000;

// Baixa uma imagem de uma URL http(s), validando tipo e tamanho. Lança em falha.
async function fetchImageBuffer(url) {
  if (!/^https?:\/\/.+/i.test(String(url || ''))) {
    throw new Error('URL de imagem inválida (http/https).');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error('Não foi possível baixar a imagem (HTTP ' + res.status + ').');
    const ct = res.headers.get('content-type') || '';
    if (!/^image\//i.test(ct)) throw new Error('O link não aponta para uma imagem.');
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > MAX_DOWNLOAD) throw new Error('Imagem muito grande (máx 10 MB).');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('Imagem vazia.');
    if (buf.length > MAX_DOWNLOAD) throw new Error('Imagem muito grande (máx 10 MB).');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// Padroniza (800x800 contain, fundo branco, WebP) e salva no disco. Retorna caminho relativo.
async function processAndSaveProductImage(buffer, productId) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `p${productId}_${Date.now()}.webp`;
  const abs = path.join(UPLOAD_DIR, filename);
  await sharp(buffer)
    .resize(TARGET, TARGET, { fit: 'contain', background: BG })
    .flatten({ background: BG }) // achata transparência (PNG) sobre branco
    .webp({ quality: QUALITY })
    .toFile(abs);
  return '/uploads/products/' + filename;
}

module.exports = { fetchImageBuffer, processAndSaveProductImage, UPLOAD_DIR };
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `node --test test/imageProcessor.test.js`
Expected: PASS — 4 testes verdes.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/utils/imageProcessor.js test/imageProcessor.test.js
git commit -m "feat(imagem): imageProcessor (baixar+padronizar 800x800 webp) com sharp"
```

---

### Task 2: Ligar `productController` ao imageProcessor (URL + upload)

**Files:**
- Modify: `src/controllers/productController.js` (topo: imports/multer; `setProductImage` ~187-209; `setProductImageUrl` ~211-223; novo helper `replaceProductImage`)
- Test: `test/productImage.test.js`

**Interfaces:**
- Consumes (da Task 1): `fetchImageBuffer(url)`, `processAndSaveProductImage(buffer, id)`, `UPLOAD_DIR`.
- Produces: `setProductImageUrl(req, res)` e `setProductImage(req, res)` (assinaturas Express iguais às atuais; exports inalterados). As rotas em `src/routes/products.js` NÃO mudam.

- [ ] **Step 1: Escrever o teste que falha**

Criar `test/productImage.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert');
const { setProductImageUrl } = require('../src/controllers/productController');

function mockRes() {
  return {
    statusCode: 200, body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; }
  };
}

test('setProductImageUrl: id inválido → 400', async () => {
  const res = mockRes();
  await setProductImageUrl({ params: { id: 'abc' }, body: { url: 'http://x/y.png' } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('setProductImageUrl: URL não http/https → 400', async () => {
  const res = mockRes();
  await setProductImageUrl({ params: { id: '1' }, body: { url: 'ftp://x/y.png' } }, res);
  assert.strictEqual(res.statusCode, 400);
});

test('setProductImageUrl: URL inacessível → 422 (sem alterar foto)', async () => {
  const res = mockRes();
  await setProductImageUrl({ params: { id: '1' }, body: { url: 'http://127.0.0.1:1/x.png' } }, res);
  assert.strictEqual(res.statusCode, 422);
});
```

- [ ] **Step 2: Rodar e confirmar a falha**

Run: `node --test --test-force-exit test/productImage.test.js`
Expected: FAIL — o 3º teste retorna 500 (ou erro), porque `setProductImageUrl` ainda grava a URL crua em vez de baixar/tratar. (`--test-force-exit` porque `require` do controller abre o pool MySQL.)

- [ ] **Step 3: Ajustar o topo do controller (imports + multer em memória)**

Em `src/controllers/productController.js`, substituir o bloco atual de imports + `UPLOAD_DIR`/`MIME_EXT`/`storage`/`uploadImage` (linhas ~1-19) por:

```js
const db = require('../database/connection');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fetchImageBuffer, processAndSaveProductImage, UPLOAD_DIR } = require('../utils/imageProcessor');

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\/(jpe?g|png|webp|gif)/.test(file.mimetype))
}).single('image');
```

- [ ] **Step 4: Adicionar o helper `replaceProductImage` e reescrever os dois handlers**

Substituir a função `setProductImage` (POST) e a `setProductImageUrl` (PUT) atuais por:

```js
// Troca products.image por relPath e apaga a imagem local anterior.
// Retorna false se o produto não existe.
async function replaceProductImage(id, relPath) {
  const [[old]] = await db.query('SELECT image FROM products WHERE id = ?', [id]);
  const [r] = await db.query('UPDATE products SET image = ? WHERE id = ?', [relPath, id]);
  if (r.affectedRows === 0) return false;
  if (old && old.image) {
    const oldAbs = path.resolve(__dirname, '..', 'public', '.' + old.image);
    const uploadAbs = path.resolve(UPLOAD_DIR);
    if (oldAbs.startsWith(uploadAbs + path.sep)) fs.unlink(oldAbs, () => {});
  }
  return true;
}

// remove o arquivo recém-criado quando o produto não existe (evita órfão)
function unlinkRel(relPath) {
  fs.unlink(path.resolve(__dirname, '..', 'public', '.' + relPath), () => {});
}

// POST /api/products/:id/image  (upload de arquivo)
function setProductImage(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  uploadImage(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 4MB, imagem).' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    let rel;
    try {
      rel = await processAndSaveProductImage(req.file.buffer, id);
    } catch (e) {
      console.error('Erro ao processar imagem (upload):', e.message);
      return res.status(400).json({ error: 'Arquivo não parece ser uma imagem válida.' });
    }
    try {
      const found = await replaceProductImage(id, rel);
      if (!found) { unlinkRel(rel); return res.status(404).json({ error: 'Produto não encontrado.' }); }
      return res.json({ message: 'Imagem atualizada.', image: rel });
    } catch (e) {
      console.error('Erro ao salvar imagem (upload):', e);
      return res.status(500).json({ error: 'Erro ao salvar imagem.' });
    }
  });
}

// PUT /api/products/:id/image-url  (colar URL)
async function setProductImageUrl(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const url = String(req.body.url || '').trim();
  if (!/^https?:\/\/.+/i.test(url)) return res.status(400).json({ error: 'Informe uma URL de imagem válida (http/https).' });
  let rel;
  try {
    const buffer = await fetchImageBuffer(url);
    rel = await processAndSaveProductImage(buffer, id);
  } catch (e) {
    console.error('Erro ao baixar/processar imagem por URL:', e.message);
    return res.status(422).json({ error: 'Não consegui baixar essa imagem. Verifique o link ou tente outro.' });
  }
  try {
    const found = await replaceProductImage(id, rel);
    if (!found) { unlinkRel(rel); return res.status(404).json({ error: 'Produto não encontrado.' }); }
    return res.json({ message: 'Imagem atualizada.', image: rel });
  } catch (e) {
    console.error('Erro ao gravar imagem por URL:', e);
    return res.status(500).json({ error: 'Erro ao salvar imagem.' });
  }
}
```

Manter o `module.exports` existente inalterado (já exporta `setProductImage` e `setProductImageUrl`).

- [ ] **Step 5: Rodar e confirmar que passa**

Run: `node --test --test-force-exit test/productImage.test.js`
Expected: PASS — 3 testes verdes (400, 400, 422).

- [ ] **Step 6: Sanidade — servidor sobe sem erro de require**

```bash
node -e "require('./src/controllers/productController'); console.log('controller OK')"
```
Expected: imprime `controller OK` (sem erro de módulo). Encerrar qualquer node pendente para liberar a porta 3000.

- [ ] **Step 7: Commit**

```bash
git add src/controllers/productController.js test/productImage.test.js
git commit -m "feat(imagem): URL e upload passam pelo tratamento (webp local) + 404/422"
```

---

### Task 3: Atualizar o texto do editor em `produtos.html`

**Files:**
- Modify: `src/public/produtos.html` (linha do aviso sob a seção de imagem)

**Interfaces:**
- Consumes: nada (só cópia de UI). O fluxo JS não muda — o handler de "Usar" já usa `data.image` do retorno.
- Produces: nada.

- [ ] **Step 1: Trocar o texto do aviso**

Substituir:

```html
<div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">O "Buscar imagem" abre o Google Imagens numa nova aba. Link externo pode quebrar — para durar, prefira o upload do arquivo.</div>
```

por:

```html
<div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">O "Buscar imagem" abre o Google Imagens numa nova aba. Ao colar a URL ou enviar um arquivo, a imagem é copiada e otimizada automaticamente (quadrado, fundo branco, WebP).</div>
```

- [ ] **Step 2: Verificar o parse do HTML/JS**

```bash
node -e "const h=require('fs').readFileSync('src/public/produtos.html','utf8'); const s=h.match(/<script>[\s\S]*<\/script>/g).pop().replace(/<\/?script>/g,''); new Function(s); console.log('parse OK; texto novo:', h.includes('copiada e otimizada automaticamente'));"
```
Expected: `parse OK; texto novo: true`.

- [ ] **Step 3: Commit**

```bash
git add src/public/produtos.html
git commit -m "docs(painel): aviso do editor reflete cópia/otimização automática da imagem"
```

---

## Verificação final (após as 3 tasks)

- [ ] Rodar toda a suíte: `node --test --test-force-exit test/` → todos verdes.
- [ ] Teste manual (opcional, dev): subir `node src/app.js`, no editor de Produtos colar uma URL de imagem pública real e confirmar que o preview mostra a cópia local `.webp` e que a loja renderiza; encerrar node (liberar porta 3000).
- [ ] `git push origin Teste`; confirmar `git rev-list --left-right --count origin/Teste...HEAD` = `0  0`.
- [ ] Lembrete de deploy (quando o usuário pedir): produção precisa de `npm ci` (o `deploy/deploy.sh` já faz) para instalar o binário nativo do `sharp`.
