# Auditoria e Melhorias — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir todos os bugs críticos/funcionais, completar funcionalidades incompletas e melhorar UX/visual do sistema de pedidos.

**Architecture:** Node.js/Express + MySQL no backend; HTML/Bootstrap 5 + SweetAlert2 no frontend; JWT em localStorage. Cada task é independente e commitável separadamente.

**Tech Stack:** Node.js, Express, mysql2/promise, Bootstrap 5, Bootstrap Icons, SweetAlert2, JWT (jsonwebtoken), bcryptjs

## Global Constraints

- Branch `Teste` apenas — nunca `git push origin main`
- Sem migrations destrutivas; manter compatibilidade com dados existentes
- Padrão de erro da API: `{ error: 'mensagem' }`; sucesso: `{ message: 'mensagem' }`
- Commitar ao final de cada task

---

## Mapa de arquivos

| Arquivo | Tasks que tocam |
|---------|----------------|
| `src/routes/auth.js` | T1 |
| `src/controllers/authController.js` | T1 |
| `src/controllers/orderController.js` | T3, T6, T10 |
| `src/controllers/productController.js` | T7 |
| `src/controllers/promissoriaController.js` | T4 |
| `src/controllers/dashboardController.js` | T6 |
| `src/utils/geo.js` | T10 |
| `.env` | T10 |
| `src/public/js/auth.js` | T2 |
| `src/public/index.html` | T8, T9, T10 |
| `src/public/clientes.html` | T5, T6, T9, T10 |
| `src/public/pedidos.html` | T3, T6, T7, T9, T10 |
| `src/public/produtos.html` | T7, T10 |
| `src/public/promissorias.html` | T4, T10 |
| `src/public/estoque.html` | T9, T10 |

---

## Task 1: Proteger endpoint de registro (A1)

**Files:**
- Modify: `src/routes/auth.js`
- Modify: `src/controllers/authController.js`

**Interfaces:**
- `authMiddleware` em `src/middleware/auth.js` já existe: verifica JWT Bearer e popula `req.user = { id, username, role }`

- [ ] **Passo 1: Adicionar authMiddleware + verificação de role na rota register**

Abrir `src/routes/auth.js` e substituir pelo seguinte:

```js
const express = require('express');
const router  = express.Router();
const { login, register } = require('../controllers/authController');
const authMiddleware       = require('../middleware/auth');

router.post('/login', login);
router.post('/register', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem criar usuários.' });
  }
  next();
}, register);

module.exports = router;
```

- [ ] **Passo 2: Verificar manualmente**

Iniciar o servidor (`npm start` na pasta raiz do projeto).

Tentar criar usuário sem token:
```
POST http://localhost:3000/api/auth/register
Body: { "username": "teste", "password": "123" }
```
Resultado esperado: `401 { "error": "Acesso negado. Token não fornecido." }`

Tentar com token de usuário não-admin: resultado esperado `403`.

Tentar com token de admin: resultado esperado `201 { "message": "Usuário criado com sucesso." }`.

- [ ] **Passo 3: Commit**

```bash
git add src/routes/auth.js
git commit -m "fix(auth): protege /api/auth/register com authMiddleware + role admin"
```

---

## Task 2: Corrigir apiFetch retornando undefined (A2)

**Files:**
- Modify: `src/public/js/auth.js`

**Interfaces:**
- Produz: `apiFetch` lança `Error` com `name = 'SessionExpiredError'` em vez de retornar `undefined`
- Consome: todos os HTMLs que chamam `Auth.apiFetch` — o comportamento externo não muda pois já usam try/catch; sessões expiradas continuam redirecionando para login

- [ ] **Passo 1: Atualizar apiFetch em `src/public/js/auth.js`**

Substituir o bloco de verificação 401/403 (linhas 48-52):

```js
// Trecho atual (remover):
if (res.status === 401 || res.status === 403) {
  clearSession();
  window.location.href = '/login.html';
  return;
}

// Substituir por:
if (res.status === 401 || res.status === 403) {
  clearSession();
  window.location.href = '/login.html';
  const err = new Error('Sessão expirada');
  err.name = 'SessionExpiredError';
  throw err;
}
```

- [ ] **Passo 2: Verificar**

