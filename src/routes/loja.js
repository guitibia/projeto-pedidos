const express = require('express');
const router = express.Router();
const { listProdutos, getProduto, listFranquias, entregaConfig, descontoGlobal } = require('../controllers/storeController');
router.get('/desconto-global', descontoGlobal);
router.get('/entrega/config', entregaConfig);
router.get('/produtos',     listProdutos);
router.get('/produtos/:id', getProduto);
router.get('/franquias',    listFranquias);
module.exports = router;
