const db = require('../database/connection');
const { deliveryFee, geocodeClient } = require('../utils/geo');

const DEFAULT_CITY = 'São João da Boa Vista';

// normaliza body.items -> [{id:int, qty:int}] (ou null se inválido)
function parseItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out = [];
  for (const it of raw) {
    const id = parseInt(it && it.id, 10);
    const qty = parseInt(it && it.qty, 10);
    if (!Number.isInteger(id) || id <= 0) return null;
    if (!Number.isInteger(qty) || qty <= 0) return null;
    out.push({ id, qty });
  }
  return out;
}

async function getClient(id) {
  const [[c]] = await db.query(
    'SELECT id, name, address, house_number, neighborhood, cep, city, lat, lng FROM clients WHERE id = ?',
    [id]
  );
  return c;
}

// veio endereço novo no body?
function hasAddress(body) {
  return !!(body && (body.address || body.cep || body.neighborhood));
}

// endereço efetivo: body (se veio) ou o do cadastro
function effectiveAddress(client, body) {
  if (hasAddress(body)) {
    return {
      address: String(body.address || '').trim(),
      house_number: String(body.houseNumber || '').trim(),
      neighborhood: String(body.neighborhood || '').trim(),
      cep: String(body.cep || '').replace(/\D/g, '').slice(0, 8) || null,
      city: String(body.city || '').trim() || client.city || DEFAULT_CITY,
    };
  }
  return {
    address: client.address, house_number: client.house_number,
    neighborhood: client.neighborhood, cep: client.cep,
    city: client.city || DEFAULT_CITY,
  };
}

// frete a partir do endereço efetivo; geocodifica se endereço mudou ou cliente sem coords
async function geocodeFee(addr, client, addressChanged) {
  let lat = client.lat, lng = client.lng;
  if (addressChanged || !lat || !lng) {
    if (addr.address) {
      const coords = await geocodeClient(addr.address, addr.house_number || '', addr.neighborhood || '', addr.city || DEFAULT_CITY);
      if (coords) { lat = coords.lat; lng = coords.lng; }
    }
  }
  const fee = await deliveryFee(lat, lng);
  return { fee, lat, lng };
}

// linhas com preço autoritativo + flags de validação (sem transação — só leitura)
async function buildLines(items) {
  const lines = [];
  for (const it of items) {
    const [[p]] = await db.query(
      'SELECT id, name, image, franchise, estoque, sale_value, promotion_price, cost FROM products WHERE id = ?',
      [it.id]
    );
    if (!p) { lines.push({ id: it.id, qty: it.qty, unitPrice: 0, lineTotal: 0, ok: false, reason: 'Produto indisponível.' }); continue; }
    const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
    const unitPrice = Number(promo ? p.promotion_price : p.sale_value) || 0;
    const enough = p.estoque == null ? true : Number(p.estoque) >= it.qty;
    const ok = enough && unitPrice > 0;
    lines.push({
      id: p.id, name: p.name, image: p.image, franchise: p.franchise,
      unitPrice, qty: it.qty, lineTotal: Number((unitPrice * it.qty).toFixed(2)),
      costPrice: promo ? p.cost : null,
      ok, reason: !enough ? 'Estoque insuficiente.' : (unitPrice <= 0 ? 'Preço indisponível.' : undefined),
    });
  }
  return lines;
}

// POST /api/loja/checkout/resumo — revisão, não grava nada
async function resumo(req, res) {
  const items = parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });
    const lines = await buildLines(items);
    const subtotal = Number(lines.filter(l => l.ok).reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const addr = effectiveAddress(client, req.body);
    const { fee } = await geocodeFee(addr, client, hasAddress(req.body));
    const total = Number((subtotal + fee).toFixed(2));
    return res.json({
      items: lines.map(l => ({
        id: l.id, name: l.name, image: l.image, franchise: l.franchise,
        unitPrice: l.unitPrice || 0, qty: l.qty, lineTotal: l.lineTotal || 0, ok: l.ok, reason: l.reason,
      })),
      subtotal, deliveryFee: fee, total,
    });
  } catch (e) {
    console.error('Erro no resumo do checkout:', e);
    return res.status(500).json({ error: 'Erro ao calcular o resumo.' });
  }
}