Em qualquer página do sistema, abrir o console do navegador, limpar o token:
```js
localStorage.removeItem('sp_token');
```
Chamar `Auth.apiFetch('/api/clients')` no console.

Resultado esperado: navegador redireciona para `/login.html` e o console mostra o erro `SessionExpiredError` em vez de `TypeError: Cannot read properties of undefined`.

- [ ] **Passo 3: Commit**

```bash
git add src/public/js/auth.js
git commit -m "fix(auth): apiFetch lança SessionExpiredError em vez de retornar undefined"
```

---

## Task 3: Restaurar estoque ao excluir pedido (A3)

**Files:**
- Modify: `src/controllers/orderController.js` (função `deleteOrder`, linhas 181-193)
- Modify: `src/public/pedidos.html` (função `excluirPedido` / SweetAlert de confirmação)

**Interfaces:**
- Consome: tabela `order_products` com colunas `product_id`, `quantity`, `not_came`
- Produz: estoque restaurado em `products.estoque` antes de deletar o pedido

- [ ] **Passo 1: Atualizar `deleteOrder` em `src/controllers/orderController.js`**

Substituir a função `deleteOrder` (linhas 181-193) pelo seguinte:

```js
// DELETE /api/orders/:id
async function deleteOrder(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Busca produtos do pedido para restaurar estoque
    const [produtos] = await conn.query(
      'SELECT product_id, quantity, not_came FROM order_products WHERE order_id = ?',
      [id]
    );

    // Restaura estoque apenas dos produtos que efetivamente vieram
    for (const p of produtos) {
      if (!p.not_came) {
        await conn.query(
          'UPDATE products SET estoque = estoque + ? WHERE id = ?',
          [p.quantity, p.product_id]
        );
      }
    }

    const [result] = await conn.query('DELETE FROM orders WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    await conn.commit();
    return res.json({ message: 'Pedido excluído e estoque restaurado com sucesso!' });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao excluir pedido:', err);
    return res.status(500).json({ error: 'Erro ao excluir pedido.' });
  } finally {
    conn.release();
  }
}
```

- [ ] **Passo 2: Atualizar SweetAlert de confirmação em `src/public/pedidos.html`**

Localizar a função que chama `excluirPedido` (ou o botão de excluir pedido) e atualizar o texto da confirmação. Buscar por `Excluir pedido` no arquivo. Substituir o texto do confirm para:

```js
title: 'Excluir pedido?',
text: 'O estoque dos produtos será restaurado automaticamente.',
```

- [ ] **Passo 3: Verificar**

No sistema, criar um pedido com 2 unidades de um produto. Anotar o estoque atual daquele produto. Excluir o pedido. Verificar em Estoque que as 2 unidades voltaram.

- [ ] **Passo 4: Commit**

```bash
git add src/controllers/orderController.js src/public/pedidos.html
git commit -m "fix(orders): restaura estoque dos produtos ao excluir pedido"
```

---

## Task 4: Valor real da parcela de promissória + estado preservado ao excluir (A4 + A6)

**Files:**
- Modify: `src/controllers/promissoriaController.js` (função `listPromissorias`)
- Modify: `src/public/promissorias.html` (mapeamento de parcelas + `excluirPromissoria`)

**Interfaces:**
- `listPromissorias` passará a retornar `parcelas[].valor` além de `numero`, `status`, `data_vencimento`

- [ ] **Passo 1: Adicionar `parc.valor` na query de `listPromissorias`**

Em `src/controllers/promissoriaController.js`, substituir a query SELECT (linhas 49-54):

```js
const [rows] = await db.query(`
  SELECT p.*, nf.numero AS numero_nf, nf.fornecedor, nf.data_emissao,
         parc.numero_parcela, parc.status AS parcela_status,
         parc.data_vencimento AS parcela_vencimento,
         parc.valor AS parcela_valor
  FROM promissorias p
  JOIN notas_fiscais nf ON nf.id = p.nota_fiscal_id
  LEFT JOIN parcelas parc ON parc.promissoria_id = p.id
  ORDER BY p.id, parc.numero_parcela
`);
```

E no bloco `reduce`, adicionar `valor: row.parcela_valor` ao push de parcelas:

```js
prom.parcelas.push({
  numero:          row.numero_parcela,
  status:          row.parcela_status,
  data_vencimento: row.parcela_vencimento,
  valor:           parseFloat(row.parcela_valor || 0)
});
```

