const express = require('express');
const router = express.Router();
const c = require('../controllers/demandaController');

// rotas fixas ANTES de /:id para não serem capturadas pelo parâmetro
router.get('/fornecedores', c.listarFornecedores);
router.get('/compra', c.listaCompra);
router.get('/relatorio', c.relatorio);
router.get('/nf/:nfId/conferir', c.conferirNf);
router.post('/conciliar-manual', c.conciliarManual);

router.post('/', c.criarPedido);
router.get('/', c.listarPedidos);
router.post('/:id/itens', c.addItem);
router.get('/:id', c.getPedido);
router.put('/itens/:itemId', c.updateItem);
router.delete('/itens/:itemId', c.deleteItem);
router.delete('/:id', c.excluirPedido);
router.get('/:id/rascunho-venda', c.rascunhoVenda);
router.put('/itens/:itemId/venda', c.marcarVenda);
router.put('/itens/:itemId/alocacao', c.remanejarAlocacao);

module.exports = router;
