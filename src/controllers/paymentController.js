const crypto = require('crypto');
const db = require('../database/connection');
const mp = require('../services/mercadopago');
const store = require('../controllers/storeOrderController');

// POST /api/loja/pagamentos — valida carrinho, grava intenção, cria preferência MP
async function criarPagamento(req, res) {
  if (!mp.isConfigured()) return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  const items = store.parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await store.getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });

    const linhas = await store.buildLines(items);
    const indisponivel = linhas.find(l => !l.ok);
    if (indisponivel) return res.status(400).json({ error: indisponivel.reason || 'Item indisponível.', itemId: indisponivel.id });

    const subtotal = Number(linhas.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const addr = store.effectiveAddress(client, req.body);
    const addressChanged = store.hasAddress(req.body);
    const { fee, lat, lng } = await store.geocodeFee(addr, client, addressChanged);
    const total = Number((subtotal + fee).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Total inválido.' });

    // Persiste o endereço no cadastro (mesma decisão do sub-3) se foi editado
    if (addressChanged) {
      await db.query(
        'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=?, lat=?, lng=? WHERE id=?',
        [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, lat, lng, client.id]
      );
    }

    // Snapshot de linhas (preço travado = o que será cobrado)
    const snapshot = linhas.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
    const externalReference = crypto.randomBytes(32).toString('hex');

    const [ins] = await db.query(
      `INSERT INTO payment_intents
       (client_id, external_reference, items_json, address, house_number, neighborhood, cep, city, subtotal, delivery_fee, total, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [client.id, externalReference, JSON.stringify(snapshot), addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, subtotal, fee, total]
    );

    let pref;
    try {
      pref = await mp.criarPreferencia({ externalReference, total, descricao: 'Beleza Multi Marcas — Pedido' });
    } catch (e) {
      console.error('Erro ao criar preferência MP:', e);
      await db.query("UPDATE payment_intents SET status='falhou' WHERE id=?", [ins.insertId]);
      return res.status(502).json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.' });
    }
    await db.query('UPDATE payment_intents SET mp_preference_id=? WHERE id=?', [pref.id, ins.insertId]);

    return res.status(201).json({ init_point: pref.init_point, external_reference: externalReference });
  } catch (e) {
    console.error('Erro ao criar pagamento:', e);
    return res.status(500).json({ error: 'Erro ao iniciar o pagamento.' });
  }
}

module.exports = { criarPagamento };
