# Tratamento de imagem de produto (Nível 2) — Design

**Data:** 2026-07-01
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

Toda imagem de produto definida no painel — por **URL colada** ou por **upload de arquivo** — passa a ser normalizada no servidor: redimensionada para um quadrado padrão com fundo branco, convertida para WebP e salva como **cópia local** em `/uploads/products/`. Isso deixa o catálogo visualmente uniforme, acelera o carregamento e elimina a dependência de links externos (que podem quebrar / bloquear hotlink).

## Decisões (aprovadas)

- **Alcance:** tratar **link E upload** (as duas entradas passam pelo mesmo tratamento).
- **Falha de download/processamento:** **avisar e não salvar** — erro claro na UI, mantém a foto atual.
- Padrões de tratamento (ajustáveis no código, constantes no topo do módulo):
  - Tamanho: **800×800 px**.
  - Enquadramento: `fit: contain` (produto inteiro, nunca corta) com padding de **fundo branco** `{ r:255, g:255, b:255, alpha:1 }`.
  - Formato de saída: **WebP**, qualidade **80**.
  - Download: limite **10 MB**, timeout **8s**.
  - Upload: mantém limite atual **4 MB**, `fileFilter` só `image/*`.

## Arquitetura / Componentes

### Novo módulo: `src/utils/imageProcessor.js`
Responsabilidade única: obter e padronizar uma imagem de produto. Não conhece Express nem o banco.

- `async fetchImageBuffer(url) → Buffer`
  - Valida `^https?://` (senão lança `Error` com mensagem clara).
  - `fetch` global (Node 18+) com `AbortController` (timeout 8s).
  - Rejeita se `!res.ok`, se `content-type` não casar `^image/`, ou se o corpo exceder 10 MB.
  - Retorna o `Buffer` da imagem.
- `async processAndSaveProductImage(buffer, productId) → string` (caminho relativo)
  - `sharp(buffer)` → `.resize(800, 800, { fit: 'contain', background: BG_BRANCO })` → `.webp({ quality: 80 })` → grava em `UPLOAD_DIR/p<productId>_<Date.now()>.webp`.
  - Retorna `'/uploads/products/p<id>_<ts>.webp'`.
  - `sharp` lança se o buffer não for imagem válida — propaga para o controller tratar como falha.
- Constantes no topo: `TARGET = 800`, `BG = { r:255, g:255, b:255, alpha:1 }`, `QUALITY = 80`, `MAX_DOWNLOAD = 10*1024*1024`, `TIMEOUT_MS = 8000`, `UPLOAD_DIR` (mesmo de productController).

### `src/controllers/productController.js`
- **`setProductImageUrl` (PUT `/api/products/:id/image-url`)** — reescrito:
  1. valida id e `^https?://` (400 se inválido);
  2. `buffer = await fetchImageBuffer(url)`;
  3. `rel = await processAndSaveProductImage(buffer, id)`;
  4. lê `image` antiga, `UPDATE products SET image=? WHERE id=?` (404 se `affectedRows===0` — nesse caso apaga o arquivo recém-criado para não deixar órfão);
  5. remove o arquivo antigo se for local em `/uploads/products/` (best-effort, igual ao upload);
  6. responde `{ message, image: rel }`;
  7. em erro de `fetchImageBuffer`/`processAndSaveProductImage`: **422** com mensagem clara (não altera a foto atual).
- **`setProductImage` (POST `/api/products/:id/image`)** — ajustado para tratar o upload:
  - multer passa a usar `memoryStorage` (recebe `req.file.buffer`);
  - remove `diskStorage`/`MIME_EXT` (a saída agora é sempre `.webp`);
  - mantém `limits.fileSize = 4MB` e `fileFilter` `image/*`;
  - `rel = await processAndSaveProductImage(req.file.buffer, id)`; grava, remove antiga, responde `{ message, image: rel }`;
  - erro de processamento → 400 "Arquivo não parece ser uma imagem válida.".

### Front-end
- Nenhuma mudança funcional: `produtos.html` já usa `data.image` do retorno para atualizar o preview, e a loja renderiza `src=p.image`. Como o retorno passa a ser um caminho local, tudo funciona igual.
- Ajuste de cópia: o texto do editor que diz "Link externo pode quebrar; para durar, prefira o upload" passa a refletir que a imagem é **copiada e otimizada** ao salvar.

## Fluxo de dados

- **Colar URL:** editor → `PUT /image-url {url}` → `fetchImageBuffer` → `processAndSaveProductImage` → grava `.webp` local → `UPDATE products.image` → retorna caminho local → preview e loja mostram a cópia otimizada.
- **Upload:** editor → `POST /image` (multipart) → multer memória → `processAndSaveProductImage(req.file.buffer)` → mesmo resultado.

## Erros

| Situação | Resposta |
|---|---|
| URL não http/https | 400 "Informe uma URL de imagem válida (http/https)." |
| Download falha (timeout, !ok, não-imagem, >10MB) | 422 "Não consegui baixar essa imagem. Verifique o link ou tente outro." |
| Buffer inválido no sharp (URL) | 422 (mesma mensagem) |
| Buffer inválido no sharp (upload) | 400 "Arquivo não parece ser uma imagem válida." |
| Produto inexistente | 404 "Produto não encontrado." (apaga arquivo recém-criado) |
| Remoção de arquivo antigo falha | ignora (best-effort) |

## Dependência / Deploy

- Adicionar `sharp` em `dependencies` (runtime) do `package.json` + atualizar `package-lock.json`.
- `deploy/deploy.sh` roda `npm ci --omit=dev` → produção instala o binário nativo (prebuilt) no próximo deploy. `sharp` é dep de runtime, então `--omit=dev` mantém.
- Node 22 local; VPS Node 18+ (prebuilt cobre ambos).

## Migração / Compatibilidade

- Sem mudança de schema. `products.image` (VARCHAR(255)) continua guardando o caminho local (ex.: `/uploads/products/p12_1699999999999.webp`).
- Imagens antigas (URLs cruas já gravadas) continuam funcionando; só as **novas** passam pelo tratamento. Sem backfill (YAGNI). Um botão "reprocessar antigas" fica para depois, se solicitado.

## Testes

- **`imageProcessor` (unit/integração):**
  - `processAndSaveProductImage`: gera um PNG pequeno com `sharp`, processa, confirma que o arquivo `.webp` existe e que `sharp(metadata)` dá 800×800.
  - `fetchImageBuffer`: sobe um mini servidor `http` local que serve um PNG → retorna Buffer; servindo `content-type` não-imagem → rejeita; URL sem http/https → rejeita.
- **Controllers:**
  - `setProductImageUrl` com URL inválida → 400 (sem tocar no banco).
  - Regressão: `setProductImage` (upload em memória) grava e retorna caminho `.webp`.
- Cleanup: testes apagam os arquivos que criarem em `/uploads/products/`.
