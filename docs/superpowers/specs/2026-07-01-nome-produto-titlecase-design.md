# Padronizar nome de produto da NF em Title Case (pt-BR) — Design

**Data:** 2026-07-01
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

Nomes de produto que hoje entram TODOS EM MAIÚSCULO (vindos da descrição `xProd` da NF-e) passam a ficar em "Caixa de Título" pt-BR (só a 1ª letra de cada palavra maiúscula). Vale para novas importações de NF e para uma correção única dos produtos já cadastrados em caixa alta.

## Decisões (aprovadas)

- **Alcance:** novas importações de NF **E** correção única dos produtos atuais que estão gritando.
- **Regra:** simples — 1ª letra de cada palavra que começa com letra vira maiúscula, resto minúsculo. Siglas viram meio-maiúsculas (EDP → Edp) — aceito pelo usuário. Unidades e números ficam intactos (`100ml`, `4,0g`, `330`, `V11`, `V3`).
- **Só a importação de NF padroniza.** O editor manual de Produtos continua livre.

## Regra de transformação (exemplos reais)

| Entrada (NF) | Saída |
|---|---|
| THE BLEND EDP CARDAMOM 100ml | The Blend Edp Cardamom 100ml |
| LILY OL PERF DES CPO 150ml V11 | Lily Ol Perf Des Cpo 150ml V11 |
| QDB BAT EF MAT BERE 330 4,0g | Qdb Bat Ef Mat Bere 330 4,0g |
| MALBEC DES COL MAGNETIC V3 100ml | Malbec Des Col Magnetic V3 100ml |
| ÁGUA DE COLÔNIA | Água De Colônia |

## Arquitetura / Componentes

### Novo módulo `src/utils/textcase.js` (puro, testável)
- `titleCasePtBr(str) → string`: `String(str).toLowerCase().replace(/(^|\s)(\p{L})/gu, (_,sep,ch) => sep + ch.toUpperCase())`.
  - Sobe a 1ª letra de cada "palavra" após início/espaço, **apenas se for letra** (Unicode `\p{L}`, cobre acentos). Palavras que começam com dígito/símbolo (`100ml`, `4,0g`) ficam minúsculas. `null`/vazio → `''`.
- `isShoutingName(str) → boolean`: true se há ao menos uma palavra que começa com letra E **nenhuma** dessas palavras-com-letra contém minúscula. Ou seja, "está 100% gritando" nas palavras alfabéticas, ignorando tokens numéricos (`100ml`).
  - Implementação: `split(/\s+/)`, para cada palavra que casa `/^\p{L}/u`, marca `hasLetterWord=true`; se essa palavra casar `/\p{Ll}/u` (tem minúscula) → retorna `false`. No fim retorna `hasLetterWord`.
  - Objetivo: pegar `THE BLEND EDP CARDAMOM 100ml` (true) mas NÃO `Creme de Corpo Eudora - 400ml` (false, "Creme"/"de" têm minúscula).

### `src/utils/nfe.js`
- No `map` de itens (após `descricao`), adicionar `nomeSugerido: titleCasePtBr(descricao)`. A `descricao` crua permanece intacta (fidelidade ao XML no registro da NF).
- `require` do `titleCasePtBr` no topo do arquivo.

### `src/public/notas.html`
- No preview (input `criar-nome-<idx>`, hoje `value="${esc(item.descricao)}"`), passar a usar `value="${esc(item.nomeSugerido || item.descricao)}"`, para o lojista já ver o nome formatado (e poder ajustar). A linha `item-desc` (descrição literal da nota) continua exibindo `item.descricao` cru.

### `src/controllers/nfController.js`
- Na ação `criar` (INSERT products, hoje `String(d.novo.name || it.descricao).slice(0,200)`), envolver com `titleCasePtBr(...)`: `titleCasePtBr(String(d.novo.name || it.nomeSugerido || it.descricao)).slice(0,200)`.
  - Garante o padrão mesmo que o front envie o nome cru. `require` do `titleCasePtBr` no topo.
  - `nf_entrada_itens.descricao` continua gravando `it.descricao` cru (registro fiel da nota).

### `src/database/connection.js` — backfill one-shot
- Novo bloco guardado por flag `store_settings.skey = 'produtos_titlecase_backfill'` (mesmo padrão do `nf_origem_backfill` existente):
  ```
  const { titleCasePtBr, isShoutingName } = require('../utils/textcase');
  const [rows] = await conn.query('SELECT id, name FROM products');
  for (const r of rows) {
    if (isShoutingName(r.name)) {
      const novo = titleCasePtBr(r.name).slice(0,200);
      if (novo !== r.name) await conn.query('UPDATE products SET name=? WHERE id=?', [novo, r.id]);
    }
  }
  await conn.query("INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('produtos_titlecase_backfill','1')");
  ```
  Envolto em `try/catch (_) {}`, colocado antes de `conn.release()`. Roda uma vez na Teste (agora) e uma vez na produção no próximo deploy. Nomes já formatados não são tocados (`isShoutingName` false).

## Fluxo de dados

- **Importar NF:** parser gera `nomeSugerido` (title case) por item → preview mostra no campo editável → ao criar, `nfController` grava `titleCasePtBr(nome)` no produto; `nf_entrada_itens.descricao` guarda o texto cru da nota.
- **Correção única:** no boot, o backfill percorre `products`, normaliza só os "gritando", marca a flag.

## Erros / Compatibilidade

- Sem mudança de schema. `products.name` continua o mesmo tamanho; `.slice(0,200)` mantém o limite atual.
- Backfill é best-effort (`try/catch`), idempotente (flag) e conservador (só mexe em nomes 100% gritando).
- Produtos manualmente cadastrados com caixa mista não são afetados.

## Testes

- **`textcase` (unit, `node:test`):**
  - `titleCasePtBr`: os 5 exemplos da tabela; string vazia e `null` → `''`.
  - `isShoutingName`: `THE BLEND EDP CARDAMOM 100ml` e `QDB BAT EF MAT BERE 330 4,0g` → true; `Creme de Corpo Eudora - 400ml`, `Batom Una CC Violeta 62`, `Lapis Labial Una Rosa Pequeno` → false; `330 100` (sem letras) → false.
- **`nfe.js` (unit):** um XML NFe mínimo com um `det/prod/xProd = 'THE BLEND EDP CARDAMOM 100ml'` → `parseNfe` retorna item com `descricao` cru e `nomeSugerido = 'The Blend Edp Cardamom 100ml'`.
- **`nfController`/`notas.html`:** verificação de fiação (require do textcase + wrap do nome; preview usa `nomeSugerido`; parse do HTML).
- **Backfill:** rodar o boot na Teste e conferir com `SELECT` que os nomes gritando viraram title case e os já formatados ficaram intactos.
