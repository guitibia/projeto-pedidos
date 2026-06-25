const express = require('express');
const router = express.Router();
const c = require('../controllers/storeAuthController');

router.post('/register', c.register);
router.get('/verify', c.verify);
router.post('/resend', c.resend);

router.post('/login', c.login);

const customerAuth = require('../middleware/customerAuth');
router.get('/me',        customerAuth, c.me);
router.put('/me',        customerAuth, c.updateMe);
router.put('/password',  customerAuth, c.changePassword);
router.delete('/me',     customerAuth, c.deleteMe);

module.exports = router;
