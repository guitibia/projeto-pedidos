const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/paymentController');

router.post('/', customerAuth, c.criarPagamento);
router.post('/webhook', c.webhook);          // público (MP) — valida via API
router.get('/:ref', customerAuth, c.statusPagamento);

module.exports = router;
