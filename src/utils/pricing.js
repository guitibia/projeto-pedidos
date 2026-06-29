const db = require('../database/connection');

function round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; }

async function getDescontoGlobal() {
  try {
    const [rows] = await db.query(
      "SELECT skey, svalue FROM store_settings WHERE skey IN ('desconto_global_ativo','desconto_global_percent')"
    );
    const m = {};
    rows.forEach(function (r) { m[r.skey] = r.svalue; });
    return { ativo: m.desconto_global_ativo === '1', percent: Number(m.desconto_global_percent) || 0 };
  } catch (_) { return { ativo: false, percent: 0 }; }
}

// Regra: promo própria vence; senão global (se ativo) nos sem promo; senão sale_value.
function precoEfetivo(saleValue, promotionPrice, global) {
  const base = Number(saleValue) || 0;
  if (promotionPrice != null && Number(promotionPrice) > 0) return Number(promotionPrice);
  if (global && global.ativo && global.percent > 0) return round2(base * (1 - global.percent / 100));
  return base;
}

module.exports = { getDescontoGlobal, precoEfetivo, round2 };