- [ ] **Passo 2: Usar `parc.valor` no frontend em vez de recalcular**

Em `src/public/promissorias.html`, localizar o bloco onde as parcelas são mapeadas (próximo da linha 449-458). Substituir:

```js
// Remover este campo:
valor: prom.valor / prom.parcelas.length,

// Substituir por:
valor: parc.valor,
```

O bloco completo do forEach fica assim:
```js
prom.parcelas.forEach((parc, i) => {
  todasParcelas.push({
    promId:     prom.id,
    fornecedor: prom.fornecedor,
    numParcela: parc.numero,
    valor:      parc.valor,
    status:     parc.status,
    vencimento: parc.data_vencimento
  });
});
```

- [ ] **Passo 3: Preservar estado de meses ao excluir**

Em `src/public/promissorias.html`, localizar a função `excluirPromissoria` e adicionar captura dos meses abertos antes de excluir:

```js
async function excluirPromissoria(id) {
  const { isConfirmed } = await Swal.fire({
    title: 'Excluir promissória?', icon: 'warning',
    showCancelButton: true, confirmButtonColor: '#dc3545',
    confirmButtonText: 'Excluir', cancelButtonText: 'Cancelar'
  });
  if (!isConfirmed) return;

  // Preserva quais meses estão abertos
  const abertos = new Set(
    Array.from(document.querySelectorAll('.mes-body.aberto')).map(el => el.id)
  );

  const res = await Auth.apiFetch(`/api/promissorias/${id}`, { method: 'DELETE' });
  if (res.ok) {
    Swal.fire({ icon: 'success', title: 'Excluído!', timer: 1200, showConfirmButton: false });
    loadPromissorias(abertos);
  } else {
    Swal.fire('Erro', 'Não foi possível excluir.', 'error');
  }
}
```

- [ ] **Passo 4: Verificar**

Abrir uma seção de promissórias, expandir um mês. Marcar uma parcela como paga e confirmar que o mês permanece aberto. Excluir uma promissória e confirmar que os meses que estavam abertos continuam abertos.

- [ ] **Passo 5: Commit**

```bash
git add src/controllers/promissoriaController.js src/public/promissorias.html
git commit -m "fix(promissorias): usa valor real da parcela do banco; preserva meses abertos ao excluir"
```

---

## Task 5: Corrigir R$ NaN em detalhes de pedido no cliente (A5)

**Files:**
- Modify: `src/public/clientes.html` (renderização de produtos do pedido)

- [ ] **Passo 1: Localizar e corrigir multiplicações com `cost_price` e `sale_price`**

Em `src/public/clientes.html`, buscar por `cost_price` e `sale_price`. Em cada ocorrência onde há multiplicação por `quantity`, adicionar `|| 0`:

```js
// Antes:
(p.cost_price * p.quantity)
(p.sale_price * p.quantity)

// Depois:
((parseFloat(p.cost_price) || 0) * p.quantity)
((parseFloat(p.sale_price) || 0) * p.quantity)
```

Aplicar o mesmo padrão em qualquer uso de `p.cost_price` e `p.sale_price` isolados (sem multiplicação) adicionando `|| 0`.

- [ ] **Passo 2: Verificar**

Abrir a página de Clientes, selecionar um cliente que tenha pedido com algum produto sem custo definido. Confirmar que os valores aparecem como `R$ 0,00` em vez de `R$ NaN`.

- [ ] **Passo 3: Commit**

```bash
git add src/public/clientes.html
git commit -m "fix(clientes): evita R$ NaN quando cost_price ou sale_price é null"
```

---

## Task 6: Status Cancelado completo (A7 + B2)

**Files:**
- Modify: `src/controllers/orderController.js` (função `updateOrderStatus`)
- Modify: `src/controllers/dashboardController.js` (query `topProductRows`)
- Modify: `src/public/pedidos.html` (badges, filtro, modal)
- Modify: `src/public/clientes.html` (badge de status)

**Interfaces:**
- Status válidos: `['Pendente', 'Entregue', 'Cancelado']`
- Badge visual: Pendente = amarelo (`#d29922`), Entregue = verde (`#3fb950`), Cancelado = vermelho (`#f85149`)

