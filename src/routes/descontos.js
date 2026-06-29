const express = require('express');
const router = express.Router();
const c = require('../controllers/descontosController');
router.get('/', c.get);
router.put('/', c.put);
module.exports = router;
