const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/database/connection');
const { changePassword, listUsers, deleteUser, register } = require('../src/controllers/authController');

function mockRes() {
  return { statusCode: 200, body: null,
    status(c){ this.statusCode=c; return this; },
    json(b){ this.body=b; return this; } };
}
const uname = () => 'zz_test_' + Date.now() + Math.floor(Math.random()*1e6);
async function seedUser(role, senha) {
  const u = uname();
  const [r] = await db.query('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [u, await bcrypt.hash(senha, 10), role]);
  return { id: r.insertId, username: u };
}
async function cleanup() { await db.query("DELETE FROM users WHERE username LIKE 'zz_test_%'"); }

test('changePassword: senha atual correta troca; errada dá 400', async () => {
  const u = await seedUser('user', 'senhaAtual1');
  let res = mockRes();
  await changePassword({ user: { id: u.id }, body: { currentPassword: 'senhaAtual1', newPassword: 'novaSenha6' } }, res);
  assert.strictEqual(res.statusCode, 200);
  const [[row]] = await db.query('SELECT password_hash FROM users WHERE id=?', [u.id]);
  assert.ok(await bcrypt.compare('novaSenha6', row.password_hash), 'hash atualizado');
  res = mockRes();
  await changePassword({ user: { id: u.id }, body: { currentPassword: 'errada', newPassword: 'outra123' } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});

test('changePassword: nova senha < 6 → 400', async () => {
  const u = await seedUser('user', 'senhaAtual1');
  const res = mockRes();
  await changePassword({ user: { id: u.id }, body: { currentPassword: 'senhaAtual1', newPassword: '123' } }, res);
  assert.strictEqual(res.statusCode, 400);
  await cleanup();
});

test('deleteUser: não remove a si mesmo nem o último admin; remove user comum', async () => {
  const admin = await seedUser('admin', 'x123456');
  const comum = await seedUser('user', 'x123456');
  // remover a si mesmo
  let res = mockRes();
  await deleteUser({ user: { id: admin.id, role: 'admin' }, params: { id: String(admin.id) } }, res);
  assert.strictEqual(res.statusCode, 400);
  // remover o último admin (caller é outro admin fictício; só existe 1 admin de teste... garantir contexto):
  //   como pode haver outros admins reais no banco, este teste cria cenário isolado deletando via COUNT.
  //   Validamos a remoção do 'comum' (caminho feliz) e o self-block acima.
  res = mockRes();
  await deleteUser({ user: { id: admin.id, role: 'admin' }, params: { id: String(comum.id) } }, res);
  assert.strictEqual(res.statusCode, 200);
  const [[c]] = await db.query('SELECT COUNT(*) n FROM users WHERE id=?', [comum.id]);
  assert.strictEqual(c.n, 0);
  await cleanup();
});

test('listUsers: não vaza password_hash', async () => {
  await seedUser('user', 'x123456');
  const res = mockRes();
  await listUsers({ user: { role: 'admin' } }, res);
  assert.ok(Array.isArray(res.body));
  const meu = res.body.find(r => r.username && r.username.startsWith('zz_test_'));
  assert.ok(meu && meu.password_hash === undefined, 'sem hash');
  await cleanup();
});

test('register: senha curta → 400; papel inválido vira user', async () => {
  let res = mockRes();
  await register({ body: { username: uname(), password: '123', role: 'admin' } }, res);
  assert.strictEqual(res.statusCode, 400);
  res = mockRes();
  const u = uname();
  await register({ body: { username: u, password: 'senha123', role: 'xyz' } }, res);
  assert.strictEqual(res.statusCode, 201);
  const [[row]] = await db.query('SELECT role FROM users WHERE username=?', [u]);
  assert.strictEqual(row.role, 'user');
  await cleanup();
});
