const db = require('../database/connection');
const { getCidadeEntrega, getFretePadrao, getEnderecoRetirada } = require('../utils/delivery');

async function listar(req, res) {
  try {
    const [zones] = await db.query('SELECT id, bairro, fee, active FROM delivery_zones ORDER BY bairro');
    return res.json({ zones, cidade: await getCidadeEntrega(), fretePadrao: await getFretePadrao(), enderecoRetirada: await getEnderecoRetirada() });
  } catch (e) { console.error('Erro ao listar zonas:', e); return res.status(500).json({ error: 'Erro ao listar zonas.' }); }
}
async function criar(req, res) {
  const bairro = String(req.body.bairro || '').trim();
  const fee = Number(req.body.fee);
  if (!bairro || !(fee >= 0)) return res.status(400).json({ error: 'Bairro e valor válidos são obrigatórios.' });
  try {
    await db.query('INSERT INTO delivery_zones (bairro, fee) VALUES (?, ?)', [bairro, fee]);
    return res.status(201).json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esse bairro já está cadastrado.' });
    console.error('Erro ao criar zona:', e); return res.status(500).json({ error: 'Erro ao criar zona.' });
  }
}
async function atualizar(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const bairro = String(req.body.bairro || '').trim();
  const fee = Number(req.body.fee);
  const active = req.body.active ? 1 : 0;
  if (!bairro || !(fee >= 0)) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    await db.query('UPDATE delivery_zones SET bairro=?, fee=?, active=? WHERE id=?', [bairro, fee, active, id]);
    return res.json({ ok: true });
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Esse bairro já está cadastrado.' });
    console.error('Erro ao atualizar zona:', e); return res.status(500).json({ error: 'Erro ao atualizar zona.' });
  }
}
async function remover(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try { await db.query('DELETE FROM delivery_zones WHERE id=?', [id]); return res.json({ ok: true }); }
  catch (e) { console.error('Erro ao remover zona:', e); return res.status(500).json({ error: 'Erro ao remover zona.' }); }
}
async function salvarSettings(req, res) {
  const cidade = String(req.body.cidade || '').trim();
  const fretePadrao = Number(req.body.fretePadrao);
  if (!cidade || !(fretePadrao >= 0)) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    await db.query('INSERT INTO store_settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['cidade_entrega', cidade]);
    await db.query('INSERT INTO store_settings (skey, svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['frete_padrao', String(fretePadrao)]);
    const enderecoRetirada = String(req.body.enderecoRetirada || '').slice(0, 255);
    await db.query("INSERT INTO store_settings (skey, svalue) VALUES ('endereco_retirada', ?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)", [enderecoRetirada]);
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar settings:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { listar, criar, atualizar, remover, salvarSettings };
