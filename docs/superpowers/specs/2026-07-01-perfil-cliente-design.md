# Perfil do cliente (histórico + métricas) — Design

**Data:** 2026-07-01
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

Ao selecionar um cliente na página **Clientes**, mostrar um painel de perfil com dados cadastrais, métricas de compra (total de pedidos, total gasto, ticket médio, etc.) e produtos mais comprados — acima do histórico de pedidos que já existe.

## Decisões (aprovadas)

- Enriquece a página `clientes.html` (seletor + histórico já existentes); painel aparece ao escolher um cliente.
- **Total gasto / ticket médio excluem pedidos `Cancelado`** (dinheiro real). "Total de pedidos" conta todos.
- Só leitura — não altera nada no banco. Sem mudança de schema. Admin-only.

## Modelo de dados (existente)

- `clients`: id, name, email, email_verified, cpf, phone, birthdate, cep, address, house_number, neighborhood, city, created_at.
- `orders`: id, client_id, payment_method, total_cost, status, created_at, origin.
- `order_products`: order_id, product_id, quantity, sale_price. `products`: id, name.

## Arquitetura / Componentes

### Backend — `src/controllers/clientController.js`: `clientSummary(req, res)`
`GET /api/clients/:id/summary` (admin-only), somente leitura. Passos:
1. `id = parseInt(req.params.id, 10)`; inválido → 400.
2. `SELECT id, name, email, email_verified, cpf, phone, birthdate, cep, address, house_number, neighborhood, city, created_at FROM clients WHERE id = ?`; vazio → 404.
3. Totais: `SELECT COUNT(*) totalPedidos, MIN(created_at) primeiraCompra, MAX(created_at) ultimaCompra FROM orders WHERE client_id = ?`.
4. Financeiro (exclui cancelados): `SELECT COALESCE(SUM(total_cost),0) totalGasto, COUNT(*) validos FROM orders WHERE client_id = ? AND status <> 'Cancelado'`. `ticketMedio = validos > 0 ? totalGasto/validos : 0`.
5. Por status: `SELECT status, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY status`.
6. Por origem: `SELECT origin, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY origin`.
7. Pagamento preferido: `SELECT payment_method, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY payment_method ORDER BY n DESC LIMIT 1` → `pagamentoPreferido` (string ou null).
8. Top produtos (exclui cancelados): `SELECT op.product_id, p.name, SUM(op.quantity) qtd, SUM(op.quantity*op.sale_price) total FROM order_products op JOIN orders o ON o.id = op.order_id JOIN products p ON p.id = op.product_id WHERE o.client_id = ? AND o.status <> 'Cancelado' GROUP BY op.product_id, p.name ORDER BY qtd DESC LIMIT 5`.
9. Responde:
   ```json
   {
     "client": { ...campos do passo 2 },
     "stats": {
       "totalPedidos": <int>, "totalGasto": <number>, "ticketMedio": <number>,
       "primeiraCompra": <datetime|null>, "ultimaCompra": <datetime|null>,
       "porStatus": [ { "status": "Entregue", "n": 3 } ],
       "porOrigem": [ { "origin": "Site", "n": 2 } ],
       "pagamentoPreferido": "PIX"|null
     },
     "topProdutos": [ { "product_id": 1, "name": "...", "qtd": 5, "total": 120.0 } ]
   }
   ```
   Money (`totalGasto`, `ticketMedio`, `total`) convertidos com `Number(...)`. `catch` → 500.

Adicionar `clientSummary` ao `module.exports`.

### Rota — `src/routes/clients.js`
`router.get('/:id/summary', clientSummary);` (distinta de `GET /`, `DELETE /:id`; sem conflito). `/api/clients` já está atrás de `auth`.

### Frontend — `src/public/clientes.html`
- Novo contêiner `#client-profile` (escondido por padrão) acima da seção de pedidos.
- `loadClientOrders()` (chamada no `onchange` do dropdown) passa a também chamar `loadClientSummary(clientId)`. Sem cliente selecionado → esconde `#client-profile`.
- `loadClientSummary(id)`: `Auth.apiFetch('/api/clients/' + id + '/summary')`; monta o HTML do painel:
  - **Cabeçalho:** nome, "cliente desde {mês/ano de created_at}", selos: e-mail verificado (se `email_verified`), origem predominante (maior de `porOrigem`).
  - **Dados cadastrais:** e-mail, telefone, CPF, nascimento; endereço (CEP, rua nº, bairro, cidade).
  - **KPIs (cartões):** Total de pedidos · Total gasto (`fmt`) · Ticket médio (`fmt`) · Última compra (data) — com a primeira compra numa linha menor.
  - **Extras:** pedidos por status (chips), forma de pagamento preferida, Top 5 produtos (nome + qtd + total).
  - Tudo com `esc()` no texto e `fmt()` no dinheiro. Campos nulos exibem "—".
- O histórico de pedidos abaixo continua vindo de `/api/client-orders/:id` (inalterado).

## Erros

| Situação | Resposta |
|---|---|
| id inválido | 400 |
| cliente inexistente | 404 |
| erro de query | 500 |

## Testes (`node:test`, `db_pedidos_teste`)

Semeia dados próprios e limpa no fim:
- Cria cliente; 2 pedidos (1 `Entregue` total 100, 1 `Cancelado` total 50) com `order_products`; chama `clientSummary`.
- Assere: `totalPedidos = 2`; `totalGasto = 100` (exclui o cancelado); `ticketMedio = 100`; `topProdutos` só conta itens de pedido não-cancelado; `porStatus` tem Entregue e Cancelado.
- `clientSummary` com id inexistente → 404.
- Cleanup: apaga order_products, orders, cliente semeados.
