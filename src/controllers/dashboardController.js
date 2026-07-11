const db = require('../database/connection');

async function getDashboard(req, res) {
  try {
    const [[financeiro]] = await db.query(`
      SELECT
        IFNULL(SUM((op.sale_price - p.cost) * op.quantity), 0) AS totalLucro,
        IFNULL(SUM(p.cost * op.quantity), 0)                   AS totalGasto,
        IFNULL(SUM(op.sale_price * op.quantity), 0)            AS totalReceita
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE o.status = 'Entregue'
        AND (op.not_came IS NULL OR op.not_came = 0)
    `);

    // Top 3 produtos mais vendidos (por quantidade total, apenas pedidos Entregue)
    const [topProductRows] = await db.query(`
      SELECT p.name AS nome, SUM(op.quantity) AS total
      FROM order_products op
      JOIN products p ON op.product_id = p.id
      JOIN orders o ON o.id = op.order_id
      WHERE o.status = 'Entregue'
      GROUP BY op.product_id
      ORDER BY total DESC
      LIMIT 3
    `);

    // Lucro do mês atual
    const [[lucroMesRow]] = await db.query(`
      SELECT IFNULL(SUM((op.sale_price - p.cost) * op.quantity), 0) AS lucroMes
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE o.status = 'Entregue'
        AND (op.not_came IS NULL OR op.not_came = 0)
        AND MONTH(o.created_at) = MONTH(NOW())
        AND YEAR(o.created_at) = YEAR(NOW())
    `);

    const [[countPedidos]] = await db.query(`
      SELECT COUNT(*) AS total FROM orders
    `);

    const [[pendentes]] = await db.query(`
      SELECT COUNT(*) AS total FROM orders WHERE status = 'Pendente'
    `);

    const [[countClientes]] = await db.query(`
      SELECT COUNT(*) AS total FROM clients
    `);

    const [[countProdutos]] = await db.query(`
      SELECT COUNT(*) AS total FROM products
    `);

    const [[entregas]] = await db.query(`
      SELECT
        IFNULL(SUM(delivery_fee), 0)                          AS custoEntregas,
        COUNT(CASE WHEN delivery_fee > 0 THEN 1 END)          AS pedidosComTaxa
      FROM orders
      WHERE MONTH(created_at) = MONTH(NOW()) AND YEAR(created_at) = YEAR(NOW())
    `);

    const [[promPagas]] = await db.query(`
      SELECT IFNULL(SUM(valor), 0) AS total FROM parcelas WHERE status = 'Pago'
    `);

    const [[promPendentes]] = await db.query(`
      SELECT IFNULL(SUM(valor), 0) AS total FROM parcelas WHERE status = 'Pendente'
    `);

    // Vendas e lucro mensais dos últimos 12 meses
    const [mensais] = await db.query(`
      SELECT
        DATE_FORMAT(o.created_at, '%Y-%m') AS mes,
        SUM(op.sale_price * op.quantity)                       AS totalVendas,
        SUM((op.sale_price - p.cost) * op.quantity)            AS totalLucro
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE o.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY mes
      ORDER BY mes ASC
    `);

    const mesesLabels = [], mesesVendas = [], mesesLucro = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
      const found = mensais.find(m => m.mes === key);
      mesesLabels.push(label);
      mesesVendas.push(found ? parseFloat(found.totalVendas) : 0);
      mesesLucro.push(found ? parseFloat(found.totalLucro)  : 0);
    }

    // Vendas e lucro diários dos últimos 30 dias
    const [diarios] = await db.query(`
      SELECT DATE(o.created_at) AS dia,
             SUM(op.sale_price * op.quantity)            AS totalVendas,
             SUM((op.sale_price - p.cost) * op.quantity) AS totalLucro
      FROM orders o
      JOIN order_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE o.created_at >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)
      GROUP BY dia ORDER BY dia ASC
    `);
    const diasLabels = [], diasVendas = [], diasLucro = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key   = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const label = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const found = diarios.find(r => {
        const rd = r.dia instanceof Date
          ? `${r.dia.getFullYear()}-${String(r.dia.getMonth()+1).padStart(2,'0')}-${String(r.dia.getDate()).padStart(2,'0')}`
          : String(r.dia).slice(0, 10);
        return rd === key;
      });
      diasLabels.push(label);
      diasVendas.push(found ? parseFloat(found.totalVendas) : 0);
      diasLucro.push(found ? parseFloat(found.totalLucro) : 0);
    }

    // Pedidos por status
    const [statusRows] = await db.query(`
      SELECT status, COUNT(*) AS total FROM orders GROUP BY status
    `);

    // Últimos 6 pedidos
    const [ultimosPedidos] = await db.query(`
      SELECT o.id, c.name AS client_name, o.payment_method, o.total_cost, o.status
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      ORDER BY o.id DESC
      LIMIT 6
    `);

    // Alertas de estoque (zerados + baixo ≤ 5)
    const [alertasEstoque] = await db.query(`
      SELECT id, name, franchise, estoque
      FROM products
      WHERE estoque <= 5
      ORDER BY estoque ASC, name ASC
      LIMIT 30
    `);

    // Promissórias pendentes — próximas a vencer (até 60 dias à frente, ou já vencidas)
    const [promProximas] = await db.query(`
      SELECT
        pa.id,
        DATE_FORMAT(pa.data_vencimento, '%Y-%m-%d') AS data_vencimento,
        pa.valor, pa.numero_parcela,
        nf.fornecedor
      FROM parcelas pa
      JOIN promissorias pr ON pa.promissoria_id = pr.id
      JOIN notas_fiscais nf ON pr.nota_fiscal_id = nf.id
      WHERE pa.status = 'Pendente'
        AND pa.data_vencimento <= DATE_ADD(CURDATE(), INTERVAL 60 DAY)
      ORDER BY pa.data_vencimento ASC
      LIMIT 15
    `);

    return res.json({
      totalLucro:      financeiro.totalLucro,
      totalGasto:      financeiro.totalGasto,
      totalReceita:    financeiro.totalReceita,
      margemLucro:     financeiro.totalReceita > 0 ? (financeiro.totalLucro / financeiro.totalReceita * 100) : 0,
      lucroMes:        lucroMesRow.lucroMes,
      topProdutos:     topProductRows,
      totalPedidos:    countPedidos.total,
      pedidosPendentes: pendentes.total,
      totalClientes:   countClientes.total,
      totalProdutos:        countProdutos.total,
      custoEntregas:        entregas.custoEntregas,
      pedidosComTaxa:       entregas.pedidosComTaxa,
      promissoriasPagas:     promPagas.total,
      promissoriasPendentes: promPendentes.total,
      vendasMensais: { labels: mesesLabels, vendas: mesesVendas, lucro: mesesLucro },
      vendasDiarias: { labels: diasLabels, vendas: diasVendas, lucro: diasLucro },
      statusPedidos: statusRows,
      ultimosPedidos,
      alertasEstoque,
      promProximas,
    });
  } catch (err) {
    console.error('Erro no dashboard:', err);
    return res.status(500).json({ error: 'Erro ao buscar dados do dashboard.' });
  }
}

module.exports = { getDashboard };
