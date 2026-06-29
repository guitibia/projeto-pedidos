const db = require('../database/connection');
const { getDescontoGlobal } = require('../utils/pricing');

async function get(req, res) {
  const g = await getDescontoGlobal();
  return res.json({ ativo: g.ativo, percent: g.percent });
}

async function put(req, res) {
  const ativo = req.body.ativo ? '1' : '0';
  const percent = Number(req.body.percent);
  if (isNaN(percent) || percent < 0 || percent >= 100) {
    return res.status(400).json({ error: 'Percentual deve ser entre 0 e 99,99.' });
  }
  try {
    await db.query('INSERT INTO store_settings (skey,svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['desconto_global_ativo', ativo]);
    await db.query('INSERT INTO store_settings (skey,svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', ['desconto_global_percent', String(percent)]);
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar desconto:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { get, put };
