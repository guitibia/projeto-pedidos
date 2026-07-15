const crypto = require('crypto');
const db = require('../database/connection');
const mp = require('../services/mercadopago');
const store = require('../controllers/storeOrderController');
const { freteDoBairro, cidadeAtende, getCidadeEntrega } = require('../utils/delivery');
const { getDescontoPix, resolvePixPercent, aplicaPix } = require('../utils/pricing');

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
    const metodo = store.metodoEntrega(req.body);
    const addr = store.effectiveAddress(client, req.body);
    const addressChanged = store.hasAddress(req.body);
    let fee = 0;
    if (metodo === 'entrega') {
      if (addr.city && !(await cidadeAtende(addr.city))) {
        return res.status(400).json({ error: 'Entregamos apenas em ' + (await getCidadeEntrega()) + '.', foraDeArea: true });
      }
      fee = await freteDoBairro(addr.neighborhood);
    }
    const total = Number((subtotal + fee).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Total inválido.' });

    // Persiste o endereço no cadastro só quando é entrega e foi editado
    if (metodo === 'entrega' && addressChanged) {
      await db.query(
        'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=? WHERE id=?',
        [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, client.id]
      );
    }

    const snapshot = linhas.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
    const externalReference = crypto.randomBytes(32).toString('hex');

    const [ins] = await db.query(
      `INSERT INTO payment_intents
       (client_id, external_reference, items_json, address, house_number, neighborhood, cep, city, subtotal, delivery_fee, total, status, delivery_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
      [client.id, externalReference, JSON.stringify(snapshot), addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, subtotal, fee, total, metodo]
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
      deliveryMethod: intent.delivery_method,
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

    // Ainda pendente: reconsulta o MP e tenta confirmar. Se o webhook já gravou
    // o payment id, usa-o; senão busca o pagamento pelo external_reference
    // (fallback essencial quando o webhook não chegou — ex.: ambiente local).
    if (intent.status === 'pendente') {
      let pagamento = null;
      if (intent.mp_payment_id) {
        pagamento = await mp.buscarPagamento(intent.mp_payment_id);
      } else {
        const found = await mp.buscarPagamentoPorReferencia(ref);
        if (found && found.id) {
          await db.query('UPDATE payment_intents SET mp_payment_id=? WHERE id=?', [String(found.id), intent.id]);
          intent.mp_payment_id = String(found.id);
          pagamento = found;
        }
      }
      if (pagamento) {
        const r = await confirmarIntencao(intent, pagamento);
        return res.json(r);
      }
      return res.json({ status: 'pendente' });
    }
    return res.json({ status: intent.status });
  } catch (e) {
    console.error('Erro ao consultar status do pagamento:', e);
    return res.status(500).json({ error: 'Erro ao consultar o pagamento.' });
  }
}

// Divide "Nome Sobrenome" em first/last
function splitNome(nome) {
  const partes = String(nome || '').trim().split(/\s+/);
  const first = partes.shift() || 'Cliente';
  const last = partes.join(' ') || first;
  return { first, last };
}

// POST /api/loja/pagamentos/pix — cria intenção + pagamento PIX, guarda o QR
async function criarPix(req, res) {
  if (!mp.isConfigured()) return res.status(503).json({ error: 'Pagamento indisponível no momento.' });
  const items = store.parseItems(req.body.items);
  if (!items) return res.status(400).json({ error: 'Carrinho vazio ou inválido.' });
  try {
    const client = await store.getClient(req.customer.id);
    if (!client) return res.status(404).json({ error: 'Conta não encontrada.' });
    const [[conta]] = await db.query('SELECT email, cpf, pix_discount_percent FROM clients WHERE id = ?', [req.customer.id]);

    const linhas = await store.buildLines(items);
    const indisponivel = linhas.find(l => !l.ok);
    if (indisponivel) return res.status(400).json({ error: indisponivel.reason || 'Item indisponível.', itemId: indisponivel.id });

    const pixPct = resolvePixPercent(conta ? conta.pix_discount_percent : null, await getDescontoPix());
    const linhasPix = linhas.map(l => {
      const unitPrice = aplicaPix(l.unitPrice, pixPct);
      return Object.assign({}, l, { unitPrice, lineTotal: Number((unitPrice * l.qty).toFixed(2)) });
    });

    const subtotal = Number(linhasPix.reduce((s, l) => s + l.lineTotal, 0).toFixed(2));
    const metodo = store.metodoEntrega(req.body);
    const addr = store.effectiveAddress(client, req.body);
    const addressChanged = store.hasAddress(req.body);
    let fee = 0;
    if (metodo === 'entrega') {
      if (addr.city && !(await cidadeAtende(addr.city))) {
        return res.status(400).json({ error: 'Entregamos apenas em ' + (await getCidadeEntrega()) + '.', foraDeArea: true });
      }
      fee = await freteDoBairro(addr.neighborhood);
    }
    const total = Number((subtotal + fee).toFixed(2));
    if (total <= 0) return res.status(400).json({ error: 'Total inválido.' });

    // Persiste o endereço no cadastro só quando é entrega e foi editado
    if (metodo === 'entrega' && addressChanged) {
      await db.query(
        'UPDATE clients SET address=?, house_number=?, neighborhood=?, cep=?, city=? WHERE id=?',
        [addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, client.id]
      );
    }

    const snapshot = linhasPix.map(l => ({ id: l.id, qty: l.qty, unitPrice: l.unitPrice, costPrice: l.costPrice != null ? l.costPrice : null }));
    const externalReference = crypto.randomBytes(32).toString('hex');

    const [ins] = await db.query(
      `INSERT INTO payment_intents
       (client_id, external_reference, items_json, address, house_number, neighborhood, cep, city, subtotal, delivery_fee, total, status, delivery_method)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente', ?)`,
      [client.id, externalReference, JSON.stringify(snapshot), addr.address, addr.house_number, addr.neighborhood, addr.cep, addr.city, subtotal, fee, total, metodo]
    );

    let pix;
    try {
      const nome = splitNome(client.name);
      pix = await mp.criarPagamentoPix({
        externalReference, total, descricao: 'Beleza Multi Marcas — Pedido',
        payer: { email: (conta && conta.email) || undefined, first_name: nome.first, last_name: nome.last, cpf: conta && conta.cpf },
        expiracaoMin: 15,
      });
    } catch (e) {
      console.error('Erro ao criar PIX no MP:', e);
      await db.query("UPDATE payment_intents SET status='falhou' WHERE id=?", [ins.insertId]);
      return res.status(502).json({ error: 'Não foi possível gerar o PIX. Tente novamente.' });
    }

    await db.query(
      'UPDATE payment_intents SET mp_payment_id=?, pix_qr_code=?, pix_qr_base64=?, pix_expiration=? WHERE id=?',
      [String(pix.id), pix.qr_code, pix.qr_code_base64, pix.expiration, ins.insertId]
    );

    return res.status(201).json({ external_reference: externalReference });
  } catch (e) {
    console.error('Erro ao criar pagamento PIX:', e);
    return res.status(500).json({ error: 'Erro ao iniciar o PIX.' });
  }
}

// GET /api/loja/pagamentos/:ref/pix — QR + status (ownership)
async function pixDados(req, res) {
  const ref = req.params.ref;
  if (!/^[a-f0-9]{64}$/.test(ref)) return res.status(400).json({ error: 'Referência inválida.' });
  try {
    const [[intent]] = await db.query(
      'SELECT client_id, total, status, order_id, pix_qr_code, pix_qr_base64, pix_expiration FROM payment_intents WHERE external_reference = ?',
      [ref]
    );
    if (!intent || intent.client_id !== req.customer.id) return res.status(404).json({ error: 'Pagamento não encontrado.' });
    return res.json({
      qr_code: intent.pix_qr_code,
      qr_code_base64: intent.pix_qr_base64,
      total: intent.total,
      expiration: intent.pix_expiration,
      status: intent.status,
      orderId: intent.order_id || undefined,
    });
  } catch (e) {
    console.error('Erro ao buscar dados do PIX:', e);
    return res.status(500).json({ error: 'Erro ao buscar o PIX.' });
  }
}

module.exports = { criarPagamento, webhook, statusPagamento, criarPix, pixDados };
