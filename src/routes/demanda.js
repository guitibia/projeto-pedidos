const express = require('express');
const router = express.Router();
const c = require('../controllers/demandaController');

// rotas fixas ANTES de /:id para não serem capturadas pelo parâmetro
router.get('/fornecedores', c.listarFornecedores);

router.post('/', c.criarPedido);
router.get('/', c.listarPedidos);
router.post('/:id/itens', c.addItem);
router.get('/:id', c.getPedido);
router.put('/itens/:itemId', c.updateItem);
router.delete('/itens/:itemId', c.deleteItem);

module.exports = router;
