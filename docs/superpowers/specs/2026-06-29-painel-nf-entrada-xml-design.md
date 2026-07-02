# Painel — Notas Fiscais de entrada via upload de XML — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.
**Sensível:** dá entrada no **estoque** (quantidades) → transacional, servidor autoritativo nos valores.

## Objetivo
No dashboard admin, o lojista sobe o **XML da NF-e de compra**; o sistema lê (chave, fornecedor, itens, valores, total), mostra uma prévia, e ao confirmar **registra a nota** e **soma as quantidades no estoque** dos produtos vinculados. Grátis, sem certificado digital.

## Decisões (travadas na conversa)
- Registrar a nota **E** somar no estoque (não só histórico).
- Casamento item↔produto **manual com memória**: na 1ª vez o admin escolhe o produto de cada item; o vínculo (fornecedor CNPJ + código do item) é guardado e sugerido nas próximas notas do mesmo fornecedor.
- Item sem produto: pode **vincular a existente**, **criar produto novo a partir do item** (nome/custo do XML; admin escolhe franquia/preço de venda), ou **ignorar** (nota registrada, item sem estoque).
- Duplicidade: a mesma **chave** não importa 2×.
- Guardar o **XML** da nota (registro fiscal/auditoria).

## Banco de dados (migrações idempotentes no connection.js)
```sql
CREATE TABLE IF NOT EXISTS nf_entradas (
  id INT AUTO_INCREMENT PRIMARY KEY,
  chave VARCHAR(44) NOT NULL UNIQUE,
  emitente_nome VARCHAR(160), emitente_cnpj VARCHAR(14),
  numero VARCHAR(20), serie VARCHAR(10),
  valor_total DECIMAL(12,2), data_emissao DATETIME NULL,
  xml LONGTEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS nf_entrada_itens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nf_id INT NOT NULL,
  cprod VARCHAR(60), descricao VARCHAR(255), ncm VARCHAR(10),
  quantidade DECIMAL(12,3), valor_unit DECIMAL(12,4), valor_total DECIMAL(12,2),
  product_id INT NULL,
  INDEX (nf_id)
);
CREATE TABLE IF NOT EXISTS nf_item_vinculos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  emitente_cnpj VARCHAR(14) NOT NULL, cprod VARCHAR(60) NOT NULL,
  product_id INT NOT NULL,
  UNIQUE KEY uq_vinc (emitente_cnpj, cprod)
);
```

## Backend
- **Dependência nova:** `fast-xml-parser` (leve, sem binário nativo). `npm install fast-xml-parser`.
- **`src/utils/nfe.js`** — `parseNfeXml(xmlString)` → objeto defensivo:
  - Config `{ ignoreAttributes:false, attributeNamePrefix:'@_' }`.
  - Navega `nfeProc.NFe.infNFe` (ou `NFe.infNFe` se não processada).
  - `chave` = `infNFe['@_Id']` sem o prefixo `NFe` (44 dígitos).
  - `numero` = `ide.nNF`, `serie` = `ide.serie`, `dataEmissao` = `ide.dhEmi || ide.dEmi`.
  - `emitente` = `{ nome: emit.xNome, cnpj: emit.CNPJ }`.
  - `valorTotal` = `total.ICMSTot.vNF`.
  - `itens` = `det` (normalizar para array) → cada `{ cprod: prod.cProd, descricao: prod.xProd, ncm: prod.NCM, quantidade: Number(prod.qCom), valorUnit: Number(prod.vUnCom), valorTotal: Number(prod.vProd) }`.
  - XML inválido / sem infNFe → lança erro (tratado no controller como 400).
