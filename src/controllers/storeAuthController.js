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

module.exports = { register, verify, resend };
