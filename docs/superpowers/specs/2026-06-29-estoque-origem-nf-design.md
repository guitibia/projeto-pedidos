# Estoque — Origem (NF × Manual) nas movimentações + ação visual na nota — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.
**Sensível:** toca em estoque (movimentações). Migração não-destrutiva.

## Objetivo
Dois ajustes ligados à feature de NF-e:
1. **Organização (#1):** distinguir o estoque que entrou via **importação de NF** do que foi **movimentado manualmente**, marcando a **origem** de cada movimentação (NF/Manual) e permitindo ver/filtrar — **a quantidade do produto continua única/somada** ("flui junto").
2. **Visual (#2):** deixar a escolha de ação por item na prévia da nota (`notas.html`) mais bonita — trocar o `<select>` (Vincular/Criar/Ignorar) por **pills** (botões segmentados), no estilo das pills Entrada/Saída do estoque.

## Decisões (travadas na conversa)
- #1: **selo de origem + filtro**, sem duas contagens; quantidade segue somada junta.
- #2: **pills** (segmented) no lugar do select.

## Estado atual (relevante)
- `estoque_movimentacoes`: `product_id, tipo enum('Entrada','Saída'), quantidade INT, observacao, created_at`.
- `estoqueController.movimentar` grava a movimentação manual (`INSERT ... (product_id, tipo, quantidade, observacao)`).
- `nfController.importar` grava a entrada de NF com `observacao = 'NF '+numero` (e tem o `nfId` à mão).
- `estoqueController.logGeral` (`GET /api/estoque/log`) devolve `product_name, franchise, code, tipo, quantidade, observacao, created_at`; o `historico` por produto faz `SELECT *`.
- `estoque.html`: histórico por produto (modal, render ~l.582) e **log geral** (tabela, render ~l.622) com colunas Data/Produto/Franquia/Tipo/Qtd/Motivo; já existe o visual de **pills** (`.tipo-pill`) no modal de movimentação.
- `notas.html`: por item, um `<select>` de ação (vincular/criar/ignorar).

## #1 — Origem nas movimentações

### Banco (migração idempotente no connection.js)
- `ALTER TABLE estoque_movimentacoes ADD COLUMN origem ENUM('Manual','NF') NOT NULL DEFAULT 'Manual'` (try/catch).
- `ALTER TABLE estoque_movimentacoes ADD COLUMN nf_id INT NULL` (try/catch).
- **Backfill** (marca as entradas antigas de NF): `UPDATE estoque_movimentacoes SET origem='NF' WHERE observacao LIKE 'NF %'`. (Seguro re-rodar; após a 1ª vez é no-op.)

### Backend
- `estoqueController.movimentar`: incluir `origem = 'Manual'` no INSERT.
- `nfController.importar`: incluir `origem = 'NF'` e `nf_id = nfId` no INSERT da movimentação.
- `estoqueController.logGeral`: acrescentar `m.origem, m.nf_id` ao SELECT; aceitar filtro opcional `?origem=NF|Manual` (valida o valor; ignora se inválido).
- `historico` por produto já faz `SELECT *` → passa a retornar `origem`/`nf_id` automaticamente.

### Frontend (estoque.html)
- **Selo de origem** em cada linha do histórico (modal por produto **e** log geral): 📄 **NF** / ✋ **Manual** (badge no estilo dos `.fr-badge` existentes). Para origem NF com `nf_id`, o selo é um **link** para a nota (`/notas.html` — abrir o detalhe; mínimo: linkar para a página de Notas).
- **Filtro** no log geral: **Todos / NF / Manual** (recarrega `/api/estoque/log?origem=...`).
- Quantidade do produto inalterada — só a origem visível.

## #2 — Ação por item em "pills" (notas.html)
- Trocar, na prévia, o `<select>` de ação de cada item por **3 pills** (botões segmentados, reaproveitando o visual `.tipo-pill`): 🔗 **Vincular** · ✨ **Criar** · 🚫 **Ignorar**.
- Pill ativa controla o que aparece abaixo: **Vincular** → o seletor de produto (com a sugestão pré-selecionada); **Criar** → franquia + preço de venda (nome/código do XML); **Ignorar** → nada.
- A montagem do `decisoes` na importação continua igual (lê a ação ativa por item). Sem mudança de API.

## Erros / segurança
- Migração só **ADD COLUMN** (não-destrutiva) + backfill idempotente.
- `origem` validado no backend ('Manual'/'NF'); filtro inválido → ignora (retorna tudo).
- Importação de estoque continua transacional (já é); só adiciona 2 campos no INSERT.
- Valores dinâmicos escapados (esc) nas telas.

## Testes
- Importar NF → movimentação com `origem='NF'` + `nf_id` correto; movimentação manual → `origem='Manual'`.
- `GET /api/estoque/log` retorna `origem`/`nf_id`; `?origem=NF` filtra só NF; `?origem=Manual` só manual; valor inválido → tudo.
- Backfill: entradas antigas com observacao 'NF %' viram origem 'NF'.
- Navegador: selo aparece no modal por produto e no log; filtro funciona; nota: pills trocam o campo certo e a importação segue funcionando.

## Decomposição prevista (p/ o plano)
T1 banco (origem+nf_id+backfill) + backend (movimentar origem Manual; importar origem NF+nf_id; logGeral retorna+filtra origem). · T2 estoque.html (selo de origem no histórico+log; filtro no log). · T3 notas.html (pills no lugar do select de ação).
