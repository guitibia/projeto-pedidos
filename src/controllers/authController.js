const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database/connection');

// POST /api/auth/login
async function login(req, res) {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  try {
    const [rows] = await db.query('SELECT * FROM users WHERE username = ?', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const user = rows[0];
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: 'Usuário ou senha inválidos.' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    return res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (err) {
    console.error('Erro no login:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// POST /api/auth/register  (uso interno/admin para criar usuários)
async function register(req, res) {
  const { username, password, role } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }
  if (String(username).length > 60) {
    return res.status(400).json({ error: 'Nome de usuário muito longo (máx. 60).' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'A senha deve ter ao menos 6 caracteres.' });
  }
  const papel = role === 'admin' ? 'admin' : 'user';

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Usuário já existe.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const [result] = await db.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, password_hash, papel]
    );

    return res.status(201).json({ message: 'Usuário criado com sucesso.', id: result.insertId });
  } catch (err) {
    console.error('Erro ao registrar usuário:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// POST /api/auth/change-password  (autenticado)
async function changePassword(req, res) {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Informe a senha atual e a nova.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'A nova senha deve ter ao menos 6 caracteres.' });
  }
  try {
    const [[user]] = await db.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const ok = await bcrypt.compare(currentPassword, user.password_hash);
    if (!ok) return res.status(400).json({ error: 'Senha atual incorreta.' });
    await db.query('UPDATE users SET password_hash = ? WHERE id = ?', [await bcrypt.hash(newPassword, 10), req.user.id]);
    return res.json({ message: 'Senha alterada com sucesso.' });
  } catch (err) {
    console.error('Erro ao trocar senha:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// GET /api/auth/users  (admin-only via rota)
async function listUsers(req, res) {
  try {
    const [rows] = await db.query('SELECT id, username, role, created_at FROM users ORDER BY username');
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar usuários:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// DELETE /api/auth/users/:id  (admin-only via rota)
async function deleteUser(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  if (id === req.user.id) return res.status(400).json({ error: 'Você não pode remover o seu próprio login.' });
  try {
    const [[alvo]] = await db.query('SELECT role FROM users WHERE id = ?', [id]);
    if (!alvo) return res.status(404).json({ error: 'Login não encontrado.' });
    if (alvo.role === 'admin') {
      const [[{ c }]] = await db.query("SELECT COUNT(*) c FROM users WHERE role = 'admin'");
      if (c <= 1) return res.status(400).json({ error: 'Não é possível remover o último administrador.' });
    }
    await db.query('DELETE FROM users WHERE id = ?', [id]);
    return res.json({ message: 'Login removido.' });
  } catch (err) {
    console.error('Erro ao remover usuário:', err);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

module.exports = { login, register, changePassword, listUsers, deleteUser };