- **`src/controllers/nfController.js`** (admin):
  - `preview` (multer **memoryStorage** `.single('xml')`): parseNfexml; se a chave já existe em `nf_entradas` → retorna `{ jaImportada:true, ... }`; para cada item, busca em `nf_item_vinculos` (por emitente_cnpj+cprod) o `product_id` sugerido. Retorna `{ chave, numero, emitente, valorTotal, dataEmissao, itens:[...,{ sugestaoProductId }], jaImportada }` + a lista de produtos (id, name, code) para os seletores (ou o front busca de `/api/products`). **Não grava nada.**
  - `importar` (multer memory `.single('xml')` + campo texto `decisoes` JSON): re-parseia o XML (autoritativo), valida chave não duplicada; numa **transação**:
    1. INSERT `nf_entradas` (+ xml).
    2. para cada item, conforme `decisoes[cprod]` = `{ acao: 'vincular'|'criar'|'ignorar', product_id?, novo?{name,franchise,sale_value,code} }`:
       - `vincular`: usa `product_id`; entra no estoque.
       - `criar`: INSERT em `products` (cost = valorUnit do XML, sale_value/franchise/code do admin, estoque 0) → product_id; entra no estoque.
       - `ignorar`: product_id = null; sem estoque.
       - INSERT `nf_entrada_itens` com o product_id resultante.
       - se entrou no estoque: `UPDATE products SET estoque = estoque + qtd` + INSERT `estoque_movimentacoes (product_id, 'Entrada', qtd, 'NF <numero>')` (reaproveita a semântica do estoqueController).
       - se `vincular`/`criar`: upsert `nf_item_vinculos (emitente_cnpj, cprod, product_id)` (memória).
    3. commit. Em erro → rollback (nada de estoque pela metade).
  - `listar` `GET /api/nf` → notas (id, chave, emitente_nome, numero, valor_total, data_emissao, created_at, qtd_itens).
  - `detalhe` `GET /api/nf/:id` → nota + itens (com nome do produto vinculado).
- **Rotas:** `src/routes/nf.js` montado em `app.use('/api/nf', apiLimiter, auth, nfRoutes)`.
- **Quantidade no estoque:** `qCom` pode ser fracionário no XML; o estoque é inteiro — arredondar/validar (usar `Math.round` ou rejeitar fração; padrão: arredondar para inteiro). Definir: **arredonda para inteiro** (cosméticos vêm em unidades).

## Frontend — página admin `notas.html`
- No padrão das páginas admin (`/js/auth.js`, `Auth.apiFetch`, sidebar, Bootstrap, SweetAlert). Link novo **"Notas"** no menu lateral.
- **Upload:** input de arquivo (.xml) → `POST /api/nf/preview`.
- **Prévia:** cabeçalho (fornecedor, nº, data, total); aviso se `jaImportada`. Tabela de itens: descrição, qtd, valor unit; por item um controle de **ação**: `[ Vincular ▾ (select de produtos, pré-selecionado pela sugestão) | Criar novo | Ignorar ]`; quando "Criar novo", campos rápidos (franquia + preço de venda; nome/código pré-preenchidos do XML). Um botão **Importar** → `POST /api/nf/importar` (multipart: o mesmo arquivo + `decisoes`).
- **Histórico:** lista de notas importadas (`GET /api/nf`) com link de detalhe (`GET /api/nf/:id`). Escapar valores no innerHTML.

## Erros / segurança
- Admin-only (`auth`); upload limitado (multer `limits.fileSize`, ex.: 2MB) e só XML.
- Servidor **re-parseia** o XML na importação (não confia em valores/quantidades vindos do cliente — só as decisões de vínculo/ação por `cprod`).
- Duplicidade pela `chave` (UNIQUE + checagem) → 409.
- Estoque numa **transação** (rollback em falha).
- XML malformado / não-NFe → 400 com mensagem clara.

## Fora de escopo (futuro)
- SaaS/SEFAZ direto (captura automática por CNPJ/certificado).
- Conferência financeira/contábil, impostos, devolução.
- Edição de nota já importada; exclusão estorna estoque.

## Testes
- Unit `parseNfeXml` sobre um XML de NF-e de exemplo (fixture): extrai chave (44), emitente, número, total e N itens com qtd/valor.
- API: preview de um XML → retorna itens + sugestões; preview de chave já importada → `jaImportada`.
- Importar: com 1 item "vincular" → grava nota+item, soma no estoque do produto, cria movimentação 'Entrada', salva vínculo; reimportar a mesma chave → 409; item "criar" → cria produto + estoque; transação (forçar erro → nada aplicado).
- Memória: 2ª nota do mesmo fornecedor/cprod → preview já sugere o product_id.
- Navegador: upload → prévia → importar → conferir estoque atualizado e a nota no histórico.

## Decomposição prevista (p/ o plano)
T1 `fast-xml-parser` + `utils/nfe.js parseNfeXml` + teste com fixture. · T2 migrações (3 tabelas) + `nfController.preview` (multer memory, parse, dedupe, sugestão) + rota/mount. · T3 `nfController.importar` (transação: nota+itens+estoque+criar produto+vínculos) + `listar`/`detalhe`. · T4 página `notas.html` (upload→prévia→ações por item→importar; histórico) + link no menu.
