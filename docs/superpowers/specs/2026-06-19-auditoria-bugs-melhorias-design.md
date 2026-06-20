# Design: Auditoria, Bugs e Melhorias — Sistema de Pedidos
**Data:** 2026-06-19  
**Branch:** Teste  

---

## Contexto

Auditoria completa do projeto identificou bugs críticos, funcionalidades incompletas e oportunidades de melhoria visual/UX. O sistema está em uso real com dados de produção. As mudanças serão aplicadas apenas na branch `Teste` e só sobem para `main` mediante solicitação explícita do usuário.

---

## Fase A — Bugs Críticos e Funcionais

### A1 — Endpoint de registro protegido
- `POST /api/auth/register` está público; qualquer pessoa pode criar usuário admin.
- **Fix:** adicionar middleware `auth` + verificação de role `admin` na rota. Apenas um admin logado pode criar novos usuários.

### A2 — `apiFetch` retornando `undefined`
- Quando a sessão expira, `apiFetch` faz redirect e retorna `undefined`. Todas as páginas chamam `res.json()` sem checar, causando `TypeError`.
- **Fix:** `apiFetch` lança `SessionExpiredError` em vez de redirecionar diretamente. Os blocos `try/catch` já existentes em cada página capturam o erro, fazem o redirect e param a execução.

### A3 — Estoque não restaurado ao excluir pedido
- `deleteOrder` deleta o pedido sem devolver o estoque dos produtos.
- **Fix:** antes do DELETE, buscar produtos e quantidades do pedido; fazer UPDATE restoring estoque dentro da mesma transação. SweetAlert de confirmação avisa: "O estoque dos produtos será restaurado."

### A4 — Valor real da parcela de promissória
- `listPromissorias` não retorna `parc.valor`; frontend recalcula dividindo `prom.valor / prom.parcelas.length`, ignorando o valor real salvo.
- **Fix:** adicionar `parc.valor` na query SQL. Frontend usa o campo diretamente.

### A5 — `cost_price` null gera `R$ NaN`
- Em `clientes.html`, `cost_price` e `sale_price` podem ser `null`, quebrando o cálculo de subtotal.
- **Fix:** aplicar `|| 0` nos campos antes de multiplicar pela quantidade.

### A6 — Estado dos meses perdido ao excluir promissória
- `excluirPromissoria` chama `loadPromissorias()` sem passar o set de meses abertos, colapsando tudo.
- **Fix:** capturar `abertos` antes de excluir e passar para `loadPromissorias(abertos)`, igual ao fluxo de `alterarStatus`.

### A7 — Badge "Cancelado" e modal pós-ação
- Pedidos com status diferente de `Pendente`/`Entregue` exibem badge amarelo errado.
- Após `markDelivered`, o modal não fecha automaticamente.
- **Fix:** adicionar badge vermelho escuro para `Cancelado` em `pedidos.html` e `clientes.html`. Fechar modal antes de recarregar após `markDelivered`.

---

## Fase B — Funcionalidades Incompletas

### B1 — `promotion_price` do início ao fim
- **Backend:** `getProductById` e `searchProductByCode` retornam `promotion_price`. `updateProduct` inclui o campo no UPDATE (aceita `null`).
- **Produtos/Lista:** modal de edição ganha campo "Preço Promocional (opcional)". Na linha do produto, quando preenchido, exibe chip laranja com o valor.
- **Pedidos/Criar:** ao selecionar produto com `promotion_price`, o checkbox "Produto com valor promocional" preenche automaticamente o campo de valor com o preço promocional.

### B2 — Status "Cancelado" no fluxo de pedidos
- **Backend:** `updateOrderStatus` valida whitelist: `Pendente`, `Entregue`, `Cancelado`.
- **Pedidos/Listar:** pill de filtro "Cancelado" adicionado. Badge: vermelho escuro (`#8b0000` tone) distinto do verde (Entregue) e amarelo (Pendente). Botão "Marcar como Entregue" oculto para pedidos cancelados.
- **Dashboard:** `topProductRows` filtra `o.status = 'Entregue'`, excluindo cancelados do ranking.
- **Clientes:** badge de status do pedido usa a mesma lógica dos três estados.

---

## Fase C — Visual e UX

### C1 — Dashboard: linha da tabela abre pedido específico
- Clicar em linha de "Últimos Pedidos" abre modal de detalhes do pedido, não redireciona para lista.
- Replicar o modal de detalhes de `pedidos.html` no `index.html` com lógica equivalente.

### C2 — XSS: escaping consistente em todas as páginas
- Criar função `esc()` (já existe em `produtos.html`) e aplicá-la em `index.html`, `clientes.html`, `pedidos.html` e `estoque.html` em todos os pontos de `innerHTML` com dados do banco.

### C3 — Footer com ano dinâmico
- Substituir `&copy; 2025` por `&copy; <span id="footer-year"></span>` + JS: `document.getElementById('footer-year').textContent = new Date().getFullYear()` em todas as páginas.

### C4 — Arredondamento de parcelas
- Em `getOrderParcelas`, calcular parcelas normalmente e ajustar a última para absorver diferença de centavos, garantindo soma exata.

### C5 — Dados pessoais em `geo.js`
- Mover endereço (`HOME_ADDRESS`) e email (`HOME_EMAIL`) para variáveis de ambiente no `.env`. Atualizar `geo.js` para ler `process.env.HOME_ADDRESS` e `process.env.HOME_EMAIL`.

---

## Restrições

- Toda alteração vai apenas para `origin/Teste`. Merge para `main` somente mediante solicitação explícita.
- Não alterar estrutura do banco de dados (sem migrations destrutivas).
- Manter compatibilidade com dados já existentes.
