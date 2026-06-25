const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/storeOrderController');

router.post('/checkout/resumo', customerAuth, c.resumo);
router.post('/pedidos', customerAuth, c.criarPedido);

module.exports = router;
