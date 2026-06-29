const express = require('express');
const router = express.Router();
const { listProdutos, getProduto, listFranquias, entregaConfig } = require('../controllers/storeController');
router.get('/entrega/config', entregaConfig);
router.get('/produtos',     listProdutos);
router.get('/produtos/:id', getProduto);
router.get('/franquias',    listFranquias);
module.exports = router;
