const express = require('express');
const router = express.Router();
const { login, register } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

router.post('/login', login);
router.post('/register', authMiddleware, (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem criar usuários.' });
  }
  next();
}, register);

module.exports = router;
