const db = require('../database/connection');
const { geocodeClient } = require('../utils/geo');

// POST /api/clients
async function createClient(req, res) {
  const { name, address, houseNumber, neighborhood, phone } = req.body;

  if (!name || !address || !houseNumber || !neighborhood) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }

  // Geocodifica em background — não bloqueia a criação do cliente
  let lat = null, lng = null;
  try {
    const coords = await geocodeClient(address, houseNumber, neighborhood);
    if (coords) { lat = coords.lat; lng = coords.lng; }
  } catch (_) {}

  try {
    const [result] = await db.query(
      'INSERT INTO clients (name, address, house_number, neighborhood, phone, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name, address, houseNumber, neighborhood, phone || null, lat, lng]
    );
    return res.status(201).json({ message: 'Cliente cadastrado com sucesso!', clientId: result.insertId });
  } catch (err) {
    console.error('Erro ao criar cliente:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar cliente.' });
  }
}

// GET /api/clients
async function listClients(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM clients ORDER BY name');
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar clientes:', err);
    return res.status(500).json({ error: 'Erro ao buscar clientes.' });
  }
}

// GET /api/client-orders/:clientId
async function listClientOrders(req, res) {
  const clientId = parseInt(req.params.clientId);
  if (!Number.isInteger(clientId)) {
    return res.status(400).json({ error: 'ID de cliente inválido.' });
  }

  const statusFilter = req.query.status || 'Todos';
  let query = `SELECT o.id, o.payment_method, o.total_cost, o.status, c.name AS client_name
               FROM orders o JOIN clients c ON o.client_id = c.id
               WHERE o.client_id = ?`;
  const params = [clientId];

  if (statusFilter !== 'Todos') {
    query += ' AND o.status = ?';
    params.push(statusFilter);
  }

  try {
    const [rows] = await db.query(query, params);
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar pedidos do cliente:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos do cliente.' });
  }
}

// DELETE /api/clients/:id  — exclui cliente sem pedidos (limpa favoritos)
async function deleteClient(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[cli]] = await conn.query('SELECT id, name FROM clients WHERE id = ?', [id]);
    if (!cli) { await conn.rollback(); return res.status(404).json({ error: 'Cliente não encontrado.' }); }

    const [[{ c }]] = await conn.query('SELECT COUNT(*) c FROM orders WHERE client_id = ?', [id]);
    if (c > 0) {
      await conn.rollback();
      return res.status(409).json({ error: 'Este cliente tem ' + c + ' pedido(s) e não pode ser excluído.' });
    }

    await conn.query('DELETE FROM favorites WHERE client_id = ?', [id]);
    await conn.query('DELETE FROM clients WHERE id = ?', [id]);
    await conn.commit();
    return res.json({ ok: true, nome: cli.name });
  } catch (e) {
    await conn.rollback();
    console.error('Erro ao excluir cliente:', e);
    return res.status(500).json({ error: 'Erro ao excluir o cliente.' });
  } finally {
    conn.release();
  }
}

// GET /api/clients/:id/summary  — dados cadastrais + métricas de compra (somente leitura)
async function clientSummary(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[client]] = await db.query(
      'SELECT id, name, email, email_verified, cpf, phone, birthdate, cep, address, house_number, neighborhood, city, pix_discount_percent, created_at FROM clients WHERE id = ?',
      [id]);
    if (!client) return res.status(404).json({ error: 'Cliente não encontrado.' });

    const [[tot]] = await db.query(
      'SELECT COUNT(*) totalPedidos, MIN(created_at) primeiraCompra, MAX(created_at) ultimaCompra FROM orders WHERE client_id = ?',
      [id]);
    const [[fin]] = await db.query(
      "SELECT COALESCE(SUM(total_cost),0) totalGasto, COUNT(*) validos FROM orders WHERE client_id = ? AND status <> 'Cancelado'",
      [id]);
    const totalGasto = Number(fin.totalGasto) || 0;
    const ticketMedio = fin.validos > 0 ? totalGasto / fin.validos : 0;

    const [porStatus] = await db.query(
      'SELECT status, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY status', [id]);
    const [porOrigem] = await db.query(
      'SELECT origin, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY origin', [id]);
    const [[pref]] = await db.query(
      'SELECT payment_method, COUNT(*) n FROM orders WHERE client_id = ? GROUP BY payment_method ORDER BY n DESC LIMIT 1', [id]);
    const [topProdutos] = await db.query(
      `SELECT op.product_id, p.name, SUM(op.quantity) qtd, SUM(op.quantity * op.sale_price) total
       FROM order_products op
       JOIN orders o ON o.id = op.order_id
       JOIN products p ON p.id = op.product_id
       WHERE o.client_id = ? AND o.status <> 'Cancelado'
       GROUP BY op.product_id, p.name
       ORDER BY qtd DESC
       LIMIT 5`, [id]);

    return res.json({
      client,
      stats: {
        totalPedidos: tot.totalPedidos,
        totalGasto,
        ticketMedio,
        primeiraCompra: tot.primeiraCompra,
        ultimaCompra: tot.ultimaCompra,
        porStatus,
        porOrigem,
        pagamentoPreferido: pref ? pref.payment_method : null
      },
      topProdutos: topProdutos.map(r => ({ product_id: r.product_id, name: r.name, qtd: Number(r.qtd), total: Number(r.total) }))
    });
  } catch (e) {
    console.error('Erro no resumo do cliente:', e);
    return res.status(500).json({ error: 'Erro ao buscar o resumo do cliente.' });
  }
}

// PUT /api/clients/:id/pix-discount  — define o % de desconto no PIX do cliente (vazio = usa o global)
async function setPixDiscount(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const raw = req.body.percent;
  let percent = null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    percent = Number(raw);
    if (isNaN(percent) || percent < 0 || percent >= 100) {
      return res.status(400).json({ error: 'Percentual deve ser entre 0 e 99,99.' });
    }
  }
  try {
    const [r] = await db.query('UPDATE clients SET pix_discount_percent = ? WHERE id = ?', [percent, id]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Cliente não encontrado.' });
    return res.json({ ok: true });
  } catch (e) { console.error('Erro ao salvar desconto PIX do cliente:', e); return res.status(500).json({ error: 'Erro ao salvar.' }); }
}

module.exports = { createClient, listClients, listClientOrders, deleteClient, clientSummary, setPixDiscount };
