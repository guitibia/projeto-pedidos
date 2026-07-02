# Estoque — Abas por origem (Geral / NF / Manual) — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.
**Sensível:** só LEITURA de estoque (não altera quantidade).

## Objetivo
Na aba Estoque, oferecer 3 visões por **origem** das entradas: **Geral** (como hoje), **NF** (produtos que receberam por Nota Fiscal), **Manual** (produtos que receberam manualmente). Nas visões NF/Manual, por produto: quanto **entrou** por aquela origem (exato) + uma **estimativa** do estoque atual daquela origem.

## Decisões (travadas na conversa)
- 3 abas: **Geral / NF / Manual**.
- Nas abas de origem, mostrar **as duas coisas**: "Entrou" (exato) + "Estoque atual (est.)" (estimativa), com legenda explicando.
- A quantidade real do produto continua única; NF/Manual são só uma visão de leitura.

## Fundamento (por que estimativa)
As **saídas (vendas)** saem do estoque único e **não carregam origem** — então o estoque ATUAL não pode ser dividido com exatidão por origem. O que é exato é o total de **entradas** por origem. Para o "estoque atual por origem" usamos uma **estimativa proporcional** às entradas; a estimativa Manual é o complemento da NF, de modo que **as duas somem o estoque atual real**.

## Backend
- `estoqueController.listEstoque`: acrescentar duas colunas ao SELECT (mesmo padrão do `totalEntradas`):
  - `entradasNF = IFNULL(SUM(CASE WHEN m.tipo='Entrada' AND m.origem='NF' THEN m.quantidade ELSE 0 END),0)`
  - `entradasManual = IFNULL(SUM(CASE WHEN m.tipo='Entrada' AND m.origem='Manual' THEN m.quantidade ELSE 0 END),0)`
- Nada mais muda (leitura). A estimativa é calculada no front.

## Frontend (estoque.html)
- **Abas** no topo do conteúdo (perto do resumo): botões **Geral / NF / Manual** (estilo consistente com a página). Estado `estoqueAba` ∈ {'geral','nf','manual'} (padrão 'geral').
- **render(items)** passa a considerar a aba:
  - **Geral**: todos os produtos, exatamente como hoje.
  - **NF**: filtra `items` para `entradasNF > 0`.
  - **Manual**: filtra `items` para `entradasManual > 0`.
- **Por produto**, cálculo no front:
  - `totalEnt = entradasNF + entradasManual`.
  - `estAtualNF = totalEnt > 0 ? Math.round(estoque * entradasNF / totalEnt) : 0`.
  - `estAtualManual = estoque - estAtualNF` (complemento → as duas estimativas somam o estoque atual).
- **Linha do produto nas abas NF/Manual** (além do que já mostra): 
  - **Entrou por [NF/Manual]: `entradas_origem` un** (exato).
  - **Estoque atual (est.): ~`estAtual_origem` un**.
  - Mantém o estoque atual geral do produto (referência) e os botões Movimentar/Histórico.
- **Legenda** curta nas abas de origem: *"'Entrou' é exato (soma das entradas). 'Atual (est.)' é estimativa — as vendas saem do estoque único."*
- Resumo/topo: nas abas NF/Manual, o resumo pode refletir só os produtos filtrados (contagem) — sem inventar métricas novas; manter simples.

## Erros / segurança
- Só leitura; não há mutação de estoque. Valores dinâmicos escapados (`esc`).
- Divisão por zero tratada (`totalEnt > 0`).
- Produto que recebeu das duas origens aparece nas duas abas (cada uma com a sua parte) — comportamento esperado.

## Testes
- Backend: `GET /api/estoque` retorna `entradasNF`/`entradasManual` corretos (após uma importação de NF + uma movimentação manual num produto).
- Front: aba Geral = como hoje; NF lista só `entradasNF>0`; Manual só `entradasManual>0`; por produto, `estAtualNF + estAtualManual = estoque`; "Entrou" bate com a soma das entradas daquela origem; legenda presente; alternar abas não recarrega errado.

## Decomposição prevista (p/ o plano)
T1 backend (`listEstoque` + entradasNF/entradasManual). · T2 frontend (`estoque.html`: abas Geral/NF/Manual + filtro + colunas Entrou/estimativa + legenda).
