const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

function isConfigured() {
  return !!process.env.MP_ACCESS_TOKEN;
}

function getClient() {
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

function appUrl() {
  return process.env.APP_URL || 'http://localhost:3000';
}

// Cria a preferência de Checkout Pro (PIX + cartão habilitados por padrão no MP).
async function criarPreferencia({ externalReference, total, descricao }) {
  const pref = new Preference(getClient());
  const base = appUrl();
  const publico = /^https:\/\//i.test(base); // MP exige URLs públicas (https) p/ auto_return/webhook
  const body = {
    items: [{
      id: externalReference,
      title: descricao || 'Beleza Multi Marcas — Pedido',
      quantity: 1,
      unit_price: Number(total),
      currency_id: 'BRL',
    }],
    external_reference: externalReference,
    back_urls: {
      success: base + '/loja/pagamento-retorno.html',
      failure: base + '/loja/pagamento-retorno.html',
      pending: base + '/loja/pagamento-retorno.html',
    },
  };
  // auto_return e notification_url só com URL pública (o MP rejeita localhost).
  // Em local, a confirmação acontece pela página de retorno (buscarPagamentoPorReferencia).
  if (publico) {
    body.auto_return = 'approved';
    body.notification_url = base + '/api/loja/pagamentos/webhook';
  }
  const res = await pref.create({ body });
  return { id: res.id, init_point: res.init_point };
}

// Consulta um pagamento pelo id (fonte de verdade — não confiar no webhook).
async function buscarPagamento(paymentId) {
  const pay = new Payment(getClient());
  const res = await pay.get({ id: paymentId });
  return {
    status: res.status,                        // approved | rejected | cancelled | pending | in_process
    transaction_amount: res.transaction_amount,
    external_reference: res.external_reference,
    payment_type_id: res.payment_type_id,      // credit_card | debit_card | bank_transfer | account_money | ...
  };
}

// Busca o pagamento pelo external_reference (fallback quando o webhook não chegou,
// ex.: notification_url inacessível em ambiente local). Prefere um aprovado.
async function buscarPagamentoPorReferencia(externalReference) {
  const pay = new Payment(getClient());
  const r = await pay.search({ options: { external_reference: externalReference } });
  const results = (r && r.results) || [];
  if (!results.length) return null;
  const chosen = results.find(p => p.status === 'approved') || results[results.length - 1];
  return {
    id: chosen.id,
    status: chosen.status,
    transaction_amount: chosen.transaction_amount,
    external_reference: chosen.external_reference,
    payment_type_id: chosen.payment_type_id,
  };
}

// Formata uma data em ISO 8601 com offset local (ex.: 2026-06-26T12:30:00.000-03:00)
function isoComOffset(d) {
  const p = n => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sinal = off >= 0 ? '+' : '-';
  const oh = p(Math.floor(Math.abs(off) / 60));
  const om = p(Math.abs(off) % 60);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
    'T' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds()) +
    '.000' + sinal + oh + ':' + om;
}

// Cria um pagamento PIX (transparente). Retorna o QR (copia-e-cola + imagem base64).
async function criarPagamentoPix({ externalReference, total, descricao, payer, expiracaoMin }) {
  const pay = new Payment(getClient());
  const exp = new Date(Date.now() + (expiracaoMin || 15) * 60 * 1000);
  const res = await pay.create({
    body: {
      transaction_amount: Number(total),
      description: descricao || 'Beleza Multi Marcas — Pedido',
      payment_method_id: 'pix',
      external_reference: externalReference,
      date_of_expiration: isoComOffset(exp),
      payer: {
        email: payer.email,
        first_name: payer.first_name || undefined,
        last_name: payer.last_name || undefined,
        identification: payer.cpf ? { type: 'CPF', number: String(payer.cpf).replace(/\D/g, '') } : undefined,
      },
    },
  });
  const td = (res.point_of_interaction && res.point_of_interaction.transaction_data) || {};
  return {
    id: res.id,
    status: res.status,
    qr_code: td.qr_code || null,            // copia-e-cola
    qr_code_base64: td.qr_code_base64 || null, // imagem PNG em base64
    expiration: exp,
  };
}

module.exports = { isConfigured, criarPreferencia, buscarPagamento, buscarPagamentoPorReferencia, criarPagamentoPix };
