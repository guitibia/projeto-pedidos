const db = require('../database/connection');
const { getDescontoGlobal, getDescontoPix } = require('../utils/pricing');

async function get(req, res) {
  const g = await getDescontoGlobal();
  const p = await getDescontoPix();
  return res.json({ ativo: g.ativo, percent: g.percent, pixAtivo: p.ativo, pixPercent: p.percent });
}

async function put(req, res) {
  const ativo = req.body.ativo ? '1' : '0';
  const percent = Number(req.body.percent);
  if (isNaN(percent) || percent < 0 || percent >= 100) {
    return res.status(400).json({ error: 'Percentual deve ser entre 0 e 99,99.' });
  }
  const pixAtivo = req.body.pixAtivo ? '1' : '0';
  const pixPercent = Number(req.body.pixPercent);
  if (isNaN(pixPercent) || pixPercent < 0 || pixPercent >= 100) {
    return res.status(400).json({ error: 'Percentual do PIX deve ser entre 0 e 99,99.' });
  }
  try {
    const sets = [
      ['desconto_global_ativo', ativo],
      ['desconto_global_percent', String(percent)],
      ['desconto_pix_ativo', pixAtivo],
      ['desconto_pix_percent', String(pixPercent)],
    ];
    for (const [k, v] of sets) {
      await db.query('INSERT INTO store_settings (skey,svalue) VALUES (?,?) ON DUPLICATE KEY UPDATE svalue=VALUES(svalue)', [k, v]);
    }
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar desconto:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { get, put };
