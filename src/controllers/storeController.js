const db = require('../database/connection');
const { getCidadeEntrega, getFretePadrao } = require('../utils/delivery');

const SORTS = {
  recentes:   'p.created_at DESC',
  preco_asc:  'COALESCE(p.promotion_price, p.sale_value) ASC',
  preco_desc: 'COALESCE(p.promotion_price, p.sale_value) DESC',
  nome:       'p.name ASC',
};

async function listProdutos(req, res) {
  const { franchise, q } = req.query;
  const sort = SORTS[req.query.sort] || SORTS.recentes;
  const where = [], params = [];
  if (franchise) { where.push('p.franchise = ?'); params.push(franchise); }
  if (q) { where.push('(p.name LIKE ? OR p.code LIKE ?)'); params.push('%' + q + '%', '%' + q + '%'); }
  const sql = `SELECT id, name, franchise, code, sale_value, promotion_price, image, estoque
               FROM products p ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
               ORDER BY ${sort}`;
  try {
    const [rows] = await db.query(sql, params);
    return res.json(rows);
  } catch (e) { console.error('Erro loja/produtos:', e); return res.status(500).json({ error: 'Erro ao buscar produtos.' }); }
}

async function getProduto(req, res) {
  if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'ID inválido.' });
  const id = parseInt(req.params.id, 10);
  try {
    const [[p]] = await db.query(
      'SELECT id, name, franchise, code, sale_value, promotion_price, image, description, estoque FROM products WHERE id = ?', [id]);
    if (!p) return res.status(404).json({ error: 'Produto não encontrado.' });
    const [relacionados] = await db.query(
      `SELECT id, name, franchise, sale_value, promotion_price, image, estoque
       FROM products WHERE franchise = ? AND id <> ? ORDER BY RAND() LIMIT 4`, [p.franchise, id]);
    return res.json({ ...p, relacionados });
  } catch (e) { console.error('Erro loja/produto:', e); return res.status(500).json({ error: 'Erro ao buscar produto.' }); }
}

async function listFranquias(req, res) {
  try {
    const [rows] = await db.query('SELECT DISTINCT franchise FROM products ORDER BY franchise');
    return res.json(rows.map(r => r.franchise));
  } catch (e) { console.error('Erro loja/franquias:', e); return res.status(500).json({ error: 'Erro ao buscar franquias.' }); }
}

async function entregaConfig(req, res) {
  try {
    const [bairros] = await db.query('SELECT bairro, fee FROM delivery_zones WHERE active = 1 ORDER BY bairro');
    return res.json({ cidade: await getCidadeEntrega(), fretePadrao: await getFretePadrao(), bairros });
  } catch (e) { console.error('Erro entregaConfig:', e); return res.status(500).json({ error: 'Erro.' }); }
}

module.exports = { listProdutos, getProduto, listFranquias, entregaConfig };
