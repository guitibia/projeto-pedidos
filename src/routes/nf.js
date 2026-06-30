const express = require('express');
const router = express.Router();
const c = require('../controllers/nfController');
router.post('/preview', c.preview);
router.get('/', c.listar);
router.post('/importar', c.importar);
router.get('/:id', c.detalhe);
module.exports = router;
