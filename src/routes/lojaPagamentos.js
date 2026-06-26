const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/paymentController');

router.post('/', customerAuth, c.criarPagamento);
router.post('/webhook', c.webhook);          // público (MP) — valida via API
router.post('/pix', customerAuth, c.criarPix);
router.get('/:ref/pix', customerAuth, c.pixDados);
router.get('/:ref', customerAuth, c.statusPagamento);

module.exports = router;
