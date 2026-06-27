const db = require('../database/connection');

function parseId(v) { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; }

// GET /api/loja/favoritos — produtos favoritados do cliente (dados atuais)
async function listar(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT p.id, p.name, p.franchise, p.code, p.sale_value, p.promotion_price, p.image, p.estoque
       FROM favorites f JOIN products p ON p.id = f.product_id
       WHERE f.client_id = ? ORDER BY f.created_at DESC`,
      [req.customer.id]
    );
    return res.json(rows);
  } catch (e) { console.error('Erro ao listar favoritos:', e); return res.status(500).json({ error: 'Erro ao buscar favoritos.' }); }
}

// GET /api/loja/favoritos/ids — só os ids (p/ marcar corações e contar)
async function ids(req, res) {
  try {
    const [rows] = await db.query('SELECT product_id FROM favorites WHERE client_id = ?', [req.customer.id]);
    return res.json(rows.map(r => r.product_id));
  } catch (e) { console.error('Erro ao listar ids de favoritos:', e); return res.status(500).json({ error: 'Erro.' }); }
}

// POST /api/loja/favoritos { productId }
async function adicionar(req, res) {
  const pid = parseId(req.body && req.body.productId);
  if (!pid) return res.status(400).json({ error: 'Produto inválido.' });
  try {
    const [[prod]] = await db.query('SELECT id FROM products WHERE id = ?', [pid]);
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado.' });
    await db.query('INSERT IGNORE INTO favorites (client_id, product_id) VALUES (?, ?)', [req.customer.id, pid]);
    return res.status(201).json({ ok: true });
  } catch (e) { console.error('Erro ao favoritar:', e); return res.status(500).json({ error: 'Erro ao favoritar.' }); }
}

// DELETE /api/loja/favoritos/:productId
async function remover(req, res) {
  const pid = parseId(req.params.productId);
  if (!pid) return res.status(400).json({ error: 'Produto inválido.' });
  try {
    await db.query('DELETE FROM favorites WHERE client_id = ? AND product_id = ?', [req.customer.id, pid]);
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao remover favorito:', e); return res.status(500).json({ error: 'Erro.' }); }
}

module.exports = { listar, ids, adicionar, remover };
