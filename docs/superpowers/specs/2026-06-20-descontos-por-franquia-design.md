# Descontos por Franquia — Design

**Data:** 2026-06-20
**Branch:** Teste

## Problema

Os percentuais de desconto por franquia (que convertem o valor de venda no custo) hoje não existem em lugar nenhum — foram aplicados como um `UPDATE` único e direto no banco. Quando uma franquia muda seu percentual, não há como recalcular os custos de forma confiável, porque o `cost` já está descontado e o valor de venda original foi sobrescrito.

## Objetivo

Permitir que o usuário edite o percentual de desconto de cada franquia numa tela, e que essa alteração recalcule automaticamente o custo de todos os produtos daquela franquia.

## Decisões tomadas

- **Abordagem A** — valor de venda armazenado como base; custo derivado.
- **Tela de edição** — seção colapsável na página de Estoque.
- **Campo Custo** — sempre calculado (somente leitura). Sem override manual.
- **`promotion_price`** — fica como está, não recebe tratamento de desconto.
- **Reconstrução do valor de venda** — revertendo o desconto de hoje (`cost ÷ (1 − %/100)`); diferença de ~1 centavo em alguns casos é aceitável.

## Modelo de dados

### Tabela `products` (alteração)
Nova coluna:
```sql
ALTER TABLE products ADD COLUMN sale_value DECIMAL(10,2) DEFAULT NULL;
```
- `sale_value` = valor de venda (a base que o usuário digita).
- `cost` continua existindo e é a fonte que todo o resto do sistema lê (pedidos, estoque, relatórios). Passa a ser **derivado**: `cost = ROUND(sale_value × (1 − percent/100), 2)`.

### Tabela `franchise_discounts` (nova)
```sql
CREATE TABLE IF NOT EXISTS franchise_discounts (
  franchise VARCHAR(255) PRIMARY KEY,
  percent   DECIMAL(5,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

Seed inicial (via `INSERT IGNORE`, idempotente):
| franchise | percent |
|---|---|
| Boticário | 15 |
| Natura | 32 |
| Avon | 32 |
| Abelha Rainha | 20 |
| Eudora | 30 |
| Outros | 0 |

### Backfill do `sale_value` (uma vez, idempotente)
Após semear `franchise_discounts`, reconstrói o valor de venda dos produtos existentes:
```sql
UPDATE products p
LEFT JOIN franchise_discounts fd ON fd.franchise = p.franchise
SET p.sale_value = ROUND(p.cost / (1 - COALESCE(fd.percent, 0) / 100), 2)
WHERE p.sale_value IS NULL;
```
- O `WHERE sale_value IS NULL` garante que roda só uma vez; produtos novos já nascem com `sale_value` preenchido.
- Franquia sem percentual cadastrado → `COALESCE(fd.percent,0)` → `sale_value = cost`.

Todas as migrações ficam no startup de `src/database/connection.js`, junto das que já existem.

## Backend

### Endpoints novos (controller + rota)
- **`GET /api/franchise-discounts`** — retorna `[{ franchise, percent }]` ordenado por franquia.
- **`PUT /api/franchise-discounts/:franchise`** — body `{ percent }`. Em **transação**:
  1. Valida `percent` (número, `0 ≤ percent < 100`).
  2. `INSERT ... ON DUPLICATE KEY UPDATE percent = ?` na `franchise_discounts`.
  3. Recalcula o custo de todos os produtos da franquia:
     ```sql
     UPDATE products SET cost = ROUND(sale_value * (1 - ?/100), 2) WHERE franchise = ?
     ```
  4. Retorna `{ message, recalculados: affectedRows }`.

Rota registrada em novo arquivo `src/routes/franchiseDiscounts.js`, montado em `app.js` como `/api/franchise-discounts` com `auth` + `apiLimiter` (mesmo padrão das demais).

### `createProduct` (alteração)
- Payload passa a enviar `saleValue` no lugar de `cost`.
- O servidor busca o `percent` da franquia e calcula `cost = ROUND(saleValue × (1 − percent/100), 2)`.
- INSERT grava `sale_value` e `cost`.

### `updateProduct` (alteração)
- Payload envia `sale_value` no lugar de `cost`.
- Recalcula `cost` da mesma forma e grava ambos.

### `getProductById` / `searchProductByCode` (alteração)
- Passam a retornar também `sale_value`.

## Frontend

### Estoque (`src/public/estoque.html`)
Nova seção colapsável **"Descontos por Franquia"** (mesmo padrão visual do painel "Log Geral"):
- Botão no topo abre/fecha o painel.
- Lista cada franquia de `GET /api/franchise-discounts` com um campo numérico de % editável e botão **Salvar** por linha.
- Ao salvar, chama `PUT /api/franchise-discounts/:franchise` e exibe toast com `recalculados` (ex: "42 produtos recalculados").

### Produtos (`src/public/produtos.html`)
- Formulário de cadastro e modal de edição ganham o campo **"Valor de Venda"**.
- Ao digitar o valor de venda (ou trocar a franquia selecionada), o campo **Custo** (somente leitura) é preenchido automaticamente com `valor_venda × (1 − %)`, usando os percentuais carregados de `GET /api/franchise-discounts`.
- O front envia `saleValue`/`sale_value`; não envia mais `cost` (o servidor é a fonte de verdade do custo).
- Edição: `openEdit()` popula o campo Valor de Venda a partir de `sale_value` retornado pela API.

## Tratamento de erros / casos de borda

- `percent` fora de `[0, 100)` → 400.
- Franquia sem registro em `franchise_discounts` no cálculo → tratada como 0% (custo = valor de venda).
- Recálculo sempre em transação; rollback em erro.
- `sale_value` ausente/null num produto (não deveria ocorrer após backfill) → custo não é alterado pelo recálculo daquela linha (a fórmula com NULL resultaria em NULL; o backfill cobre todos os existentes, e produtos novos sempre gravam `sale_value`).

## Fora de escopo

- Desconto sobre `promotion_price`.
- Histórico de alterações de percentual.
- Override manual de custo por produto.
