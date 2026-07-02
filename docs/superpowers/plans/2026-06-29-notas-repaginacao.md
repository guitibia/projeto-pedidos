# Painel — Repaginação da tela Notas — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repaginar `notas.html` (upload em dropzone, itens em cartão, ações em massa, resumo ao vivo, estados) sem mudar backend nem o contrato de importação.

**Architecture:** Rewrite visual/UX de um único arquivo `src/public/notas.html`, preservando os ids e as funções que a importação lê (`#acao-${idx}`, `#prod-select-${idx}`, `#criar-*-${idx}`, `selectAcao`, `onAcaoChange`, o multipart de `preview`/`importar`).

**Tech Stack:** HTML/CSS/JS vanilla (Bootstrap, SweetAlert, tema `/js/theme.js`).

## Global Constraints

- Branch `Teste` — nunca commitar na `main`.
- **Backend/API inalterados.** `preview`/`importar` continuam via `fetch` DIRETO com header `Authorization: 'Bearer '+Auth.getToken()` e body `FormData` (NÃO Auth.apiFetch, que força Content-Type json e quebraria o multipart). Histórico/detalhe/products via os endpoints atuais.
- **Contrato `decisoes` preservado:** `{ [cprod]:{ acao:'vincular'|'criar'|'ignorar', product_id?, novo?{name,franchise,sale_value,code} } }`, montado em `importarNota` lendo, por item idx: `#acao-${idx}` (hidden), `#prod-select-${idx}`, `#criar-nome/codigo/franquia/preco-${idx}`. **Manter esses ids e essa leitura.**
- Tema do painel (tokens `--card-bg`/`--border-color`/`--text-muted`/`--hover-tint`); reusar `.card-section`, `.acao-pill`, `page-hero-*`, `esc`, `fmt`. Escapar valores dinâmicos com `esc`. `cursor:pointer` + hover + foco visível nos controles.
- Sem suíte automatizada — checagens estáticas (curl 200 + node parse/grep) + teste manual no navegador. Matar `node` após: `powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"`.

---

### Task 1: Repaginar `notas.html`

**Files:**
- Modify: `src/public/notas.html`

**Interfaces:**
- Consome/preserva: `lerNota()`, `renderPrevia(d)`, `selectAcao(idx,acao)`, `onAcaoChange(idx)`, `importarNota()`, `loadHistorico()`, os ids listados nas Global Constraints, e o fetch multipart de preview/importar.

- [ ] **Step 1: Dropzone de upload**

READ `notas.html` primeiro. Substituir o input cru (`#nf-file` + botão "Ler nota") por uma **dropzone**: uma área clicável/`role=button`/`tabindex=0` com ícone + texto "Arraste o XML aqui ou clique para selecionar", contendo um `<input type="file" id="nf-file" accept=".xml" hidden>`. Comportamentos:
- clicar na área (ou Enter/Espaço) abre o seletor (`#nf-file.click()`);
- `dragover` → destaca a área (classe); `drop` → pega `e.dataTransfer.files[0]`, valida `.xml`, e atribui ao `#nf-file` (via `DataTransfer`) OU guarda numa variável usada pelo `lerNota`/`importarNota`; mostra o **nome do arquivo** escolhido;
- `change` do input → idem (mostra o nome).
Manter o botão "Ler nota" chamando `lerNota()` (que lê `#nf-file.files[0]`). IMPORTANTE: garanta que, após o drop, `#nf-file.files[0]` exista (use `const dt = new DataTransfer(); dt.items.add(file); nfFile.files = dt.files;`) para o `lerNota`/`importarNota` continuarem funcionando sem mudar.

- [ ] **Step 2: Itens em cartão (preservando ids) + barra de ações em massa**

