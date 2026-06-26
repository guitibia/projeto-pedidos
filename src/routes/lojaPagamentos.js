const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/paymentController');

router.post('/', customerAuth, c.criarPagamento);
// /webhook e /:ref entram na Task 5

module.exports = router;
