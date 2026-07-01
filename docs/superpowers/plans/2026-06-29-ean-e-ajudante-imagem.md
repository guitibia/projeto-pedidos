# Produtos — EAN + ajudante de imagem — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capturar/guardar o EAN dos produtos (via NF e edição) e adicionar um ajudante de imagem no editor (buscar no Google + upload + colar URL).

**Architecture:** Backend: o parser de NF passa a extrair `cEAN`; migrações adicionam `ean` em `products` e `nf_entrada_itens`; a importação grava/backfilla o EAN; a API do produto retorna/salva `ean` e ganha um endpoint para setar imagem por URL. Frontend: o editor de produto ganha campo EAN + seção de imagem (miniatura, buscar, upload, colar URL).

**Tech Stack:** Node/Express, MySQL (mysql2/promise), HTML/CSS/JS vanilla (Bootstrap, SweetAlert), multer (já existente).

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- Migração **não-destrutiva** (só `ADD COLUMN`), idempotente (`try/catch` no `connection.js`). Não mexe em estoque/preço.
- EAN capturado só quando `cEAN` é 8–14 dígitos (filtra "SEM GTIN"). `products.image` pode ser caminho local OU URL externa (a loja já renderiza `src=${p.image}`).
- URL de imagem validada `^https?://` no servidor; SQL parametrizado; valores dinâmicos escapados (`esc`) no editor. Upload continua limitado (4MB, imagem) pelo endpoint atual.
- Sem suíte automatizada — node/curl + navegador (matar `node` após: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`; DB `Teste`→`db_pedidos_teste`). Admin token: `JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")`.

---

### Task 1: Backend — EAN (parser, DB, importar, API) + endpoint image-url

**Files:**
- Modify: `src/utils/nfe.js`, `src/database/connection.js`, `src/controllers/nfController.js`, `src/controllers/productController.js`, `src/routes/products.js`

**Interfaces:**
- Produz: item do parser com `ean`; colunas `products.ean`/`nf_entrada_itens.ean`; `GET /api/products/:id` e `/all` retornam `ean`; `PUT /api/products/:id` salva `ean`; `PUT /api/products/:id/image-url` `{url}` seta a imagem.

- [ ] **Step 1: Parser captura o EAN**

Em `src/utils/nfe.js`, no `det.map(function (d) { const p = ...; return { ... } })`, acrescentar `ean` ao objeto retornado de cada item:
```js
    const eanRaw = String(p.cEAN != null ? p.cEAN : '').trim();
    return {
      cprod: String(p.cProd != null ? p.cProd : ''),
      descricao: String(p.xProd != null ? p.xProd : ''),
      ncm: String(p.NCM != null ? p.NCM : ''),
      ean: /^\d{8,14}$/.test(eanRaw) ? eanRaw : '',
      quantidade: Number(p.qCom) || 0,
      valorUnit: Number(p.vUnCom) || 0,
      valorTotal: Number(p.vProd) || 0,
    };
```
(mantendo os campos que já existem; só adiciona `ean`.)

- [ ] **Step 2: Migrações (ADD COLUMN)**

Em `src/database/connection.js`, após a última migração, adicionar:
```js
    for (const sql of [
      'ALTER TABLE products ADD COLUMN ean VARCHAR(14) NULL',
      'ALTER TABLE nf_entrada_itens ADD COLUMN ean VARCHAR(14) NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }
```

- [ ] **Step 3: Importação grava/backfilla o EAN**

Em `src/controllers/nfController.js`, no `importar`:
- No INSERT de `nf_entrada_itens`, incluir a coluna `ean`:
```js
        await conn.query(
          'INSERT INTO nf_entrada_itens (nf_id, cprod, descricao, ncm, ean, quantidade, valor_unit, valor_total, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [nfId, it.cprod, it.descricao, it.ncm, it.ean || null, it.quantidade, it.valorUnit, it.valorTotal, productId]
        );
```
- Na ação **criar**, incluir `ean` no INSERT de `products`:
```js
          const [pr] = await conn.query(
            'INSERT INTO products (name, cost, sale_value, franchise, code, ean, estoque) VALUES (?, ?, ?, ?, ?, ?, 0)',
            [String(d.novo.name || it.descricao).slice(0, 200),
             it.valorUnit,
             Number(d.novo.sale_value) || it.valorUnit,
             String(d.novo.franchise || 'Outros').slice(0, 60),
             String(d.novo.code || it.cprod).slice(0, 60),
             it.ean || null]
          );
          productId = pr.insertId;
```
- No bloco `if (productId) { ... }` (que já faz estoque + vínculo), adicionar o **backfill** do EAN (no-op para o produto recém-criado, que já tem EAN; preenche o EAN de um produto vinculado que ainda não tinha):
```js
          if (it.ean) {
            await conn.query("UPDATE products SET ean=? WHERE id=? AND (ean IS NULL OR ean='')", [it.ean, productId]);
          }
```

- [ ] **Step 4: API do produto — ean no retorno/salvamento + endpoint image-url**

Em `src/controllers/productController.js`:
- `getProductById`: garantir que a query inclua `ean` — se o SELECT lista colunas explicitamente (ex.: `SELECT id, name, ...`), adicionar `ean` à lista; então incluir `ean: p.ean ?? null` no JSON de resposta. (`listAllProducts` já faz `SELECT *` → o `ean` vem automaticamente.)
- `updateProduct`: desestruturar `ean` do body e incluir no UPDATE:
```js
  const { name, sale_value, franchise, code, promotion_price, description, ean } = req.body;
```
e o UPDATE:
```js
    const [result] = await conn.query(
      'UPDATE products SET name=?, cost=?, sale_value=?, franchise=?, code=?, promotion_price=?, description=?, ean=? WHERE id=?',
      [name, cost, sv, franchise, code, promoVal, description ?? null, (ean && String(ean).trim()) ? String(ean).trim().slice(0,14) : null, id]
    );
```
- Adicionar e exportar `setProductImageUrl`:
```js
async function setProductImageUrl(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const url = String(req.body.url || '').trim();
  if (!/^https?:\/\/.+/i.test(url)) return res.status(400).json({ error: 'Informe uma URL de imagem válida (http/https).' });
  try {
    const [r] = await db.query('UPDATE products SET image=? WHERE id=?', [url.slice(0, 500), id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json({ message: 'Imagem atualizada.', image: url });
  } catch (e) { console.error('Erro ao definir imagem por URL:', e); return res.status(500).json({ error: 'Erro ao salvar imagem.' }); }
}
```
(incluir `setProductImageUrl` no `module.exports`.)
Em `src/routes/products.js`: importar `setProductImageUrl` e registrar `router.put('/:id/image-url', setProductImageUrl);` (antes de `router.get('/:id', ...)` — não colide, mas mantenha as rotas específicas antes das genéricas).

- [ ] **Step 5: Verificar**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
JWT=$(node -e "require('dotenv').config();console.log(require('jsonwebtoken').sign({id:1,username:'test',role:'admin'}, process.env.JWT_SECRET))")
echo "colunas ean:"; node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [a]=await db.query('SHOW COLUMNS FROM products LIKE \"ean\"');const [b]=await db.query('SHOW COLUMNS FROM nf_entrada_itens LIKE \"ean\"');console.log('products.ean:',a.length===1,'| nf_entrada_itens.ean:',b.length===1);process.exit(0)})()" 2>/dev/null
echo "parser ean (SEM GTIN vira ''):"; node -e "const {parseNfeXml}=require('./src/utils/nfe');const xml='<nfeProc xmlns=\"http://www.portalfiscal.inf.br/nfe\"><NFe><infNFe Id=\"NFe12345678901234567890123456789012345678901234\"><ide><nNF>1</nNF></ide><emit><CNPJ>1</CNPJ><xNome>X</xNome></emit><det><prod><cProd>A</cProd><cEAN>7891033473649</cEAN><xProd>P1</xProd><qCom>1</qCom><vUnCom>1</vUnCom><vProd>1</vProd></prod></det><det><prod><cProd>B</cProd><cEAN>SEM GTIN</cEAN><xProd>P2</xProd><qCom>1</qCom><vUnCom>1</vUnCom><vProd>1</vProd></prod></det><total><ICMSTot><vNF>2</vNF></ICMSTot></total></infNFe></NFe></nfeProc>';const nf=parseNfeXml(xml);console.log('ean item1:',nf.itens[0].ean,'| item2 (SEM GTIN):',JSON.stringify(nf.itens[1].ean));"
echo "updateProduct salva ean + get retorna:"; PID=$(node -e "require('dotenv').config();const db=require('./src/database/connection');(async()=>{const [[p]]=await db.query('SELECT id,name,sale_value,franchise,code FROM products LIMIT 1');console.log(JSON.stringify(p));process.exit(0)})()" 2>/dev/null)
ID=$(echo $PID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).id))")
NM=$(echo $PID | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).name))")
curl -s http://localhost:3000/api/products/$ID -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d "{\"name\":\"$NM\",\"sale_value\":10,\"franchise\":\"Outros\",\"code\":\"ZZ\",\"ean\":\"7891033473649\"}" >/dev/null
echo -n "GET tem ean: "; curl -s http://localhost:3000/api/products/$ID -H "Authorization: Bearer $JWT" | grep -o '"ean":"[^"]*"'
echo -n "image-url inválida -> 400: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/products/$ID/image-url -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"url":"nao-e-url"}'
echo -n "image-url válida -> ok: "; curl -s http://localhost:3000/api/products/$ID/image-url -X PUT -H "Content-Type: application/json" -H "Authorization: Bearer $JWT" -d '{"url":"https://exemplo.com/foto.jpg"}'
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: colunas ean true/true; parser: ean item1 = 7891033473649, item2 = "" ; GET tem `"ean":"7891033473649"`; image-url inválida → 400; válida → ok.

