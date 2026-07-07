const express = require('express');
const router = express.Router();
const { login, register, changePassword, listUsers, deleteUser } = require('../controllers/authController');
const authMiddleware = require('../middleware/auth');

function soAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores.' });
  }
  next();
}

router.post('/login', login);
router.post('/register', authMiddleware, soAdmin, register);
router.post('/change-password', authMiddleware, changePassword);
router.get('/users', authMiddleware, soAdmin, listUsers);
router.delete('/users/:id', authMiddleware, soAdmin, deleteUser);

module.exports = router;
