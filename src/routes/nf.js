const express = require('express');
const router = express.Router();
const c = require('../controllers/nfController');
router.post('/preview', c.preview);
module.exports = router;
