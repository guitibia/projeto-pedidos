# Painel — Repaginação da tela Notas (NF-e) — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste. Só frontend: `src/public/notas.html`.
**Objetivo:** deixar a tela Notas mais bonita e mais fácil de operar (para o lançamento), SEM mudar backend/API nem o contrato de importação.

## Restrições (não quebrar)
- Backend/API inalterados. O fluxo continua: `POST /api/nf/preview` (multipart, campo `xml`, via `fetch` direto com `Authorization`, NÃO Auth.apiFetch) → prévia → `POST /api/nf/importar` (multipart: mesmo arquivo + `decisoes` JSON). `GET /api/nf` histórico, `GET /api/nf/:id` detalhe, `GET /api/products/all` para o select.
- **Contrato do `decisoes` preservado:** `{ [cprod]: { acao:'vincular'|'criar'|'ignorar', product_id?, novo?:{name,franchise,sale_value,code} } }`. A montagem em `importarNota` lê, por item idx: `#acao-${idx}` (hidden, valor da ação), `#prod-select-${idx}`, `#criar-nome/codigo/franquia/preco-${idx}`. **Manter esses ids e a leitura** (a UI pode mudar o visual, mas os ids/estado que a importação lê continuam existindo).
- Tema do painel (dark/claro via `/js/theme.js`, tokens `--card-bg`/`--border-color`/`--text-muted`/`--hover-tint`, Bootstrap, SweetAlert). Sem novo estilo; reaproveitar `.card-section`, `.acao-pill`, `page-hero-*`, `esc`, `fmt`.

## Melhorias (todas)

### 1. Upload como dropzone
Trocar o input cru por uma **área de upload** (arrastar-e-soltar OU clicar) que:
- mostra ícone + "Arraste o XML aqui ou clique para selecionar";
- ao escolher/soltar, mostra o **nome do arquivo** selecionado;
- aceita só `.xml`; mantém um `<input type="file" id="nf-file" accept=".xml">` (escondido) — o `lerNota()`/`importarNota()` continuam lendo `#nf-file.files[0]`.

### 2. Barra de ações em massa (na prévia)
Acima da lista de itens, botões que operam sobre os controles por item existentes:
- **Aceitar sugestões** — para cada item com `sugestaoProductId`, seta ação = vincular e seleciona o produto sugerido (chama `selectAcao(idx,'vincular')` + set do `#prod-select-${idx}`).
- **Ignorar todos** — `selectAcao(idx,'ignorar')` em todos.
- **Criar os restantes** — nos itens SEM sugestão (ou ainda não vinculados), seta ação = criar.
Depois recalcula o resumo.

### 3. Item mais limpo (cards empilháveis)
Trocar a **tabela larga** por uma lista de **itens em cartão/linha**: descrição em destaque + código; qtd/val.unit/total à direita; e a **ação** (pills Vincular/Criar/Ignorar + o campo correspondente) abaixo. Empilha bem no celular (sem scroll horizontal). **Manter os ids** (`#acao-${idx}`, `#pills-${idx}`, `#extra-vincular-${idx}`, `#prod-select-${idx}`, `#extra-criar-${idx}`, `#criar-nome/codigo/franquia/preco-${idx}`) e as funções `selectAcao`/`onAcaoChange`.

### 4. Resumo antes de importar
Uma faixa (acima do botão Importar) que mostra, ao vivo (atualiza a cada mudança de ação/produto): **N vincular · N criar · N ignorar · +X un ao estoque** (X = soma das quantidades, arredondadas, de itens vincular+criar) · **total da nota**. Uma função `atualizarResumo()` chamada em `selectAcao`, nos botões de massa, e após `renderPrevia`.

### 5. Já importada + estados
- Se `jaImportada`: além do aviso, **desabilitar** o botão Importar (com texto tipo "Nota já importada").
- Botão **Importar** com estado de carregando ("Importando…", desabilitado) durante o `fetch` (e reabilita no fim/erro).
- **Ler nota** já tem loading; manter.
- Histórico: estados de carregando/vazio claros; manter o modal de detalhe.

### Polimento visual
Espaçamento consistente (ritmo 8px), tipografia (descrição do item em peso maior, rótulos em `--text-muted`), selo do fornecedor no topo da prévia, botões com `cursor:pointer` e estados hover, foco visível. Escapar todos os valores dinâmicos com `esc`. Acessibilidade: labels/aria nos controles principais; a dropzone acessível por teclado (clicável + input real).

## Fora de escopo
Backend/API; mudar o formato do `decisoes`; a página Estoque; criar produto fora do fluxo da nota.

## Testes
- Estático: `notas.html` 200; JS parseia; ids preservados (`acao-`, `prod-select-`, `criar-nome-`, `pills-`); dropzone presente; funções `atualizarResumo`/ações em massa presentes; `fetch('/api/nf/preview'`/`importar'` continuam via fetch direto com Authorization + FormData.
- Navegador (manual): subir um XML real → prévia bonita; "Aceitar sugestões" preenche os vínculos; resumo bate (N vincular/criar/ignorar); importar funciona e atualiza estoque; nota já importada desabilita o botão; layout ok no celular.

## Decomposição prevista (para o plano)
Uma única task: repaginar `src/public/notas.html` (dropzone + itens em cartão preservando ids + barra de ações em massa + resumo ao vivo + já-importada/loading + polimento), mantendo o contrato de `preview`/`importar`/`decisoes`.
