const db = require('../database/connection');

// GET /api/estoque
async function listEstoque(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT p.id, p.name, p.code, p.franchise, p.cost, p.estoque,
             IFNULL(SUM(CASE WHEN m.tipo='Entrada' THEN m.quantidade ELSE 0 END), 0) AS totalEntradas,
             IFNULL(SUM(CASE WHEN m.tipo='Saída'   THEN m.quantidade ELSE 0 END), 0) AS totalSaidas
      FROM products p
      LEFT JOIN estoque_movimentacoes m ON m.product_id = p.id
      GROUP BY p.id
      ORDER BY p.franchise, p.name
    `);
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar estoque:', err);
    return res.status(500).json({ error: 'Erro ao buscar estoque.' });
  }
}

// POST /api/estoque/:id/movimentacao
async function movimentar(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { tipo, quantidade, observacao } = req.body;
  if (!['Entrada', 'Saída'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
  const qtd = parseInt(quantidade);
  if (!qtd || qtd <= 0) return res.status(400).json({ error: 'Quantidade inválida.' });

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [[product]] = await conn.query('SELECT estoque FROM products WHERE id = ?', [id]);
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });

    if (tipo === 'Saída' && product.estoque < qtd) {
      return res.status(400).json({ error: `Estoque insuficiente. Disponível: ${product.estoque}.` });
    }

    const delta = tipo === 'Entrada' ? qtd : -qtd;
    await conn.query('UPDATE products SET estoque = estoque + ? WHERE id = ?', [delta, id]);
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
      [id, tipo, qtd, observacao || null]
    );

    await conn.commit();
    const [[updated]] = await conn.query('SELECT estoque FROM products WHERE id = ?', [id]);
    return res.json({ message: 'Movimentação registrada.', estoque: updated.estoque });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao movimentar estoque:', err);
    return res.status(500).json({ error: 'Erro ao registrar movimentação.' });
  } finally {
    conn.release();
  }
}

// GET /api/estoque/:id/historico
async function historico(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM estoque_movimentacoes WHERE product_id = ? ORDER BY created_at DESC LIMIT 30',
      [id]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar histórico:', err);
    return res.status(500).json({ error: 'Erro ao buscar histórico.' });
  }
}

// GET /api/estoque/log
async function logGeral(req, res) {
  const limit = Math.min(parseInt(req.query.limit) || 100, 500);
  try {
    const [rows] = await db.query(
      `SELECT m.id, p.name AS product_name, p.franchise, p.code,
              m.tipo, m.quantidade, m.observacao, m.created_at
       FROM estoque_movimentacoes m
       JOIN products p ON p.id = m.product_id
       ORDER BY m.created_at DESC
       LIMIT ?`,
      [limit]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar log geral:', err);
    return res.status(500).json({ error: 'Erro ao buscar log.' });
  }
}

module.exports = { listEstoque, movimentar, historico, logGeral };
