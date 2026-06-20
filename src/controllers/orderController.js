const db = require('../database/connection');
const { deliveryFee, geocodeClient } = require('../utils/geo');

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

  // Calcular taxa de entrega antes de abrir transação
  let fee = 0;
  try {
    const [[client]] = await db.query('SELECT lat, lng, address, house_number, neighborhood FROM clients WHERE id = ?', [clientId]);
    if (client) {
      let lat = client.lat, lng = client.lng;
      // Se o cliente ainda não foi geocodificado, tenta agora e persiste
      if (!lat || !lng) {
        const coords = await geocodeClient(client.address, client.house_number, client.neighborhood);
        if (coords) {
          lat = coords.lat; lng = coords.lng;
          await db.query('UPDATE clients SET lat=?, lng=? WHERE id=?', [lat, lng, clientId]);
        }
      }
      fee = await deliveryFee(lat, lng);
    }
  } catch (_) {}

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    // Verificar que todos os produtos existem e têm estoque suficiente
    for (const product of productArray) {
      const [[row]] = await conn.query('SELECT id, name, estoque FROM products WHERE id = ?', [product.id]);
      if (!row) throw new Error(`Produto ID "${product.id}" não encontrado.`);
      const qtd = product.quantity || 1;
      if (row.estoque < qtd) {
        throw new Error(`Estoque insuficiente para "${row.name}". Disponível: ${row.estoque}, solicitado: ${qtd}.`);
      }
    }

    // Inserir pedido com taxa de entrega
    const [orderResult] = await conn.query(
      'INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee) VALUES (?, ?, ?, ?, ?, ?)',
      [clientId, paymentMethod, installments || null, totalValue, combinedPaymentValue || null, fee]
    );
    const orderId = orderResult.insertId;

    // Inserir produtos do pedido e descontar estoque
    const productsValues = productArray.map(p => [
      orderId,
      p.id,
      parseFloat(p.salePrice),
      p.quantity || 1,
      p.productCost != null ? parseFloat(p.productCost) : null
    ]);
    await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES ?', [productsValues]);

    for (const product of productArray) {
      const qtd = product.quantity || 1;
      await conn.query('UPDATE products SET estoque = estoque - ? WHERE id = ?', [qtd, product.id]);
      await conn.query(
        'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
        [product.id, 'Saída', qtd, `Pedido #${orderId}`]
      );
    }

    await conn.commit();
    return res.status(201).json({ message: 'Pedido criado com sucesso!', orderId, totalValue, deliveryFee: fee });
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
              o.delivery_fee,
              c.name AS client_name, c.address AS client_address,
              c.house_number AS client_house_number, c.neighborhood AS client_neighborhood
       FROM orders o JOIN clients c ON o.client_id = c.id
       WHERE o.id = ?`,
      [id]
    );

    if (orderRows.length === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });

    // Buscar produtos do pedido separadamente (sem GROUP_CONCAT frágil)
    const [productRows] = await db.query(
      `SELECT p.name AS product_name, COALESCE(op.cost_price, p.cost) AS cost_price,
              (op.cost_price IS NOT NULL) AS is_promotional,
              p.franchise, p.code, op.sale_price, op.quantity, op.not_came
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
  const statusValidos = ['Pendente', 'Entregue', 'Cancelado'];
  if (!status || !statusValidos.includes(status)) {
    return res.status(400).json({ error: `Status inválido. Use: ${statusValidos.join(', ')}.` });
  }

  // Pendente/Entregue: atualização simples sem transação
  if (status !== 'Cancelado') {
    try {
      const [result] = await db.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
      if (result.affectedRows === 0) return res.status(404).json({ error: 'Pedido não encontrado.' });
      return res.json({ message: 'Status atualizado com sucesso!' });
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      return res.status(500).json({ error: 'Erro ao atualizar status.' });
    }
  }

  // Cancelado: transação — atualiza status + restaura estoque + registra motivo
  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query('UPDATE orders SET status = ? WHERE id = ?', [status, id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    const [produtos] = await conn.query(
      'SELECT product_id, quantity, not_came FROM order_products WHERE order_id = ?',
      [id]
    );

    for (const p of produtos) {
      if (!p.not_came) {
        await conn.query(
          'UPDATE products SET estoque = estoque + ? WHERE id = ?',
          [p.quantity, p.product_id]
        );
        await conn.query(
          'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
          [p.product_id, 'Entrada', p.quantity, `Pedido #${id} cancelado`]
        );
      }
    }

    await conn.commit();
    return res.json({ message: 'Pedido cancelado e estoque restaurado.' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Erro ao cancelar pedido:', err);
    return res.status(500).json({ error: 'Erro ao cancelar pedido.' });
  } finally {
    if (conn) conn.release();
  }
}

// DELETE /api/orders/:id
async function deleteOrder(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // Busca produtos do pedido para restaurar estoque
    const [produtos] = await conn.query(
      'SELECT product_id, quantity, not_came FROM order_products WHERE order_id = ?',
      [id]
    );

    // Restaura estoque apenas dos produtos que efetivamente vieram
    for (const p of produtos) {
      if (!p.not_came) {
        await conn.query(
          'UPDATE products SET estoque = estoque + ? WHERE id = ?',
          [p.quantity, p.product_id]
        );
        await conn.query(
          'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
          [p.product_id, 'Entrada', p.quantity, `Pedido #${id} excluído`]
        );
      }
    }

    const [result] = await conn.query('DELETE FROM orders WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Pedido não encontrado.' });
    }

    await conn.commit();
    return res.json({ message: 'Pedido excluído e estoque restaurado com sucesso!' });
  } catch (err) {
    if (conn) await conn.rollback();
    console.error('Erro ao excluir pedido:', err);
    return res.status(500).json({ error: 'Erro ao excluir pedido.' });
  } finally {
    if (conn) conn.release();
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

// GET /api/orders/:id/parcelas  — lista (e lazy-cria) parcelas do pedido
async function getOrderParcelas(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const [[order]] = await db.query(
      'SELECT installments, total_cost, payment_method, combined_payment_value FROM orders WHERE id = ?', [id]
    );
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    // Só mostra parcelas para métodos que realmente parcelam
    if (!['PARCELADO', 'PAGAMENTO COMBINADO'].includes(order.payment_method)) return res.json([]);
    if (!order.installments || order.installments <= 1) return res.json([]);

    // Verifica se já existem parcelas
    const [existing] = await db.query('SELECT * FROM order_parcelas WHERE order_id = ? ORDER BY numero', [id]);
    if (existing.length > 0) return res.json(existing);

    // Para PAGAMENTO COMBINADO, a parte parcelada é total - valor já pago no PIX/Dinheiro
    const baseParcelado = order.payment_method === 'PAGAMENTO COMBINADO' && order.combined_payment_value
      ? order.total_cost - parseFloat(order.combined_payment_value)
      : order.total_cost;

    const valorBase = parseFloat((baseParcelado / order.installments).toFixed(2));
    const totalBase  = parseFloat((valorBase * order.installments).toFixed(2));
    const diferenca  = parseFloat((baseParcelado - totalBase).toFixed(2));
    const rows = Array.from({ length: order.installments }, (_, i) => {
      // Última parcela absorve a diferença de centavos
      const v = i === order.installments - 1
        ? parseFloat((valorBase + diferenca).toFixed(2))
        : valorBase;
      return [id, i + 1, v];
    });
    await db.query('INSERT INTO order_parcelas (order_id, numero, valor) VALUES ?', [rows]);

    const [created] = await db.query('SELECT * FROM order_parcelas WHERE order_id = ? ORDER BY numero', [id]);
    return res.json(created);
  } catch (err) {
    console.error('Erro ao buscar parcelas:', err);
    return res.status(500).json({ error: 'Erro ao buscar parcelas.' });
  }
}

// PUT /api/orders/:id/parcelas/:num  — alterna status da parcela
async function updateOrderParcela(req, res) {
  const id  = parseInt(req.params.id);
  const num = parseInt(req.params.num);
  if (!Number.isInteger(id) || !Number.isInteger(num)) return res.status(400).json({ error: 'ID inválido.' });

  const { status } = req.body;
  if (!['Pendente', 'Pago'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });

  try {
    const dataPagamento = status === 'Pago' ? new Date() : null;
    await db.query(
      'UPDATE order_parcelas SET status=?, data_pagamento=? WHERE order_id=? AND numero=?',
      [status, dataPagamento, id, num]
    );
    return res.json({ message: 'Parcela atualizada.' });
  } catch (err) {
    console.error('Erro ao atualizar parcela:', err);
    return res.status(500).json({ error: 'Erro ao atualizar parcela.' });
  }
}

module.exports = { createOrder, listOrders, getOrderById, updateOrderStatus, deleteOrder, updateNotCame, getOrderParcelas, updateOrderParcela };
