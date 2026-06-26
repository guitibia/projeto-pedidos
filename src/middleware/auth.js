const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Tokens de cliente da loja (type: 'customer') são assinados com o mesmo
    // JWT_SECRET, mas NUNCA podem acessar o painel administrativo.
    if (decoded.type === 'customer') {
      return res.status(403).json({ error: 'Token inválido ou expirado.' });
    }
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido ou expirado.' });
  }
}

module.exports = authMiddleware;
