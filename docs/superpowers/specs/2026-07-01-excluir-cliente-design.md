# Botão "Excluir cliente" (bloqueia se tiver pedidos) — Design

**Data:** 2026-07-01
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

Permitir excluir um cliente cadastrado pelo painel — principalmente para remover cadastros de teste feitos no site — sem apagar histórico de vendas: só exclui clientes **sem pedidos**.

## Decisões (aprovadas)

- Cliente **com pedidos** → **não** exclui; responde 409 com aviso. Protege o histórico.
- Cliente **sem pedidos** → exclui o cliente e limpa os `favoritos` dele (dados soltos, sem valor histórico).
- UI: a página `clientes.html` é um **seletor** (dropdown) + pedidos do cliente — não uma tabela de linhas. Então o botão "Excluir cliente" age sobre o cliente **selecionado** no dropdown.
- `clients` é a tabela compartilhada painel/site. Sem mudança de schema. Admin-only.

## Arquitetura / Componentes

### Backend — `src/controllers/clientController.js`: `deleteClient(req, res)`
`DELETE /api/clients/:id`, transacional:
1. `id = parseInt(req.params.id, 10)`; inválido → 400.
2. `getConnection` + `beginTransaction`.
3. `SELECT id, name FROM clients WHERE id = ?`; se não existe → rollback + 404 "Cliente não encontrado.".
4. `SELECT COUNT(*) c FROM orders WHERE client_id = ?`; se `c > 0` → rollback + **409** `{ error: 'Este cliente tem N pedido(s) e não pode ser excluído.' }`.
5. `DELETE FROM favoritos WHERE client_id = ?`.
6. `DELETE FROM clients WHERE id = ?`.
7. commit → `{ ok: true, nome }`.
8. catch → rollback + 500 "Erro ao excluir o cliente."; `finally` libera a conexão.

Adicionar `deleteClient` ao `module.exports`.

### Rota — `src/routes/clients.js`
Adicionar `router.delete('/:id', deleteClient);` e importar `deleteClient`. A rota `/api/clients` já fica atrás de `auth` (app.js:67), então é admin-only.

### Frontend — `src/public/clientes.html`
- Na `controls-bar` (perto do dropdown `#clientSelect`), adicionar um botão **"Excluir cliente"** (vermelho, lixeira) chamando `excluirCliente()`.
- `excluirCliente()`:
  - `id = clientSelect.value`; se vazio → `Swal.fire('Selecione um cliente', 'Escolha um cliente no campo acima primeiro.', 'info')` e retorna.
  - `nome` = texto da option selecionada.
  - Confirmação SweetAlert destrutiva: *"Excluir o cliente {nome}? Os favoritos dele também serão removidos. Não dá pra desfazer."*
  - Ao confirmar: `Auth.apiFetch('/api/clients/' + id, { method:'DELETE' })`.
    - `res.ok` → `Swal` sucesso *"Cliente excluído."*; `loadClients()`; resetar `clientSelect.value=''` e chamar `loadClientOrders()` (limpa a área de pedidos).
    - `res.status === 409` → `Swal.fire('Não é possível excluir', data.error, 'warning')` (cliente permanece).
    - senão → `Swal.fire('Erro', data.error || 'Falha ao excluir.', 'error')`.

## Fluxo de dados

Selecionar cliente → "Excluir cliente" → confirm → `DELETE /api/clients/:id` → backend bloqueia (409) se houver pedidos, senão apaga favoritos + cliente em transação → UI mostra resultado e recarrega o dropdown.

## Erros

| Situação | Resposta |
|---|---|
| id inválido | 400 |
| cliente inexistente | 404 |
| cliente com pedidos | 409 (mensagem com a contagem) |
| erro na transação | 500 (rollback) |

## Testes (`node:test`, `db_pedidos_teste`)

Semeia dados próprios e limpa no fim:
- Cliente sem pedidos (+ 1 favorito) → `deleteClient` → 200 `{ok:true}`; `clients` e `favoritos` daquele id sumiram.
- Cliente com 1 pedido → `deleteClient` → 409; cliente permanece. (cleanup: apaga o pedido e o cliente).
- id inexistente → 404.
