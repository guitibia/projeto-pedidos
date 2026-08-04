# Conferência como checklist (pré-marcada pela NF) + separação/impressão — Design

**Data:** 2026-08-04
**Branch:** `Teste`. Feature-mãe "Pedidos das Clientes" (não publicada no VPS; roda local).

## Problema (feedback de uso real)

Quem usa é a mãe do usuário. O código do catálogo (ex.: Avon `196329`, `244986`) **não** é o que vem na NF
(código SAP). O fluxo de "casar/aprender código" que construímos é **tecnicamente correto mas confuso** pra
ela. Ela recebe a caixa fisicamente e sabe olhando o que veio. Precisamos de algo **simples e prático, com
ar profissional**: montar o pedido, conferir o que chegou, e gerar a separação/impressão.

## Decisão (confirmada com o usuário)

- A conferência vira um **checklist**: por item do pedido, **✓ Chegou tudo / ✗ Não veio** (e quantidade
  pra caso parcial). Sem código, sem seletor, sem casar nada.
- **Pré-marcação pela NF (semiautomático):** botão "Puxar da NF" — ela escolhe a NF importada e o sistema
  **pré-marca** os itens do pedido cujo **nome** parece com a descrição da NF (com a quantidade que veio);
  ela revisa e ajusta o resto na mão.
- **Separação/impressão:** botão que gera uma folha limpa por cliente com o que **chegou** (produto + qtd)
  pra separar/entregar, com o que **faltou** listado abaixo.
- A NF continua entrando só pra **estoque** (à parte). A tela de "ligar código" **sai**; o "aprende código"
  é **aposentado** no uso dela.

## Escopo

**Só front-end** (`src/public/demanda.html`), reaproveitando endpoints existentes:
`PUT /api/demanda/itens/:itemId/alocacao` (grava qtd recebida + status), `GET /api/nf` (lista NFs),
`GET /api/demanda/nf/:nfId/conferir` (itens da NF: cprod/descricao/quantidade), `GET /api/demanda/:id`
(pedido + itens). **Sem mudança de backend, sem migração.**

## Como fica (UI, no modal `abrirPedido`)

### 1. Checklist dos itens
Cada linha do pedido mostra: produto, quantidade pedida, **status** (badge: veio / parcial / faltou), e os
controles:
- Botão **"✓ Chegou"** → grava `qtd_recebida = qtd_pedida` (via `alocacao`) → vira "veio".
- Botão **"✗ Não veio"** → grava `qtd_recebida = 0` → vira "faltou/pendente".
- Um campo pequeno de **quantidade** (pra caso parcial) — editar grava aquele valor.
No topo do modal, um resumo: **"Vieram X · Parcial Y · Faltaram Z"** (atualiza a cada marcação).
(Substitui o input "Rec." cru + a coluna de status atual por controles claros de checklist.)

### 2. "Puxar da NF" (pré-marca por nome)
Botão **"Puxar da NF"** (substitui o atual "Conferir com a NF" de ligar código):
- Abre um seletor das NFs importadas (`GET /api/nf`).
- Ao escolher, busca os itens da NF (`GET /api/demanda/nf/:nfId/conferir`) e, para cada item do pedido
  ainda não "veio", acha o item da NF com **nome mais parecido** (mesma função de similaridade por tokens
  que já existe: normaliza, ignora acento, compara tokens ≥3, prefixo). Se achar (score ≥ 1),
  **pré-marca** aquele item (grava `qtd_recebida = min(qtd_pedida, qtd da NF)` via `alocacao`).
- Recarrega o checklist: os pré-marcados aparecem como "veio/parcial"; ela revisa e ajusta na mão os que
  ficaram errados/desmarcados. Nada é "casado por código".

### 3. "Imprimir separação"
Botão **"Imprimir separação"**:
- Abre uma janela/impressão limpa (client-side, `window.print()` num HTML formatado) com o cabeçalho
  (cliente + data), a lista do que **chegou** (produto + quantidade) e, embaixo, o que **faltou**.
- Só client-side; sem endpoint novo.

### Remoções
- As funções de ligar código por seletor (`renderConferenciaPedido` com `<select>` de cProd, `ligarNoPedido`
  e o uso de `POST /api/demanda/conciliar-manual`) saem — o "Puxar da NF" passa a ser só a pré-marcação por
  nome. O botão vira "Puxar da NF".

## Tratamento de erros / validação
- `alocacao` já valida (não recebe mais do que foi pedido; 404 se item não existe). Marcações persistem uma
  a uma (como hoje). Sem NF escolhida → não pré-marca nada. Dado no DOM via `esc()`/sanitização já usada.
- Impressão: se não houver itens "vieram", imprime a folha com "nenhum item recebido ainda" + a lista de faltou.

## Testes
- Sem testes automatizados de UI (padrão do projeto). Smoke manual: abrir pedido → marcar ✓/✗ e ver o
  resumo e o status mudarem; "Puxar da NF" pré-marcar os de nome parecido; "Imprimir separação" abrir a
  folha com o que veio/faltou. Os endpoints reusados já têm testes (não mudam).

## Fora de escopo (possível futuro)
- Catálogo pessoal / autocompletar produto na criação do pedido (deixaria os nomes consistentes e melhoraria
  a pré-marcação) — fica pra uma próxima.
- Remover do backend os endpoints de "conciliar-manual"/vínculos (ficam no código, só sem uso na UI).
- Gerar venda/estoque a partir da separação (o "Gerar venda do que veio" atual permanece).