- [ ] **Passo 1: Adicionar whitelist em `updateOrderStatus`**

Em `src/controllers/orderController.js`, substituir a função `updateOrderStatus` (linhas 162-178):

```js
async function updateOrderStatus(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { status } = req.body;
  const statusValidos = ['Pendente', 'Entregue', 'Cancelado'];
  if (!status || !statusValidos.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${statusValidos.join(', ')}.` });
  }

  try {
    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    return res.json({ message: 'Status atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
}
```

- [ ] **Passo 2: Filtrar cancelados no top produtos do dashboard**

Em `src/controllers/dashboardController.js`, adicionar `WHERE o.status = 'Entregue'` na query `topProductRows` (linhas 18-25):

```js
const [topProductRows] = await db.query(`
  SELECT p.name AS nome, SUM(op.quantity) AS total
  FROM order_products op
  JOIN products p ON op.product_id = p.id
  JOIN orders o ON o.id = op.order_id
  WHERE o.status = 'Entregue'
  GROUP BY op.product_id
  ORDER BY total DESC
  LIMIT 3
`);
```

- [ ] **Passo 3: Criar função `badgeStatus` reutilizável em `pedidos.html`**

Em `src/public/pedidos.html`, adicionar após os consts iniciais:

```js
function badgeStatus(status) {
  if (status === 'Entregue')  return `<span class="badge" style="background:rgba(63,185,80,.15);color:#3fb950;border:1px solid rgba(63,185,80,.3);font-size:.72rem"><i class="bi bi-check-circle me-1"></i>${status}</span>`;
  if (status === 'Cancelado') return `<span class="badge" style="background:rgba(248,81,73,.12);color:#f85149;border:1px solid rgba(248,81,73,.3);font-size:.72rem"><i class="bi bi-x-circle me-1"></i>${status}</span>`;
  return `<span class="badge" style="background:rgba(210,153,34,.12);color:#d29922;border:1px solid rgba(210,153,34,.3);font-size:.72rem"><i class="bi bi-hourglass-split me-1"></i>${status}</span>`;
}
```

- [ ] **Passo 4: Usar `badgeStatus` em todos os pontos de `pedidos.html` que renderizam status**

Buscar por trechos que produzem badge de status (geralmente `o.status === 'Entregue' ? ... : ...`) e substituir por `badgeStatus(o.status)`.

- [ ] **Passo 5: Adicionar pill "Cancelado" no filtro de `pedidos.html`**

Localizar os pills de filtro de status (`Todos`, `Pendente`, `Entregue`) e adicionar:

```html
<button class="filter-pill" data-status="Cancelado" onclick="setFilter(this)">
  <i class="bi bi-x-circle"></i> Cancelado
</button>
```

Garantir que a função `setFilter` / `loadOrders` passe `status=Cancelado` na query quando o filtro ativo for `Cancelado`.

- [ ] **Passo 6: Ocultar botão "Marcar como Entregue" para pedidos cancelados, e fechar modal após ação**

Em `pedidos.html`, no bloco de renderização do modal de detalhes do pedido, condicionar o botão:

```js
// Botão "Marcar como Entregue" só aparece se não estiver entregue nem cancelado
${order.status !== 'Entregue' && order.status !== 'Cancelado'
  ? `<button id="btn-mark-delivered" ...>Marcar como Entregue</button>`
  : ''}
```

Na função `markDelivered`, fechar o modal antes de recarregar:

```js
async function markDelivered(orderId) {
  const res = await Auth.apiFetch(`/api/orders/${orderId}/status`, {
    method: 'PUT', body: JSON.stringify({ status: 'Entregue' })
  });
  if (!res.ok) return Swal.fire('Erro', 'Não foi possível atualizar.', 'error');
  // Fechar modal primeiro
  bootstrap.Modal.getInstance(document.getElementById('orderDetailsModal'))?.hide();
  Swal.fire({ icon: 'success', title: 'Pedido entregue!', timer: 1500, showConfirmButton: false });
  loadOrders();
}
```

- [ ] **Passo 7: Adicionar `badgeStatus` equivalente em `clientes.html`**

Em `src/public/clientes.html`, localizar onde o status do pedido é renderizado e aplicar a mesma lógica de três estados (Pendente / Entregue / Cancelado) com as mesmas cores.

- [ ] **Passo 8: Verificar**

- Criar pedido e cancelar via API (temporariamente): confirmar badge vermelho
- Confirmar que pedido cancelado não aparece no top 3 do dashboard
- Confirmar que "Marcar como Entregue" some para cancelados
- Confirmar que modal fecha automaticamente após marcar entregue

- [ ] **Passo 9: Commit**

```bash
git add src/controllers/orderController.js src/controllers/dashboardController.js \
        src/public/pedidos.html src/public/clientes.html
git commit -m "feat(orders): status Cancelado com badge, filtro, validação e fix dashboard top-produtos"
```

---

## Task 7: promotion_price do início ao fim (B1)

**Files:**
- Modify: `src/controllers/productController.js` (funções `getProductById`, `searchProductByCode`, `updateProduct`)
- Modify: `src/public/produtos.html` (modal de edição + chip na lista)
- Modify: `src/public/pedidos.html` (auto-fill no checkbox)

**Interfaces:**
- `getProductById` e `searchProductByCode` passam a retornar `promotion_price` (número ou `null`)
- `updateProduct` aceita `promotion_price` no body (opcional, `null` apaga)

- [ ] **Passo 1: Atualizar `getProductById`**

Em `src/controllers/productController.js`, linha 83:

```js
// Antes:
return res.json({ id: p.id, name: p.name, cost: p.cost, franchise: p.franchise, code: p.code });

// Depois:
return res.json({ id: p.id, name: p.name, cost: p.cost, franchise: p.franchise, code: p.code, promotion_price: p.promotion_price ?? null });
```

- [ ] **Passo 2: Atualizar `searchProductByCode`**

Linha 66:
```js
// Antes:
return res.json({ id: p.id, name: p.name, cost: p.cost, code: p.code });

// Depois:
return res.json({ id: p.id, name: p.name, cost: p.cost, code: p.code, promotion_price: p.promotion_price ?? null });
```

- [ ] **Passo 3: Atualizar `updateProduct` para aceitar `promotion_price`**

```js
async function updateProduct(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { name, cost, franchise, code, promotion_price } = req.body;
  if (!name || cost == null || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }

  const promoVal = promotion_price != null && promotion_price !== ''
    ? parseFloat(promotion_price)
    : null;

  try {
    const [result] = await db.query(
      'UPDATE products SET name=?, cost=?, franchise=?, code=?, promotion_price=? WHERE id=?',
      [name, parseFloat(cost), franchise, code, promoVal, id]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json({ message: 'Produto atualizado com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar produto.' });
  }
}
```

- [ ] **Passo 4: Adicionar campo no modal de edição de `produtos.html`**

No modal `#editModal`, dentro do `<form id="edit-form">`, após o campo de custo (`#edit-cost`), adicionar:

```html
<div class="mb-4">
  <label class="form-label">Preço Promocional (R$) <span style="opacity:.5;font-weight:400">(opcional)</span></label>
  <input type="number" step="0.01" min="0" class="form-control" id="edit-promotion-price" placeholder="Deixe vazio para remover">
</div>
```

- [ ] **Passo 5: Preencher o campo ao abrir o modal**

Na função `openEdit(id)` de `produtos.html`, após preencher os outros campos:

```js
document.getElementById('edit-promotion-price').value = p.promotion_price ?? '';
```

- [ ] **Passo 6: Enviar `promotion_price` no submit do modal de edição**

No submit do `#edit-form`, incluir no payload:

```js
const promoRaw = document.getElementById('edit-promotion-price').value;
const payload = {
  name:            document.getElementById('edit-name').value.trim(),
  cost:            parseFloat(document.getElementById('edit-cost').value),
  franchise:       document.getElementById('edit-franchise').value,
  code:            document.getElementById('edit-code').value.trim(),
  promotion_price: promoRaw !== '' ? parseFloat(promoRaw) : null
};
```

- [ ] **Passo 7: Chip laranja na linha do produto em `produtos.html`**

No template de cada produto na lista (dentro de `renderProducts`), após o bloco `prod-valor`, adicionar condicionalmente:

```js
${p.promotion_price ? `<span style="font-size:.7rem;background:rgba(255,154,0,.12);border:1px solid rgba(255,154,0,.3);color:#ff9a00;border-radius:6px;padding:.1rem .45rem;font-weight:600;white-space:nowrap"><i class="bi bi-tag-fill"></i> ${fmt(p.promotion_price)}</span>` : ''}
```

- [ ] **Passo 8: Auto-fill em `pedidos.html` ao marcar checkbox promocional**

Em `src/public/pedidos.html`, localizar o listener do checkbox "Produto com valor promocional" e atualizar para usar `promotion_price` do produto selecionado:

```js
// Quando o checkbox promocional é marcado/desmarcado:
checkboxPromo.addEventListener('change', () => {
  const opt = franchiseProductSelect.options[franchiseProductSelect.selectedIndex];
  const promoPrice = opt?.dataset?.promoPrice;
  if (checkboxPromo.checked && promoPrice) {
    saleValueInput.value = promoPrice;
    saleValueInput.readOnly = false;
  } else {
    saleValueInput.value = '';
    saleValueInput.readOnly = false;
  }
});
```

Garantir que o `<option>` de cada produto inclua `data-promo-price="${p.promotion_price || ''}"` ao ser renderizado.

- [ ] **Passo 9: Verificar**

- Editar produto, salvar com preço promocional — chip laranja aparece na lista
- Editar produto, limpar preço promocional — chip desaparece
- Em Pedidos, selecionar produto com promo e marcar checkbox — campo de valor preenche com preço promocional

- [ ] **Passo 10: Commit**

```bash
git add src/controllers/productController.js src/public/produtos.html src/public/pedidos.html
git commit -m "feat(products): promotion_price editável, exibido na lista e usado em pedidos"
```

---

## Task 8: Dashboard — linha de pedido abre modal de detalhes (C1)

**Files:**
- Modify: `src/public/index.html`

**Interfaces:**
- Consome: `GET /api/orders/:id` — retorna objeto de pedido com `client_name`, `products[]`, `payment_method`, `total_cost`, `status`, `delivery_fee`

- [ ] **Passo 1: Adicionar modal de detalhes no `index.html`**

Antes do `<footer>` em `src/public/index.html`, adicionar um modal Bootstrap simples (sem parcelas, apenas visão geral):

```html
<div class="modal fade" id="dashOrderModal" tabindex="-1">
  <div class="modal-dialog modal-lg">
    <div class="modal-content">
      <div class="modal-header" style="background:linear-gradient(135deg,#1f6feb,#388bfd);color:#fff">
        <h5 class="modal-title"><i class="bi bi-bag-check me-2"></i>Detalhes do Pedido</h5>
        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
      </div>
      <div class="modal-body p-4" id="dash-order-body">
        <div class="text-center py-3" style="color:var(--text-muted)">Carregando...</div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Passo 2: Adicionar função `viewDashOrder(id)` no script de `index.html`**

```js
const dashOrderModal = new bootstrap.Modal(document.getElementById('dashOrderModal'));

async function viewDashOrder(id) {
  document.getElementById('dash-order-body').innerHTML =
    '<div class="text-center py-3" style="color:var(--text-muted)">Carregando...</div>';
  dashOrderModal.show();
  try {
    const res  = await Auth.apiFetch(`/api/orders/${id}`);
    const order = await res.json();
    const fmt = v => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    document.getElementById('dash-order-body').innerHTML = `
      <div style="margin-bottom:1rem">
        <strong>${order.client_name}</strong>
        <span style="margin-left:.75rem;font-size:.8rem;color:var(--text-muted)">${order.payment_method}</span>
      </div>
      <table class="table table-sm" style="font-size:.85rem">
        <thead><tr><th>Produto</th><th>Qtd</th><th>Valor</th></tr></thead>
        <tbody>
          ${order.products.map(p => `<tr>
            <td>${p.product_name}</td>
            <td>${p.quantity}</td>
            <td>${fmt(p.sale_price * p.quantity)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div style="text-align:right;font-size:.9rem">
        ${order.delivery_fee > 0 ? `<div style="color:var(--text-muted)">Taxa de entrega: ${fmt(order.delivery_fee)}</div>` : ''}
        <strong>Total: ${fmt(order.total_cost)}</strong>
      </div>`;
  } catch {
    document.getElementById('dash-order-body').innerHTML =
      '<div class="text-center py-3" style="color:#f85149">Erro ao carregar pedido.</div>';
  }
}
```

- [ ] **Passo 3: Conectar clique da linha ao modal**

Localizar o trecho que renderiza as linhas da tabela de "Últimos Pedidos" no `index.html`. Substituir `onclick="window.location='/pedidos.html#listar'"` na linha por `onclick="viewDashOrder(${p.id})" style="cursor:pointer"`.

- [ ] **Passo 4: Verificar**

Abrir o dashboard. Clicar em uma linha da tabela de Últimos Pedidos. Confirmar que abre o modal com os dados do pedido correto em vez de redirecionar para a lista.

- [ ] **Passo 5: Commit**

```bash
git add src/public/index.html
git commit -m "feat(dashboard): clicar em pedido abre modal de detalhes em vez de redirecionar"
```

---

## Task 9: XSS — escaping consistente em todas as páginas (C2)

**Files:**
- Modify: `src/public/index.html`
- Modify: `src/public/clientes.html`
- Modify: `src/public/pedidos.html`
- Modify: `src/public/estoque.html`

**Interfaces:**
- Função `esc(v)` já existe em `produtos.html`. Será copiada para cada página.

- [ ] **Passo 1: Adicionar função `esc` em cada página**

Para cada uma das 4 páginas acima, adicionar no bloco `<script>` logo após os consts iniciais:

```js
function esc(v) {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
```

- [ ] **Passo 2: Aplicar `esc()` em `index.html`**

Localizar os pontos de `innerHTML` com dados variáveis e aplicar `esc()`:
- `p.client_name` → `esc(p.client_name)`
- `p.payment_method` → `esc(p.payment_method)`
- `p.status` → `esc(p.status)`
- `a.name` (alertas de estoque) → `esc(a.name)`
- `a.franchise` → `esc(a.franchise)`
- `p.fornecedor` (promissórias) → `esc(p.fornecedor)`

- [ ] **Passo 3: Aplicar `esc()` em `clientes.html`**

- `o.payment_method` → `esc(o.payment_method)`
- `o.client_name` → `esc(o.client_name)`
- `order.client_address` → `esc(order.client_address)`
- `order.client_house_number` → `esc(order.client_house_number)`
- `order.client_neighborhood` → `esc(order.client_neighborhood)`
- `order.client_name` → `esc(order.client_name)`
- `p.product_name` (no modal de detalhes) → `esc(p.product_name)`

- [ ] **Passo 4: Aplicar `esc()` em `pedidos.html`**

- `o.client_name` → `esc(o.client_name)`
- `o.payment_method` → `esc(o.payment_method)`
- `p.product_name` → `esc(p.product_name)`
- `p.code` → `esc(p.code)`
- Em `printOrder`: wrapping de `order.client_name`, `order.client_address`, `p.product_name` com `esc()` antes de inserir no `document.write`

- [ ] **Passo 5: Aplicar `esc()` em `estoque.html`**

- `p.name.replace(/'/g,"\\'")` nos `onclick` → substituir por passagem segura via `data-id` em vez de interpolação inline:

```js
// Antes:
onclick="abrirMov(${p.id},'${p.name.replace(/'/g,"\\'")}')

// Depois (adicionar data-attributes no botão e usar event listener):
data-id="${p.id}" data-nome="${esc(p.name)}" onclick="abrirMovBtn(this)"
```

E adicionar a função:
```js
function abrirMovBtn(btn) {
  abrirMov(parseInt(btn.dataset.id), btn.dataset.nome);
}
```

Fazer o mesmo para `abrirHist`.

- [ ] **Passo 6: Verificar**

Criar um cliente com nome `<b>Teste</b>`. Navegar para o dashboard e páginas de clientes/pedidos. Confirmar que o nome aparece como texto literal `<b>Teste</b>` sem renderizar HTML.

- [ ] **Passo 7: Commit**

```bash
git add src/public/index.html src/public/clientes.html src/public/pedidos.html src/public/estoque.html
git commit -m "fix(security): aplica esc() em todos os pontos de innerHTML com dados do banco"
```

---

## Task 10: Footer dinâmico, arredondamento de parcelas e geo.js env vars (C3 + C4 + C5)

**Files:**
- Modify: todos os HTMLs com footer (`index.html`, `clientes.html`, `produtos.html`, `pedidos.html`, `estoque.html`, `promissorias.html`)
- Modify: `src/controllers/orderController.js` (função `getOrderParcelas`)
- Modify: `src/utils/geo.js`
- Modify: `.env`

- [ ] **Passo 1: Footer com ano dinâmico em todos os HTMLs**

Em cada página, substituir:
```html
<small>&copy; 2025 Sistema de Pedidos</small>
```
Por:
```html
<small>&copy; <span id="footer-year"></span> Sistema de Pedidos</small>
```

E no bloco `<script>` de cada página, adicionar logo após `Auth.requireAuth()`:
```js
document.getElementById('footer-year').textContent = new Date().getFullYear();
```

- [ ] **Passo 2: Corrigir arredondamento de parcelas em `getOrderParcelas`**

Em `src/controllers/orderController.js`, substituir o trecho de criação de parcelas (linhas 243-245):

```js
// Antes:
const valor = parseFloat((baseParcelado / order.installments).toFixed(2));
const rows = Array.from({ length: order.installments }, (_, i) => [id, i + 1, valor]);

// Depois:
const valorBase = parseFloat((baseParcelado / order.installments).toFixed(2));
const totalBase  = parseFloat((valorBase * order.installments).toFixed(2));
const diferenca  = parseFloat((baseParcelado - totalBase).toFixed(2));
const rows = Array.from({ length: order.installments }, (_, i) => {
  // Última parcela absorve a diferença de centavos
  const v = i === order.installments - 1
    ? parseFloat((valorBase + diferenca).toFixed(2))
    : valorBase;
  return [id, i + 1, v];
});
```

- [ ] **Passo 3: Mover dados pessoais de `geo.js` para `.env`**

Adicionar ao `.env`:
```
HOME_ADDRESS=Rua David Carvalho, 233, São João da Boa Vista, SP
HOME_EMAIL=seu-email@exemplo.com
```

Em `src/utils/geo.js`, substituir a linha 7:
```js
// Antes:
const HOME = { address: 'Rua David Carvalho, 233, São João da Boa Vista, SP', lat: null, lng: null };

// Depois:
const HOME = { address: process.env.HOME_ADDRESS || '', lat: null, lng: null };
```

E na linha 24 (User-Agent do nominatim):
```js
// Antes:
headers: { 'User-Agent': 'SistemaPedidos/1.0 (gui.14.2006@gmail.com)', ... }

// Depois:
headers: { 'User-Agent': `SistemaPedidos/1.0 (${process.env.HOME_EMAIL || 'admin'})`, ... }
```

- [ ] **Passo 4: Verificar**

- Abrir qualquer página: footer deve mostrar `© 2026 Sistema de Pedidos`
- Criar pedido com valor que não divide exatamente (ex: R$ 10,00 em 3×): confirmar que a soma das parcelas bate exatamente com R$ 10,00
- Reiniciar o servidor e confirmar que geo ainda funciona (endereço lido do .env)

- [ ] **Passo 5: Commit**

```bash
git add src/public/index.html src/public/clientes.html src/public/produtos.html \
        src/public/pedidos.html src/public/estoque.html src/public/promissorias.html \
        src/controllers/orderController.js src/utils/geo.js .env
git commit -m "fix: footer com ano dinâmico, arredondamento de parcelas, dados pessoais no .env"
```

---

## Checklist de verificação final

- [ ] `/api/auth/register` retorna 401 sem token
- [ ] Sessão expirada redireciona para login sem TypeError no console
- [ ] Excluir pedido restaura o estoque dos produtos
- [ ] Promissória exibe o valor real de cada parcela
- [ ] Detalhes de pedido em Clientes nunca exibe `R$ NaN`
- [ ] Pedidos cancelados têm badge vermelho e não contam no dashboard
- [ ] Produto com `promotion_price` mostra chip laranja e auto-preenche em pedidos
- [ ] Clicar em pedido no dashboard abre modal de detalhes
- [ ] Nomes com HTML (ex: `<b>teste</b>`) aparecem como texto literal em todas as páginas
- [ ] Footer mostra o ano atual (2026) em todas as páginas
- [ ] Soma das parcelas bate exatamente com o total do pedido
