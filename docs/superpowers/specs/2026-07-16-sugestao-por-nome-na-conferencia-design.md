# Sugestão automática por nome na conferência da NF — Design

**Data:** 2026-07-16
**Branch:** `Teste`. Feature-mãe "Pedidos das Clientes + conciliação com a NF" ainda NÃO publicada.

## Problema

O código do catálogo que o usuário usa no pedido (ex.: Natura `160380`) NÃO está na NF (a NF só tem
`cProd` SAP, `cEAN` e a descrição). O usuário só tem o código do catálogo em mãos (sem EAN fácil). A
conciliação já "aprende" (liga uma vez pela descrição, memoriza por `cProd`, e casa sozinho nas próximas).
Para reduzir o esforço do **primeiro link**, o usuário quer que o sistema **sugira** o casamento comparando
o nome que ele pôs no pedido com a descrição da NF — ele só confirma.

## Decisão (confirmada com o usuário)

- Na tela de **conferência dentro do pedido**, para cada item do pedido que ainda não casou, **pré-selecionar**
  no seletor de itens da NF aquele cuja **descrição mais parece** com o nome do item do pedido (best-effort).
- É **sugestão**: o usuário confirma clicando "Ligar" (ou troca a seleção). Nada é ligado automaticamente.
- **Só front-end** (`src/public/demanda.html`), na função `renderConferenciaPedido` — os dois lados (itens do
  pedido com `nome`; itens da NF com `descricao`) já estão disponíveis ali. Sem mudança de backend.
- **NÃO** mexer na conciliação automática do backend (`aplicarConciliacao`): ela continua estrita
  (vínculo aprendido / código igual) pra não casar errado sozinha. O nome é só sugestão na tela manual.

## Como funciona (UI)

Em `renderConferenciaPedido(pedidoId, nfId)`:
- Calcular, para cada item do pedido ainda não `veio`, o item da NF com maior **semelhança de nome** entre
  `pedidoItem.nome` e `nfItem.descricao` (e, na falta de nome, ignora a sugestão).
- No `<select>` daquele item, deixar a opção do `cprod` sugerido **pré-selecionada** e marcada com um rótulo
  "(sugestão)". Se nenhuma passar do limiar mínimo, o seletor fica no placeholder (como hoje).
- O botão "Ligar" continua igual (usa o `cprod` selecionado). O usuário confirma ou troca antes de ligar.

## Algoritmo de semelhança (função pura no front)

```
normaliza(s): minúsculas, remove acentos, troca não-alfanumérico por espaço, colapsa espaços, trim.
tokens(s): normaliza e separa por espaço; mantém tokens com length >= 3 (ignora "de", "70", "ml" curtos).
score(nomePedido, descricaoNf):
  para cada token A de nomePedido, conta 1 se algum token B da descricaoNf satisfaz
  (A === B) OU (B começa com A) OU (A começa com B)   // pega abreviações/prefixos
  retorna a contagem.
sugestão do item do pedido = o item da NF com maior score, desde que score >= 1
  (empate: mantém a ordem da NF). Se todos score 0, sem sugestão.
```

Best-effort: acerta quando os nomes compartilham palavras (ex.: "óleo"→"oleo"); fica em branco quando não
há palavra em comum. Como é só sugestão confirmada pelo usuário, um palpite errado é inofensivo (ele troca).

## Tratamento de erros
- Item de pedido sem `nome` → sem sugestão (seletor no placeholder).
- NF sem itens → seletores vazios (como hoje).
- Nada muda no fluxo de "Ligar"/`conciliar-manual`.

## Testes
- Sem testes automatizados de UI (padrão do projeto). Smoke manual: abrir pedido → "Conferir com a NF" →
  os itens cujo nome parece com a descrição já vêm com a NF pré-selecionada e "(sugestão)"; confirmar liga;
  itens sem semelhança ficam em branco pra escolher na mão.
- (Opcional) a função pura de `score`/`tokens` pode virar um pequeno módulo testável se for extraída; nesta
  entrega fica inline no `demanda.html` (front), sem teste automatizado — coerente com o resto da tela.

## Fora de escopo
- Casar por nome automaticamente (sem confirmação) — decisão do usuário foi "sugere, eu confirmo".
- Autocompletar nome/fornecedor ao criar o pedido ("meu catálogo") — ideia registrada para o futuro
  (ver [[project-pedidos-clientes-conciliacao-nf]]).
- Casar por EAN / importar catálogo (usuário não tem o EAN acessível hoje).
