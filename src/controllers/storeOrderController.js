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
      'SELECT id, name, image, franchise, estoque, sale_value, promotion_price FROM products WHERE id = ?',
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

// POST /api/loja/pedidos — finaliza (transação)
async function criarPedido(req, res) {
  const items = parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });
    const addr = effectiveAddress(client, req.body);
    const addressChanged = hasAddress(req.body);
    const { fee, lat, lng } = await geocodeFee(addr, client, addressChanged);

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();

      if (addressChanged) {
        await conn.query(
          'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=?, lat=?, lng=? WHERE id=?',
          [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, lat, lng, client.id]
        );
      }

      let subtotal = 0;
      const opValues = []; // [order_id, product_id, sale_price, quantity, cost_price]
      for (const it of items) {
        const [[p]] = await conn.query(
          'SELECT id, name, estoque, sale_value, promotion_price, cost FROM products WHERE id = ? FOR UPDATE',
          [it.id]
        );
        if (!p) throw new Error(`Produto ID "${it.id}" indisponível.`);
        if (p.estoque != null && Number(p.estoque) < it.qty) throw new Error(`Estoque insuficiente para "${p.name}".`);
        const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
        const unit = Number(promo ? p.promotion_price : p.sale_value) || 0;
        if (unit <= 0) throw new Error(`Preço indisponível para "${p.name}".`);
        subtotal += unit * it.qty;
        // cost_price não-nulo sinaliza venda promocional (mesma semântica do painel)
        opValues.push([null, p.id, unit, it.qty, promo ? p.cost : null]);
      }
      subtotal = Number(subtotal.toFixed(2));
      const total = Number((subtotal + fee).toFixed(2));

      const [orderResult] = await conn.query(
        "INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value, delivery_fee, origin) VALUES (?, 'A COMBINAR', NULL, ?, NULL, ?, 'loja')",
        [client.id, total, fee]
      );
      const orderId = orderResult.insertId;

      for (const v of opValues) v[0] = orderId;
      await conn.query('INSERT INTO order_products (order_id, product_id, sale_price, quantity, cost_price) VALUES ?', [opValues]);

      for (const it of items) {
        await conn.query('UPDATE products SET estoque = estoque - ? WHERE id = ?', [it.qty, it.id]);
        await conn.query(
          'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
          [it.id, 'Saída', it.qty, `Pedido #${orderId} (loja)`]
        );
      }

      await conn.commit();
      return res.status(201).json({ orderId, subtotal, deliveryFee: fee, total });
    } catch (err) {
      await conn.rollback();
      console.error('Erro ao criar pedido da loja:', err);
      return res.status(400).json({ error: err.message });
    } finally {
      conn.release();
    }
  } catch (e) {
    console.error('Erro ao criar pedido da loja:', e);
    return res.status(500).json({ error: 'Erro ao criar o pedido.' });
  }
}

module.exports = { resumo, criarPedido };