// GET /api/loja/pedidos — histórico do próprio cliente
async function listarPedidos(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT o.id, o.created_at, o.status, o.total_cost, o.delivery_fee,
              (SELECT COALESCE(SUM(op.quantity), 0) FROM order_products op WHERE op.order_id = o.id) AS item_count
       FROM orders o WHERE o.client_id = ? ORDER BY o.id DESC`,
      [req.customer.id]
    );
    return res.json(rows);
  } catch (e) {
    console.error('Erro ao listar pedidos do cliente:', e);
    return res.status(500).json({ error: 'Erro ao buscar seus pedidos.' });
  }
}

// GET /api/loja/pedidos/:id — detalhe (apenas do dono; senão 404)
async function detalhePedido(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[order]] = await db.query(
      `SELECT o.id, o.created_at, o.status, o.payment_method, o.total_cost, o.delivery_fee, o.client_id,
              c.name AS client_name, c.address, c.house_number, c.neighborhood, c.cep, c.city
       FROM orders o JOIN clients c ON c.id = o.client_id WHERE o.id = ?`,
      [id]
    );
    if (!order || order.client_id !== req.customer.id) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [products] = await db.query(
      `SELECT p.name, p.franchise, op.sale_price, op.quantity
       FROM order_products op JOIN products p ON p.id = op.product_id WHERE op.order_id = ?`,
      [id]
    );
    delete order.client_id;
    return res.json({ ...order, products });
  } catch (e) {
    console.error('Erro ao buscar pedido do cliente:', e);
    return res.status(500).json({ error: 'Erro ao buscar o pedido.' });
  }
}

const PAYMENT_METHODS_VALIDOS = ['PIX', 'CARTÃO DE CRÉDITO'];

// Cria o pedido JÁ PAGO em transação, a partir do snapshot de linhas da intenção.
// lines: [{ id, qty, unitPrice, costPrice }]. Não re-precifica (o valor pago é a verdade).
// "Pago sem estoque": baixa mesmo assim (pode ficar negativo) e marca a movimentação.
async function criarPedidoPago(conn, { clientId, lines, fee, total, paymentMethod, mpPaymentId }) {
  if (!PAYMENT_METHODS_VALIDOS.includes(paymentMethod)) paymentMethod = 'PIX';
  const rows = [];
  for (const ln of lines) {
    const [[p]] = await conn.query('SELECT id, name, estoque FROM products WHERE id = ? FOR UPDATE', [ln.id]);
    if (!p) throw new Error(`Produto ID "${ln.id}" não existe mais.`);
    const short = p.estoque != null && Number(p.estoque) < ln.qty;
    rows.push({ id: ln.id, qty: ln.qty, unitPrice: Number(ln.unitPrice), costPrice: ln.costPrice != null ? ln.costPrice : null, short });
  }

  const [orderResult] = await conn.query(
    "INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee, origin, payment_status, mp_payment_id) " +
    "VALUES (?, ?, NULL, ?, NULL, ?, 'loja', 'pago', ?)",
    [clientId, paymentMethod, Number(total), Number(fee), mpPaymentId || null]
  );
  const orderId = orderResult.insertId;

  const opInsert = rows.map(r => [orderId, r.id, r.unitPrice, r.qty, r.costPrice]);
  await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES ?', [opInsert]);

  for (const r of rows) {
    await conn.query('UPDATE products SET estoque = estoque - ? WHERE id = ?', [r.qty, r.id]);
    await conn.query(
      'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
      [r.id, 'Saída', r.qty, `Pedido #${orderId} (loja)` + (r.short ? ' — ATENÇÃO: estoque insuficiente' : '')]
    );
  }
  return orderId;
}

module.exports = {
  resumo, listarPedidos, detalhePedido, criarPedidoPago,
  parseItems, buildLines, getClient, effectiveAddress, geocodeFee, hasAddress,
};
