const express = require('express');
const router  = express.Router();
const { listEstoque, movimentar, historico } = require('../controllers/estoqueController');
router.get('/',                  listEstoque);
router.post('/:id/movimentacao', movimentar);
router.get('/:id/historico',     historico);

module.exports = router;