- [ ] **Step 6: Commit**

```bash
git add src/utils/nfe.js src/database/connection.js src/controllers/nfController.js src/controllers/productController.js src/routes/products.js
git commit -m "feat(produtos): captura/guarda EAN da NF + API (ean no produto, PUT image-url)"
```

---

### Task 2: Editor — campo EAN + seção de imagem (buscar/upload/URL)

**Files:**
- Modify: `src/public/list-products.html`

**Interfaces:**
- Consome: `GET /api/products/all` (agora com `ean`/`image`), `PUT /api/products/:id` (salva `ean`), `POST /api/products/:id/image` (upload), `PUT /api/products/:id/image-url` (URL). `Auth.apiFetch`, `esc`.

- [ ] **Step 1: Campos no modal de editar produto**

No `#editModal`/`#edit-form` de `list-products.html`, após os campos existentes (e antes/junto do bloco de desconto), adicionar:
```html
          <div class="mb-3">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--text-muted)">EAN (código de barras)</label>
            <input type="text" class="form-control" id="edit-ean" inputmode="numeric" placeholder="Ex.: 7891033473649">
          </div>
          <div class="mb-3">
            <label class="form-label" style="font-size:.8rem;font-weight:600;color:var(--text-muted)">Imagem do produto</label>
            <div class="d-flex align-items-center gap-2 mb-2">
              <img id="edit-img-preview" src="" alt="" style="width:56px;height:56px;object-fit:cover;border-radius:8px;border:1px solid var(--border-color);background:var(--hover-tint)" onerror="this.style.visibility='hidden'">
              <button type="button" class="btn btn-outline-secondary btn-sm" id="edit-buscar-img"><i class="bi bi-search me-1"></i>Buscar imagem</button>
            </div>
            <input type="file" class="form-control form-control-sm mb-2" id="edit-img-file" accept="image/*">
            <div class="input-group input-group-sm">
              <input type="url" class="form-control" id="edit-img-url" placeholder="ou cole a URL da imagem (https://…)">
              <button type="button" class="btn btn-outline-secondary" id="edit-img-url-btn">Usar</button>
            </div>
            <div style="font-size:.72rem;color:var(--text-muted);margin-top:.2rem">Link externo pode quebrar; para durar, prefira o upload do arquivo.</div>
          </div>
```

