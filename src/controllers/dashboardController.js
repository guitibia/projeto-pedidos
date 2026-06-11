const db = require('../database/connection');

async function getDashboard(req, res) {
  try {
    const [orders] = await db.query(`
      SELECT
        SUM((op.sale_price - p.cost) * op.quantity) AS totalLucro,
        SUM(p.cost * op.quantity) AS totalGasto
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE o.status = 'Entregue'
        AND (op.not_came IS NULL OR op.not_came = 0)
    `);

    const [pagas] = await db.query(`
      SELECT IFNULL(SUM(valor), 0) AS promissoriasPagas FROM parcelas WHERE status = 'Pago'
    `);

    const [pendentes] = await db.query(`
      SELECT IFNULL(SUM(valor), 0) AS promissoriasPendentes FROM parcelas WHERE status = 'Pendente'
    `);

    // Vendas mensais reais dos últimos 12 meses
    const [mensais] = await db.query(`
      SELECT
        DATE_FORMAT(o.created_at, '%Y-%m') AS mes,
        SUM(op.sale_price * op.quantity) AS totalVendas
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY mes
      ORDER BY mes ASC
    `);

    // Montar array com os 12 últimos meses (preenchendo zeros onde não há vendas)
    const mesesLabels = [];
    const mesesValores = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const found = mensais.find(m => m.mes === key);
      mesesLabels.push(label);
      mesesValores.push(found ? parseFloat(found.totalVendas) : 0);
    }

    return res.json({
      totalGanho: orders[0].totalLucro || 0,
      totalGasto: orders[0].totalGasto || 0,
      promissoriasPagas: pagas[0].promissoriasPagas || 0,
      promissoriasPendentes: pendentes[0].promissoriasPendentes || 0,
      vendasMensais: { labels: mesesLabels, valores: mesesValores }
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    return res.status(500).json({ error: 'Erro ao buscar dados do dashboard.' });
  }
}

module.exports = { getDashboard };
