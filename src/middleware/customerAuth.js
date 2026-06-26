const jwt = require('jsonwebtoken');

function customerAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado. Faça login.' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'customer') return res.status(403).json({ error: 'Token inválido.' });
    req.customer = { id: decoded.id, email: decoded.email };
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Sessão inválida ou expirada.' });
  }
}

module.exports = customerAuth;
