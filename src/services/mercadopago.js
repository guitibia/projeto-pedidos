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
  const res = await pref.create({
    body: {
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
      auto_return: 'approved',
      notification_url: base + '/api/loja/pagamentos/webhook',
    },
  });
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

module.exports = { isConfigured, criarPreferencia, buscarPagamento, buscarPagamentoPorReferencia };