Em `renderPrevia`, trocar a **tabela larga** de itens por uma lista de **cartões/linhas** (empilha no mobile, sem scroll horizontal). Cada item mantém EXATAMENTE os mesmos ids e a estrutura de ação:
- `<input type="hidden" id="acao-${idx}" value="vincular">`
- pills `#pills-${idx}` com os 3 botões chamando `selectAcao(${idx},'vincular'|'criar'|'ignorar')`
- `#extra-vincular-${idx}` com `#prod-select-${idx}` (options de `allProducts`, pré-selecionando `sugestaoProductId`)
- `#extra-criar-${idx}` com `#criar-nome-${idx}`/`#criar-codigo-${idx}`/`#criar-franquia-${idx}`/`#criar-preco-${idx}`
Visual: descrição em destaque (peso 600) + código em `--text-muted`; qtd/val.unit/total à direita (use `fmt`); a ação abaixo. 
Acima da lista, uma **barra de ações em massa** com 3 botões:
- **Aceitar sugestões**: para cada idx com `previaData.itens[idx].sugestaoProductId`, `selectAcao(idx,'vincular')` e `document.getElementById('prod-select-'+idx).value = sugestaoProductId`.
- **Ignorar todos**: `selectAcao(idx,'ignorar')` em todos.
- **Criar os restantes**: nos itens sem `sugestaoProductId`, `selectAcao(idx,'criar')`.
Cada botão de massa chama `atualizarResumo()` ao final.

- [ ] **Step 3: Resumo ao vivo + já-importada + loading do importar**

- Adicionar um elemento de **resumo** acima do botão Importar e uma função `atualizarResumo()` que percorre os itens e conta por `#acao-${idx}.value`: **N vincular · N criar · N ignorar**, soma `+X un ao estoque` (X = Σ `Math.round(quantidade)` dos itens vincular+criar) e mostra o **valor total** da nota. Chamar `atualizarResumo()` no fim de `selectAcao`, nos botões de massa, no `change` do `#prod-select-${idx}` e ao fim de `renderPrevia`.
- **Já importada**: quando `d.jaImportada`, além do aviso, `#btn-importar.disabled = true` e texto tipo "Nota já importada"; quando não, garantir habilitado.
- **Importar**: no início de `importarNota`, desabilitar o botão e trocar o texto para "Importando…"; reabilitar/restaurar no `finally`/erro (o sucesso recarrega a prévia; ok).

- [ ] **Step 4: Polimento + histórico**

- Espaçamento consistente (múltiplos de 8px), tipografia (rótulos `--text-muted`, valores com peso), selo do fornecedor no topo da prévia (ícone + nome), estados de **carregando/vazio** do histórico claros (o modal de detalhe permanece). 
- Escapar todos os valores dinâmicos com `esc`. Dropzone e pills acessíveis por teclado; foco visível.
- Não alterar `loadHistorico`/`verNota`/os endpoints — só o visual dos estados se necessário.

- [ ] **Step 5: Verificar (estático)**

```bash
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"; node src/app.js & sleep 3
echo -n "notas 200: "; curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/notas.html
node -e "const h=require('fs').readFileSync('src/public/notas.html','utf8');
console.log('dropzone:', /drop|dragover|arraste/i.test(h));
console.log('ids preservados:', h.includes('acao-')&&h.includes('prod-select-')&&h.includes('criar-nome-')&&h.includes('pills-'));
console.log('acoes em massa:', /Aceitar sugest/i.test(h)&&/Ignorar todos/i.test(h));
console.log('resumo:', h.includes('atualizarResumo'));
console.log('multipart preservado:', h.includes(\"/api/nf/preview\")&&h.includes('FormData')&&h.includes(\"Bearer ' + Auth.getToken()\")||h.includes('Auth.getToken()'));
console.log('importar contrato (decisoes):', h.includes('decisoes')&&h.includes(\"getElementById('acao-'\"));
const s=h.match(/<script>(?:(?!<\\/script>)[\\s\\S])*<\\/script>/g).pop().replace(/<\\/?script>/g,''); new Function(s); console.log('JS parse OK');"
powershell -Command "Get-Process -Name node -ErrorAction SilentlyContinue | Stop-Process -Force"
```
Esperado: 200; dropzone/ids/ações-em-massa/resumo true; multipart preservado; decisoes lido por `#acao-`; JS parse OK.

- [ ] **Step 6: Teste no navegador (manual)**

`npm run dev` → Notas: dropzone (arrastar/clicar mostra o nome) → Ler nota → prévia bonita em cartões; "Aceitar sugestões" preenche os vínculos; resumo bate (vincular/criar/ignorar + un ao estoque + total); Importar mostra "Importando…" e atualiza o estoque; nota já importada desabilita o botão; layout ok em tela estreita.

- [ ] **Step 7: Commit**

```bash
git add src/public/notas.html
git commit -m "feat(nf): repaginação da tela Notas (dropzone, itens em cartão, ações em massa, resumo ao vivo)"
```
