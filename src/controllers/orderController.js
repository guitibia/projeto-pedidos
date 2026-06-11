const db = require('../database/connection');

const VALID_PAYMENT_METHODS = ['PIX', 'DINHEIRO', 'CARTÃO DE CRÉDITO', 'PARCELADO', 'PAGAMENTO COMBINADO'];

// POST /api/orders  — usa transação para garantir consistência
async function createOrder(req, res) {
  const { clientId, paymentMethod, products, totalValue, combinedPaymentValue, installments } = req.body;

  const productArray = Array.isArray(products) ? products : [products];

  if (!clientId || !paymentMethod || productArray.length === 0 || !totalValue) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes.' });
  }

  if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Método de pagamento inválido.' });
  }

  if (['PARCELADO', 'PAGAMENTO COMBINADO'].includes(paymentMethod) && !installments) {
    return res.status(400).json({ error: 'Número de parcelas é obrigatório.' });
  }

  if (paymentMethod === 'PAGAMENTO COMBINADO' && (!combinedPaymentValue || combinedPaymentValue <= 0)) {
    return res.status(400).json({ error: 'Valor de pagamento combinado inválido.' });
  }

  // Validar produtos antes de abrir a transação
  for (const product of productArray) {
    if (!product.id || isNaN(parseFloat(product.salePrice)) || parseFloat(product.salePrice) <= 0) {
      return res.status(400).json({ error: `Preço inválido para o produto ID "${product.id || 'desconhecido'}".` });
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar que todos os produtos existem
    for (const product of productArray) {
      const [rows] = await conn.query('SELECT id FROM products WHERE id = ?', [product.id]);
      if (rows.length === 0) throw new Error(`Produto ID "${product.id}" não encontrado.`);
    }

    // Inserir pedido
    const [orderResult] = await conn.query(
      'INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value) VALUES (?, ?, ?, ?, ?)',
      [clientId, paymentMethod, installments || null, totalValue, combinedPaymentValue || null]
    );
    const orderId = orderResult.insertId;

    // Inserir produtos do pedido
    const productsValues = productArray.map(p => [
      orderId,
      p.id,
      parseFloat(p.salePrice),
      p.quantity || 1
    ]);
    await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity) VALUES ?', [productsValues]);

    await conn.commit();
    return res.status(201).json({ message: 'Pedido criado com sucesso!', orderId, totalValue });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao criar pedido:', err);
    return res.status(400).json({ error: err.message });
  } finally {
    conn.release();
  }
}

// GET /api/orders
async function listOrders(req, res) {
  const statusFilter = req.query.status || 'Todos';
  let query = `SELECT o.id, o.payment_method, o.total_cost, o.status, c.name AS client_name
               FROM orders o JOIN clients c ON o.client_id = c.id`;
  const params = [];

  if (statusFilter !== 'Todos') {
    query += ' WHERE o.status = ?';
    params.push(statusFilter);
  }
  query += ' ORDER BY o.id DESC';

  try {
    const [rows] = await db.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar pedidos:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos.' });
  }
}

// GET /api/orders/:id  — usa subquery JSON para evitar problema de vírgula no GROUP_CONCAT
async function getOrderById(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    // Buscar cabeçalho do pedido
    const [orderRows] = await db.query(
      `SELECT o.id, o.payment_method, o.total_cost, o.installments, o.combined_payment_value, o.status,
              c.name AS client_name, c.address AS client_address,
              c.house_number AS client_house_number, c.neighborhood AS client_neighborhood
       FROM orders o JOIN clients c ON o.client_id = c.id
       WHERE o.id = ?`,
      [id]
    );

    if (orderRows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    // Buscar produtos do pedido separadamente (sem GROUP_CONCAT frágil)
    const [productRows] = await db.query(
      `SELECT p.name AS product_name, p.cost AS cost_price, p.franchise, p.code,
              op.sale_price, op.quantity, op.not_came
       FROM order_products op
       JOIN products p ON p.id = op.product_id
       WHERE op.order_id = ?`,
      [id]
    );

    const order = { ...orderRows[0], products: productRows };
    return res.json(order);
  } catch (err) {
    console.error('Erro ao buscar pedido:', err);
    return res.status(500).json({ error: 'Erro ao buscar detalhes do pedido.' });
  }
}

// PUT /api/orders/:id/status
async function updateOrderStatus(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { status } = req.body;
  if (!status) return res.status(400).json({ error: 'Status é obrigatório.' });

  try {
    const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    return res.json({ message: 'Status atualizado com sucesso!' });
  } catch (err) {
    console.error('Erro ao atualizar status:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status.' });
  }
}

// DELETE /api/orders/:id
async function deleteOrder(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const [result] = await db.query('DELETE FROM orders WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
    return res.json({ message: 'Pedido excluído com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir pedido:', err);
    return res.status(500).json({ error: 'Erro ao excluir pedido.' });
  }
}

// PATCH /api/orders/:orderId/products/:productCode/not-came
async function updateNotCame(req, res) {
  const orderId = parseInt(req.params.orderId);
  if (!Number.isInteger(orderId)) return res.status(400).json({ error: 'ID de pedido inválido.' });

  const { productCode } = req.params;
  const { notCame } = req.body;

  try {
    const [result] = await db.query(
      `UPDATE order_products op
       JOIN products p ON op.product_id = p.id
       SET op.not_came = ?
       WHERE op.order_id = ? AND p.code = ?`,
      [notCame ? 1 : 0, orderId, productCode]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado no pedido.' });
    return res.json({ message: notCame ? 'Produto marcado como NÃO VEIO.' : 'Produto marcado como VEIO.' });
  } catch (err) {
    console.error('Erro ao atualizar not_came:', err);
    return res.status(500).json({ error: 'Erro ao atualizar status do produto.' });
  }
}

module.exports = { createOrder, listOrders, getOrderById, updateOrderStatus, deleteOrder, updateNotCame };
