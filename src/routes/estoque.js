const express = require('express');
const router  = express.Router();
const { listEstoque, movimentar, historico, logGeral } = require('../controllers/estoqueController');
router.get('/',                  listEstoque);
router.get('/log',               logGeral);
router.post('/:id/movimentacao', movimentar);
router.get('/:id/historico',     historico);

module.exports = router;
