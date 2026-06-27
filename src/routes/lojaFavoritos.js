const express = require('express');
const router = express.Router();
const customerAuth = require('../middleware/customerAuth');
const c = require('../controllers/storeFavoritesController');

router.get('/ids', customerAuth, c.ids);
router.get('/', customerAuth, c.listar);
router.post('/', customerAuth, c.adicionar);
router.delete('/:productId', customerAuth, c.remover);

module.exports = router;
