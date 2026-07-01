# Botão "Excluir NF" (com devolução de estoque) — Design

**Data:** 2026-07-01
**Branch:** Teste (não publicar em produção sem pedido explícito)

## Objetivo

Permitir excluir uma nota de entrada (NF-e) pelo painel, desfazendo automaticamente o estoque que ela somou — de forma transacional e segura — sem precisar mexer no banco na mão.

## Decisões (aprovadas)

- Excluir NF **devolve o estoque** que a nota somou; produtos continuam cadastrados; memória de vínculos fornecedor→produto (`nf_item_vinculos`) é mantida.
- **Produtos criados pela nota ficam** — o schema não marca "produto criado pela NF X", então não dá pra identificá-los com segurança; apagar seria arriscado. Fora do escopo (YAGNI).
- **Estoque já vendido:** devolução com clamp em 0 (`GREATEST(0, estoque - qtd)`), nunca deixa negativo. O resultado informa se parte já havia sido movimentada.
- Sem mudança de schema.

## Arquitetura / Componentes

### Backend — `src/controllers/nfController.js`: nova função `remover(req, res)`
`DELETE /api/nf/:id` (admin-only, mesma proteção das outras rotas de NF). Transacional, replicando o procedimento já validado manualmente:

1. `id = parseInt(req.params.id, 10)`; se inválido → 400.
2. Abrir transação. `SELECT id FROM nf_entradas WHERE id=?`; se não existe → rollback + 404.
3. Calcular devolução por produto:
   `SELECT product_id, SUM(quantidade) q FROM estoque_movimentacoes WHERE origem='NF' AND nf_id=? AND product_id IS NOT NULL GROUP BY product_id`.
4. Para cada linha: ler estoque atual (`SELECT estoque FROM products WHERE id=?`); se `estoque < q`, marcar `algumJaMovimentado = true`; `UPDATE products SET estoque = GREATEST(0, estoque - ?) WHERE id=?`.
5. `DELETE FROM estoque_movimentacoes WHERE origem='NF' AND nf_id=?`.
6. `DELETE FROM nf_entrada_itens WHERE nf_id=?`.
7. `DELETE FROM nf_entradas WHERE id=?`.
8. commit. Resposta `{ ok:true, produtosAfetados: ret.length, unidadesDevolvidas: <soma q>, algumJaMovimentado }`.
9. Em erro: rollback + 500. `finally` libera a conexão.

`nf_item_vinculos` **não** é tocada (memória cross-NF; produtos continuam existindo).

### Rota — `src/routes/nf.js`
Adicionar `router.delete('/:id', c.remover);` (depois de `get('/:id')`; métodos diferentes, sem conflito).

### Frontend — `src/public/notas.html`
- **Lista de notas:** na coluna de ações (hoje só "Ver"), adicionar um botão **"Excluir"** vermelho por linha, chamando `excluirNota(nf.id)`.
- **Modal de detalhe** (`verNota`): botão "Excluir esta nota" no rodapé, também chamando `excluirNota(id)` (e fechando o modal ao concluir).
- `excluirNota(id)`:
  - Confirmação SweetAlert (destrutiva, ícone warning): *"Excluir esta nota? As quantidades desta NF serão devolvidas ao estoque. Os produtos e os vínculos continuam. Não dá pra desfazer."* Botões "Sim, excluir" / "Cancelar".
  - Ao confirmar: `Auth.apiFetch('/api/nf/' + id, { method:'DELETE' })`.
  - Sucesso: toast/Swal de sucesso — *"NF excluída. Devolvidas {unidadesDevolvidas} un. a {produtosAfetados} produtos."*; se `algumJaMovimentado`, acrescenta *"(parte do estoque já havia sido movimentada)"*. Recarrega o histórico (`carregarHistorico()`), fecha o modal se aberto.
  - Erro: Swal de erro com a mensagem do backend.

## Fluxo de dados

Clicar "Excluir" → confirm → `DELETE /api/nf/:id` → backend devolve estoque + apaga movimentações/itens/nota em transação → retorna resumo → UI mostra sucesso e recarrega a lista.

## Erros

| Situação | Resposta |
|---|---|
| id inválido | 400 |
| NF inexistente | 404 "Nota não encontrada." |
| Erro na transação | 500 "Erro ao excluir a nota." (rollback) |

## Testes (`node:test`, DB `db_pedidos_teste`)

Teste de integração que **semeia** dados próprios e limpa no fim:
- Cria um produto temporário com `estoque=10`; cria uma `nf_entradas` temporária; um `nf_entrada_itens`; uma `estoque_movimentacoes` origem='NF' com `nf_id` da nota, `quantidade=4`, `product_id` do produto.
- Chama `remover({ params:{ id } }, mockRes)`.
- Assere: resposta `ok`, `produtosAfetados=1`, `unidadesDevolvidas=4`; produto passou a `estoque=6`; `nf_entradas`/`nf_entrada_itens`/movimentações da nota sumiram.
- Caso clamp: produto `estoque=2`, nf soma `4` → após excluir `estoque=0` e `algumJaMovimentado=true`.
- `remover` com id inexistente → 404.
- Cleanup: apaga o produto temporário e quaisquer linhas remanescentes que criar.
