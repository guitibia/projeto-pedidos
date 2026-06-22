# Venda Automática na Criação de Pedido — Design

**Data:** 2026-06-22
**Branch:** Teste

## Problema

Na criação de pedido, ao selecionar um produto o campo **Custo** já é preenchido automaticamente com o valor do banco (`cost`, já com o desconto da franquia), mas o campo **Venda** fica vazio e precisa ser digitado na mão. Como o valor de venda original (`sale_value`) já existe no banco, ele pode vir pronto.

## Objetivo

Preencher automaticamente o campo **Venda** com o `sale_value` do produto (valor original de cadastro) ao selecionar o produto, mantendo o campo editável.

## Decisões tomadas

- **Origem da Venda:** `sale_value` (valor de cadastro guardado no banco), não `cost + %`. Ex: Aerosol Man Masculino → Custo 33,92 / Venda 39,91.
- **Quando preencher:** somente quando o campo Venda estiver **vazio** — nunca sobrescreve um valor já digitado pelo usuário.
- **Editável:** a Venda continua editável; o usuário pode ajustar antes de adicionar à lista.
- **Sem mudança no backend:** `GET /api/products?franchise=` já retorna `sale_value` (usa `SELECT *`).

## Comportamento detalhado

### Seleção de produto (`#products` change)
- `#productCost` recebe `cost` (comportamento atual, inalterado).
- `#salePrice` recebe `sale_value` **apenas se estiver vazio**. Se o usuário já digitou algo, mantém.

### Checkbox "Produto com valor promocional (editar custo)"
- **Marcar:** comportamento atual mantido — o Custo fica editável; se o produto tiver `promotion_price`, a Venda recebe esse valor; foco no Custo para edição do custo promocional.
- **Desmarcar:** a Venda volta para o `sale_value` do produto selecionado (hoje ela é apenas limpa). Restaura o preço normal de venda em vez de deixar em branco.

### Adicionar produto à lista (`#addProductBtn`)
- Após adicionar, o `#salePrice` é limpo (comportamento atual). Isso garante que a próxima seleção de produto preencha a Venda corretamente, já que o campo volta a ficar vazio.

## Dados

Cada `<option>` de produto passa a carregar o atributo `data-sale-value="${p.sale_value}"`, ao lado dos já existentes `data-cost` e `data-promo-price`.

## Casos de borda

- **Produto sem `sale_value`** (não deve ocorrer após o backfill): a Venda não é preenchida (fica vazia e editável).
- **Trocar de produto sem adicionar o anterior:** como a Venda só preenche quando vazia, ela mantém o valor do produto anterior. Para carregar o valor do novo produto, basta apagar o campo. No fluxo normal (adicionar à lista limpa o campo), cada novo item já vem com o valor certo. Comportamento aceito.

## Fora de escopo

- Redesenho da lista de itens já adicionados (continua mostrando nome + total).
- Mudança na origem do Custo (continua vindo de `cost`).
- Qualquer alteração de backend.
