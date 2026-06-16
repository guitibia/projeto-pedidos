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

module.exports = { createClient, listClients, listClientOrders };
