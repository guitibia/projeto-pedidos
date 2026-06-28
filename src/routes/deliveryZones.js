const express = require('express');
const router = express.Router();
const c = require('../controllers/deliveryZonesController');

router.get('/', c.listar);
router.post('/', c.criar);
router.put('/settings', c.salvarSettings); // antes de /:id para não ser sombreado
router.put('/:id', c.atualizar);
router.delete('/:id', c.remover);

module.exports = router;
