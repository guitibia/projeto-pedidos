const db = require('../database/connection');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { sendVerificationEmail } = require('../utils/mailer');

function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '')); }
function validCPF(cpf) {
  cpf = String(cpf || '').replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  let s = 0;
  for (let i = 0; i < 9; i++) s += parseInt(cpf[i]) * (10 - i);
  let d1 = 11 - (s % 11); if (d1 >= 10) d1 = 0;
  if (d1 !== parseInt(cpf[9])) return false;
  s = 0;
  for (let i = 0; i < 10; i++) s += parseInt(cpf[i]) * (11 - i);
  let d2 = 11 - (s % 11); if (d2 >= 10) d2 = 0;
  return d2 === parseInt(cpf[10]);
}
function verifyLink(token) {
  return (process.env.APP_URL || 'http://localhost:3000') + '/loja/verificar.html?token=' + token;
}

// POST /api/loja/auth/register
async function register(req, res) {
  const { name, email, cpf, birthdate, phone, password, consent } = req.body;
  if (!name || !email || !cpf || !birthdate || !password) return res.status(400).json({ error: 'Preencha todos os campos obrigatórios.' });
  if (!validEmail(email)) return res.status(400).json({ error: 'E-mail inválido.' });
  const cpfDigits = String(cpf).replace(/\D/g, '');
  if (!validCPF(cpfDigits)) return res.status(400).json({ error: 'CPF inválido.' });
  if (String(password).length < 8) return res.status(400).json({ error: 'A senha deve ter ao menos 8 caracteres.' });
  if (!consent) return res.status(400).json({ error: 'É necessário aceitar a Política de Privacidade.' });
  try {
    const [[dupE]] = await db.query('SELECT id FROM clients WHERE email = ?', [email]);
    if (dupE) return res.status(409).json({ error: 'Este e-mail já está cadastrado.' });
    const [[dupC]] = await db.query('SELECT id FROM clients WHERE cpf = ?', [cpfDigits]);
    if (dupC) return res.status(409).json({ error: 'Este CPF já está cadastrado.' });
    const hash = await bcrypt.hash(password, 10);
    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO clients (name, email, cpf, birthdate, phone, password_hash, email_verified, verification_token, verification_expires, lgpd_consent_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, NOW())`,
      [name, email, cpfDigits, birthdate, phone || null, hash, token, expires]
    );
    await sendVerificationEmail(email, name, verifyLink(token));
    return res.status(201).json({ message: 'Cadastro criado! Enviamos um link de confirmação para o seu e-mail.' });
  } catch (e) { console.error('Erro no cadastro:', e); return res.status(500).json({ error: 'Erro ao cadastrar.' }); }
}

// GET /api/loja/auth/verify?token=
async function verify(req, res) {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token ausente.' });
  try {
    const [[c]] = await db.query('SELECT id, verification_expires FROM clients WHERE verification_token = ?', [token]);
    if (!c) return res.status(400).json({ error: 'Link inválido ou já utilizado.' });
    if (new Date(c.verification_expires) < new Date()) return res.status(400).json({ error: 'Link expirado. Solicite um novo.' });
    await db.query('UPDATE clients SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE id = ?', [c.id]);
    return res.json({ message: 'E-mail confirmado! Você já pode entrar.' });
  } catch (e) { console.error('Erro ao verificar:', e); return res.status(500).json({ error: 'Erro ao verificar.' }); }
}

// POST /api/loja/auth/resend
async function resend(req, res) {
  const { email } = req.body;
  try {
    if (email) {
      const [[c]] = await db.query('SELECT id, name, email_verified FROM clients WHERE email = ?', [email]);
      if (c && !c.email_verified) {
        const token = crypto.randomBytes(32).toString('hex');
        await db.query('UPDATE clients SET verification_token = ?, verification_expires = ? WHERE id = ?',
          [token, new Date(Date.now() + 24 * 60 * 60 * 1000), c.id]);
        await sendVerificationEmail(email, c.name, verifyLink(token));
      }
    }
    return res.json({ message: 'Se houver uma conta não confirmada com este e-mail, enviamos um novo link.' });
  } catch (e) { console.error('Erro no reenvio:', e); return res.status(500).json({ error: 'Erro ao reenviar.' }); }
}

// POST /api/loja/auth/login
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'E-mail e senha são obrigatórios.' });
  try {
    const [[c]] = await db.query('SELECT id, name, email, password_hash, email_verified FROM clients WHERE email = ?', [email]);
    if (!c || !c.password_hash) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    const ok = await bcrypt.compare(password, c.password_hash);
    if (!ok) return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    if (!c.email_verified) return res.status(403).json({ error: 'Confirme seu e-mail antes de entrar.', needsVerification: true });
    const token = jwt.sign({ id: c.id, email: c.email, type: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.json({ token, user: { id: c.id, name: c.name, email: c.email } });
  } catch (e) { console.error('Erro no login do cliente:', e); return res.status(500).json({ error: 'Erro ao entrar.' }); }
}

// GET /api/loja/auth/me
async function me(req, res) {
  try {
    const [[c]] = await db.query(
      'SELECT id, name, email, cpf, birthdate, phone, address, house_number, neighborhood FROM clients WHERE id = ?',
      [req.customer.id]);
    if (!c) return res.status(404).json({ error: 'Conta não encontrada.' });
    return res.json(c);
  } catch (e) { console.error('Erro em me:', e); return res.status(500).json({ error: 'Erro ao buscar conta.' }); }
}

// PUT /api/loja/auth/me
async function updateMe(req, res) {
  const { name, phone, address, houseNumber, neighborhood, birthdate } = req.body;
  if (!name) return res.status(400).json({ error: 'O nome é obrigatório.' });
  try {
    await db.query(
      'UPDATE clients SET name=?, phone=?, address=?, house_number=?, neighborhood=?, birthdate=? WHERE id=?',
      [name, phone || null, address || null, houseNumber || null, neighborhood || null, birthdate || null, req.customer.id]);
    return res.json({ message: 'Dados atualizados.' });
  } catch (e) { console.error('Erro em updateMe:', e); return res.status(500).json({ error: 'Erro ao atualizar.' }); }
}

// PUT /api/loja/auth/password
async function changePassword(req, res) {
  const { current, novo } = req.body;
  if (!novo || String(novo).length < 8) return res.status(400).json({ error: 'A nova senha deve ter ao menos 8 caracteres.' });
  try {
    const [[c]] = await db.query('SELECT password_hash FROM clients WHERE id = ?', [req.customer.id]);
    const ok = await bcrypt.compare(current || '', c.password_hash || '');
    if (!ok) return res.status(400).json({ error: 'Senha atual incorreta.' });
    const hash = await bcrypt.hash(novo, 10);
    await db.query('UPDATE clients SET password_hash = ? WHERE id = ?', [hash, req.customer.id]);
    return res.json({ message: 'Senha alterada.' });
  } catch (e) { console.error('Erro em changePassword:', e); return res.status(500).json({ error: 'Erro ao alterar a senha.' }); }
}

// DELETE /api/loja/auth/me  (direito de exclusão LGPD)
async function deleteMe(req, res) {
  try {
    await db.query('DELETE FROM clients WHERE id = ?', [req.customer.id]);
    return res.json({ message: 'Conta excluída.' });
  } catch (e) { console.error('Erro em deleteMe:', e); return res.status(500).json({ error: 'Erro ao excluir a conta.' }); }
}

module.exports = { register, verify, resend, login, me, updateMe, changePassword, deleteMe };
