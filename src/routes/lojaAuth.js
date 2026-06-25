const express = require('express');
const router = express.Router();
const c = require('../controllers/storeAuthController');

router.post('/register', c.register);
router.get('/verify', c.verify);
router.post('/resend', c.resend);

module.exports = router;