- [ ] **Step 2: Popular no openEdit + incluir ean no salvar**

Em `openEdit(id)`, preencher os novos campos a partir de `p` (de `allProducts`, que tem `ean`/`image`):
```js
    document.getElementById('edit-ean').value = p.ean || '';
    var img = document.getElementById('edit-img-preview');
    img.src = p.image || ''; img.style.visibility = p.image ? 'visible' : 'hidden';
    document.getElementById('edit-img-url').value = '';
    document.getElementById('edit-img-file').value = '';
    document.getElementById('edit-form').dataset.pid = p.id;
    document.getElementById('edit-form').dataset.pname = p.name;
    document.getElementById('edit-form').dataset.pfranq = p.franchise;
```
No `submit` do `#edit-form`, acrescentar `ean` ao payload do `PUT /api/products/:id`:
```js
      ean: document.getElementById('edit-ean').value.trim(),
```

- [ ] **Step 3: Botões de imagem (buscar / upload / URL)**

Adicionar os listeners (uma vez, junto dos outros handlers):
```js
  document.getElementById('edit-buscar-img').addEventListener('click', function () {
    var form = document.getElementById('edit-form');
    var q = ((form.dataset.pname || '') + ' ' + (form.dataset.pfranq || '')).trim();
    window.open('https://www.google.com/search?tbm=isch&q=' + encodeURIComponent(q), '_blank', 'noopener');
  });
  document.getElementById('edit-img-file').addEventListener('change', async function () {
    var id = document.getElementById('edit-form').dataset.pid; if (!id || !this.files.length) return;
    var fd = new FormData(); fd.append('image', this.files[0]);
    var res = await fetch('/api/products/' + id + '/image', { method:'POST', headers:{ Authorization:'Bearer ' + Auth.getToken() }, body: fd });
    var data = await res.json();
    if (!res.ok) return Swal.fire('Erro', data.error || 'Falha no upload.', 'error');
    var img = document.getElementById('edit-img-preview'); img.src = data.image || img.src; img.style.visibility='visible';
    Swal.fire({ icon:'success', title:'Imagem enviada!', timer:1000, showConfirmButton:false }); loadProducts();
  });
  document.getElementById('edit-img-url-btn').addEventListener('click', async function () {
    var id = document.getElementById('edit-form').dataset.pid; var url = document.getElementById('edit-img-url').value.trim();
    if (!id || !url) return;
    var res = await Auth.apiFetch('/api/products/' + id + '/image-url', { method:'PUT', body: JSON.stringify({ url }) });
    var data = await res.json();
    if (!res.ok) return Swal.fire('Erro', data.error || 'URL inválida.', 'error');
    var img = document.getElementById('edit-img-preview'); img.src = url; img.style.visibility='visible';
    Swal.fire({ icon:'success', title:'Imagem definida!', timer:1000, showConfirmButton:false }); loadProducts();
  });
```
(o upload usa `fetch` direto com Authorization por ser multipart; a URL usa `Auth.apiFetch` normal.)

- [ ] **Step 4: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "list-products 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/list-products.html
node -e "const h=require('fs').readFileSync('src/public/list-products.html','utf8'); console.log('edit-ean:', h.includes('edit-ean'), '| buscar img:', h.includes('edit-buscar-img')&&h.includes('tbm=isch'), '| upload:', h.includes('/image')&&h.includes('FormData'), '| url:', h.includes('/image-url'), '| ean no payload:', /ean:\s*document/.test(h)); const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; edit-ean/buscar/upload/url/ean-no-payload true; JS parse OK.

- [ ] **Step 5: Teste no navegador (manual)**

`npm run dev` → Produtos → editar um produto: ver/editar o EAN (salva); "Buscar imagem" abre o Google Imagens com nome+marca; escolher uma foto, salvar e subir o arquivo → miniatura atualiza e a loja mostra; colar uma URL https → miniatura atualiza. Importar uma NF e conferir que o produto criado/vinculado ganhou o EAN.

- [ ] **Step 6: Commit**

```bash
git add src/public/list-products.html
git commit -m "feat(painel): editor de produto com EAN + ajudante de imagem (buscar/upload/URL)"
```
