# Aba "Entregues" em Pedidos das Clientes

**Data:** 2026-08-08
**Branch:** Teste

## Problema

A aba **Pedidos** da tela Pedidos das Clientes acumula todos os pedidos, inclusive
os que já foram comprados, conferidos, virados venda e entregues à cliente. Com o
tempo ela vira uma lista longa em que os pedidos que ainda exigem ação ficam
misturados com os que já acabaram.

## Solução

Separar os pedidos já entregues numa aba nova, **Entregues**, derivando o estado
do status da venda gerada — sem passo novo na rotina do usuário. Ele continua
marcando a venda como Entregue em Listar Pedidos, como sempre fez, e o card
migra sozinho de aba.

## Decisões

1. **Marcação continua em Listar Pedidos.** Nenhum botão novo em Pedidos das
   Clientes. Uma marcação só, no lugar onde ela já acontece.
2. **Pedido parcial vai para Entregues, com aviso.** Se as vendas geradas estão
   entregues mas sobrou item que não veio, o card migra assim mesmo, exibindo
   `⚠ N item(ns) pendente(s)`. O item continua na aba Comprar — ela filtra por
   `demanda_itens.status`, não pelo pedido, então isso funciona sem alteração.
3. **`demanda_pedidos.status` fica intocado.** Ele descreve a chegada da
   mercadoria (aberto/parcial/concluido); "entregue" descreve a saída para a
   cliente. Misturar os dois quebraria a aba Comprar e o Relatório.
4. **Data real da entrega.** Coluna `orders.delivered_at` em vez de derivar de
   `created_at`, para a janela de 90 dias refletir a entrega e não a venda.

## Modelo de dados

Migração no padrão de `src/database/connection.js`:

```sql
ALTER TABLE orders ADD COLUMN delivered_at DATETIME NULL
```

Carimbo em `orderController.updateOrderStatus` — hoje o único ponto que altera
`orders.status` (linhas 185 e 201):

| Novo status | `delivered_at` |
|---|---|
| Entregue | `NOW()`, apenas se estiver nulo (não reescreve em remarcação) |
| Pendente | `NULL` |
| Cancelado | `NULL` |

Vendas entregues antes da migração ficam com `delivered_at` nulo. As consultas
usam `COALESCE(delivered_at, created_at)` em vez de inventar uma data.

## Backend

`GET /api/demanda` passa a fazer JOIN `demanda_itens.order_id` → `orders` e a
devolver, por pedido:

- **`entregue`** — verdadeiro quando o pedido tem ao menos uma venda ligada **e**
  todas as vendas ligadas estão com status `Entregue`. Venda cancelada não conta
  como entregue, então cancelar devolve o card para Pedidos.
- **`itens_pendentes`** — contagem de itens com `order_id IS NULL`.
- **`entregue_em`** — `MAX(COALESCE(o.delivered_at, o.created_at))` das vendas do
  pedido. Serve para ordenar e para a janela de 90 dias.

Parâmetros de query:

| Chamada | Retorno |
|---|---|
| `GET /api/demanda` | pedidos não entregues, sem janela de data |
| `GET /api/demanda?entregues=1` | entregues com `entregue_em` nos últimos 90 dias |
| `GET /api/demanda?entregues=1&q=maria` | entregues da cliente buscada, **sem** janela de data |

A busca ignora a janela de propósito: filtrar por data anularia a busca
justamente nos casos em que ela é usada — achar um pedido antigo.

## Frontend (`src/public/demanda.html`)

Quarta aba entre Pedidos e Comprar:

```
Pedidos | Entregues | Comprar | Relatório
```

- **Pedidos** — comportamento atual, listando apenas os não entregues. O botão
  "Gerar todas as vendas" permanece.
- **Entregues** — mesmos cards, mais: campo "Buscar por cliente…" (vazio = últimos
  90 dias), selo `⚠ N item pendente` quando houver, data da entrega no card, e
  ordenação da entrega mais recente para a mais antiga. Mantém **Abrir** e
  **Excluir**.

Segue o que o arquivo já faz: `show(tab)` ganha `'entregues'`, `carregarEntregues()`
espelha `carregarCompra()`, e a montagem do card sai para uma função compartilhada
em vez de duplicar HTML entre as duas abas.

## Testes

`test/demanda-entregues.test.js`, no molde de `demanda-venda.test.js`:

- pedido sem venda gerada → aba Pedidos
- pedido com venda Pendente → aba Pedidos
- pedido com todas as vendas Entregue → aba Entregues
- pedido com duas vendas, uma Entregue e outra Pendente → aba Pedidos
- pedido entregue com item sem venda → aba Entregues, `itens_pendentes = 1`
- venda Entregue e depois Cancelada → volta para Pedidos
- marcar Entregue grava `delivered_at`; voltar para Pendente limpa
- busca por nome encontra entrega de 120 dias atrás; sem busca, ela não aparece

## Fora de escopo

`demanda_pedidos.status`, aba Comprar, Relatório, e a tela Listar Pedidos além do
carimbo de `delivered_at`.
