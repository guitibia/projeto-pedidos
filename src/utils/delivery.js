const db = require('../database/connection');

function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
async function getSetting(key, def) {
  try {
    const [[row]] = await db.query('SELECT svalue FROM store_settings WHERE skey = ?', [key]);
    return row && row.svalue != null ? row.svalue : def;
  } catch (_) { return def; }
}
async function getCidadeEntrega() { return getSetting('cidade_entrega', 'São João da Boa Vista'); }
async function getEnderecoRetirada() { return getSetting('endereco_retirada', ''); }
async function getFretePadrao() { return Number(await getSetting('frete_padrao', '15')) || 0; }
async function cidadeAtende(cidade) {
  return normalizar(cidade) === normalizar(await getCidadeEntrega());
}
async function freteDoBairro(bairro) {
  const n = normalizar(bairro);
  if (n) {
    const [zonas] = await db.query('SELECT bairro, fee FROM delivery_zones WHERE active = 1');
    for (const z of zonas) { if (normalizar(z.bairro) === n) return Number(z.fee) || 0; }
  }
  return getFretePadrao();
}
// Best-effort: ao cadastrar um cliente da cidade de entrega, garante que o
// bairro dele exista nas zonas (com o frete padrão), pra você revisar depois.
// Nunca lança — não pode quebrar o cadastro.
async function garantirZonaBairro(bairro, cidade) {
  try {
    const n = normalizar(bairro);
    if (!n) return;
    if (!(await cidadeAtende(cidade))) return;
    const [zonas] = await db.query('SELECT bairro FROM delivery_zones');
    for (const z of zonas) { if (normalizar(z.bairro) === n) return; } // já existe (normalizado)
    const fee = await getFretePadrao();
    await db.query('INSERT INTO delivery_zones (bairro, fee) VALUES (?, ?)', [String(bairro).trim(), fee]);
  } catch (_) { /* best-effort: nunca quebra o cadastro */ }
}

module.exports = { normalizar, getSetting, getCidadeEntrega, getEnderecoRetirada, getFretePadrao, cidadeAtende, freteDoBairro, garantirZonaBairro };
