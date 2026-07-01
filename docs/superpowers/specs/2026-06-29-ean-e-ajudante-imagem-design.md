# Produtos — Guardar EAN + ajudante de imagem no editor — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.

## Objetivo
1. **Guardar o EAN** (código de barras) dos produtos — capturando o `cEAN` das NF-e importadas e permitindo editar no painel.
2. **Ajudante de imagem** no editor de produto: botão que abre a busca de imagem (Google Imagens por nome+marca) em nova aba, e duas formas de definir a foto — **upload do arquivo** (já existe) e **colar URL**.

## Contexto (por que humano-no-loop)
Bases EAN gratuitas (Open Beauty Facts, UPCitemdb) **não cobrem** cosméticos brasileiros (testado com EANs reais Boticário → 0 resultados). Por isso **não** há download automático de imagem; o lojista acha a foto oficial e define. O EAN é guardado pra referência/futuro e pra melhorar a busca.

## Decisões (travadas na conversa)
- Definir imagem: **as duas formas** — upload do arquivo E colar URL.
- Buscar imagem **pelo nome + marca** (Google Imagens, nova aba).
- EAN preenchido pela nota; **backfill ao vincular** (produto sem EAN recebe o EAN da nota).

## Parte 1 — EAN

### Parser (`utils/nfe.js`)
No map de itens, acrescentar `ean`: `const eanRaw = String(p.cEAN != null ? p.cEAN : '').trim(); ean = /^\d{8,14}$/.test(eanRaw) ? eanRaw : ''` (filtra "SEM GTIN" e lixo). Adicionar `ean` ao objeto de cada item.

### Banco (migração aditiva, idempotente)
- `ALTER TABLE products ADD COLUMN ean VARCHAR(14) NULL`
- `ALTER TABLE nf_entrada_itens ADD COLUMN ean VARCHAR(14) NULL`

### Importação (`nfController.importar`)
- INSERT `nf_entrada_itens`: incluir `ean` (= `it.ean || null`).
- Ação **criar**: INSERT `products` inclui `ean` (= `it.ean || null`).
- Ação **vincular**: após resolver `productId`, se o produto não tiver EAN, backfill: `UPDATE products SET ean=? WHERE id=? AND (ean IS NULL OR ean='') AND ? <> ''` (só quando `it.ean` não vazio).

### API de produto (`productController`)
- `getProductById` e `listAllProducts`: incluir `ean` (e `image`, se ainda não vier) no retorno.
- `updateProduct`: desestruturar `ean`; incluir `ean=?` no UPDATE (valor `ean || null`). (Sem tocar em image aqui.)
- **Novo** `setProductImageUrl` — `PUT /api/products/:id/image-url` (sob `auth`): body `{ url }`; valida `^https?://` (recomendado https); `UPDATE products SET image=? WHERE id=?`. Rota registrada em `routes/products.js`.

## Parte 2 — Editor de produto (`list-products.html`)
No modal de editar produto, adicionar:
- **Campo EAN** (input texto, editável, pré-preenchido de `getProductById`/allProducts). No salvar (updateProduct) enviar `ean`.
- **Seção de imagem**:
  - **Miniatura** da imagem atual (`product.image`) — ou um placeholder se vazia.
  - **Buscar imagem**: botão que abre `https://www.google.com/search?tbm=isch&q=<encodeURIComponent(nome + ' ' + franquia)>` em nova aba (`target=_blank`, `rel=noopener`).
  - **Upload do arquivo**: input file → `POST /api/products/:id/image` (endpoint atual), recarrega a miniatura.
  - **Colar URL**: input de URL + botão "Usar esta URL" → `PUT /api/products/:id/image-url`, recarrega a miniatura. Aviso curto: "link externo pode quebrar; prefira https".
- Recarregar a lista/miniatura após cada ação (via Auth.apiFetch, padrão da página).

## Erros / segurança
- Migração só ADD COLUMN (não-destrutiva). Não mexe em estoque/preço.
- URL da imagem validada (http/https) no servidor; SQL parametrizado; upload continua limitado (4MB, imagem) pelo endpoint atual.
- Valores dinâmicos escapados (`esc`). `EAN` normalizado (8–14 dígitos) na captura; no editor aceita edição livre mas salva como está (VARCHAR).
- `products.image` pode conter caminho local (/uploads/...) OU URL externa; a loja já renderiza `src=${p.image}` — funciona para ambos. (Ao trocar imagem, o `setProductImage` só apaga arquivo antigo se for local — URL externa não é apagada, ok.)

## Fora de escopo
- Download automático de imagem (base grátis não cobre BR).
- Busca de imagem embutida no painel (abrimos o Google em nova aba).
- Leitor de código de barras / scanner.

## Testes
- Parser: XML real → itens trazem `ean` (dígitos) e "SEM GTIN" vira ''.
- Import: `nf_entrada_itens.ean` gravado; produto **criado** por NF tem `ean`; **vincular** a um produto sem EAN preenche o EAN.
- API: `GET /api/products/:id` retorna `ean`+`image`; `PUT /api/products/:id` salva `ean`; `PUT /api/products/:id/image-url` valida URL e salva.
- Navegador: editor mostra EAN + miniatura; "Buscar imagem" abre o Google certo; upload e colar-URL trocam a foto; a loja mostra a imagem (local ou URL).

## Decomposição prevista (p/ o plano)
T1 backend (parser cEAN + colunas ean + importar grava/backfill + productController ean/image + endpoint image-url). · T2 editor (list-products.html: campo EAN + seção de imagem com miniatura/upload/colar-URL + botão Buscar imagem).
