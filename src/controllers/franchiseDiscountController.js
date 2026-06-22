const db = require('../database/connection');

// GET /api/franchise-discounts
async function listDiscounts(req, res) {
  try {
    const [rows] = await db.query('SELECT franchise, percent FROM franchise_discounts ORDER BY franchise');
    return res.json(rows.map(r => ({ franchise: r.franchise, percent: parseFloat(r.percent) })));
  } catch (err) {
    console.error('Erro ao listar descontos:', err);
    return res.status(500).json({ error: 'Erro ao buscar descontos.' });
  }
}

// PUT /api/franchise-discounts/:franchise
async function updateDiscount(req, res) {
  const franchise = req.params.franchise;
  const percent = parseFloat(req.body.percent);

  if (!franchise) return res.status(400).json({ error: 'Franquia inválida.' });
  if (isNaN(percent) || percent < 0 || percent >= 100) {
    return res.status(400).json({ error: 'Percentual deve ser um número entre 0 e 99,99.' });
  }

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    await conn.query(
      'INSERT INTO franchise_discounts (franchise, percent) VALUES (?, ?) ON DUPLICATE KEY UPDATE percent = ?',
      [franchise, percent, percent]
    );

    const [result] = await conn.query(
      'UPDATE products SET cost = ROUND(sale_value * (1 - ? / 100), 2) WHERE franchise = ? AND sale_value IS NOT NULL',
      [percent, franchise]
    );

    await conn.commit();
    return res.json({ message: 'Desconto atualizado.', recalculados: result.affectedRows });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Erro ao atualizar desconto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar desconto.' });
  } finally {
    if (conn) conn.release();
  }
}

module.exports = { listDiscounts, updateDiscount };
