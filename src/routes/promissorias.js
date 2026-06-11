const express = require('express');
const router = express.Router();
const {
  createPromissoria, listPromissorias, listParcelas,
  updateParcelaStatus, deletePromissoria
} = require('../controllers/promissoriaController');

router.post('/', createPromissoria);
router.get('/', listPromissorias);
router.get('/:id/parcelas', listParcelas);
router.put('/:promissoriaId/parcelas/:parcelaId', updateParcelaStatus);
router.delete('/:id', deletePromissoria);

module.exports = router;
