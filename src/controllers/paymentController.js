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

function mapPaymentMethod(paymentTypeId) {
  if (paymentTypeId === 'credit_card' || paymentTypeId === 'debit_card') return 'CARTÃO DE CRÉDITO';
  return 'PIX'; // bank_transfer | account_money | pix | outros
}

// Núcleo idempotente: dado um pagamento aprovado, cria o pedido uma única vez.
// Retorna { status, orderId? }.
async function confirmarIntencao(intent, pagamento) {
  // pagamento: { status, transaction_amount, payment_type_id }
  if (intent.status === 'pago' && intent.order_id) return { status: 'pago', orderId: intent.order_id };

  if (pagamento.status === 'rejected' || pagamento.status === 'cancelled') {
    await db.query("UPDATE payment_intents SET status='falhou', mp_payment_id=? WHERE id=?", [String(intent.mp_payment_id || ''), intent.id]);
    return { status: 'falhou' };
  }
  if (pagamento.status !== 'approved') return { status: 'pendente' };

  // valor cobrado deve bater com o total da intenção
  if (Math.abs(Number(pagamento.transaction_amount) - Number(intent.total)) > 0.01) {
    console.error('Valor do pagamento difere da intenção', intent.id, pagamento.transaction_amount, intent.total);
    return { status: 'pendente' };
  }

  const lines = typeof intent.items_json === 'string' ? JSON.parse(intent.items_json) : intent.items_json;
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // trava a intenção e revalida idempotência
    const [[fresh]] = await conn.query('SELECT status, order_id FROM payment_intents WHERE id = ? FOR UPDATE', [intent.id]);
    if (fresh.order_id) { await conn.commit(); return { status: 'pago', orderId: fresh.order_id }; }

    const orderId = await store.criarPedidoPago(conn, {
      clientId: intent.client_id,
      lines,
      fee: intent.delivery_fee,
      total: intent.total,
      paymentMethod: mapPaymentMethod(pagamento.payment_type_id),
      mpPaymentId: intent.mp_payment_id,
    });
    await conn.query("UPDATE payment_intents SET status='pago', order_id=? WHERE id=?", [orderId, intent.id]);
    await conn.commit();
    return { status: 'pago', orderId };
  } catch (e) {
    await conn.rollback();
    console.error('Erro ao confirmar pagamento (criar pedido):', e);
    return { status: 'erro' };
  } finally {
    conn.release();
  }
}

async function confirmarPorPaymentId(paymentId) {
  const pagamento = await mp.buscarPagamento(paymentId); // { status, transaction_amount, external_reference, payment_type_id }
  if (!pagamento.external_reference) return { status: 'desconhecido' };
  const [[intent]] = await db.query('SELECT * FROM payment_intents WHERE external_reference = ?', [pagamento.external_reference]);
  if (!intent) return { status: 'desconhecido' };
  // grava o payment id na intenção (antes de confirmar)
  await db.query('UPDATE payment_intents SET mp_payment_id=? WHERE id=?', [String(paymentId), intent.id]);
  intent.mp_payment_id = String(paymentId);
  return confirmarIntencao(intent, pagamento);
}

// POST /api/loja/pagamentos/webhook — público; valida via API do MP
async function webhook(req, res) {
  try {
    const type = req.body.type || req.query.type;
    const paymentId = (req.body.data && req.body.data.id) || req.query['data.id'] || req.query.id;
    if (type === 'payment' && paymentId) {
      await confirmarPorPaymentId(paymentId);
    }
    return res.sendStatus(200);
  } catch (e) {
    console.error('Erro no webhook MP:', e);
    return res.sendStatus(200); // evita reentregas em loop; reconsultaremos pelo status
  }
}

// GET /api/loja/pagamentos/:ref — status para a página de retorno (ownership)
async function statusPagamento(req, res) {
  const ref = req.params.ref;
  if (!/^[a-f0-9]{64}$/.test(ref)) return res.status(400).json({ error: 'Referência inválida.' });
  try {
    const [[intent]] = await db.query('SELECT * FROM payment_intents WHERE external_reference = ?', [ref]);
    if (!intent || intent.client_id !== req.customer.id) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    if (intent.status === 'pago' && intent.order_id) return res.json({ status: 'pago', orderId: intent.order_id });

    // se ainda pendente e já temos um payment id, reconsulta o MP e tenta confirmar
    if (intent.status === 'pendente' && intent.mp_payment_id) {
      const pagamento = await mp.buscarPagamento(intent.mp_payment_id);
      const r = await confirmarIntencao(intent, pagamento);
      return res.json(r);
    }
    return res.json({ status: intent.status });
  } catch (e) {
    console.error('Erro ao consultar status do pagamento:', e);
    return res.status(500).json({ error: 'Erro ao consultar o pagamento.' });
  }
}

module.exports = { criarPagamento, webhook, statusPagamento };
