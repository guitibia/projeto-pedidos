const express = require('express');
const router = express.Router();
const { listProdutos, getProduto, listFranquias } = require('../controllers/storeController');
router.get('/produtos',     listProdutos);
router.get('/produtos/:id', getProduto);
router.get('/franquias',    listFranquias);
module.exports = router;
