const db = require('../database/connection');

// POST /api/products
async function createProduct(req, res) {
  const { name, cost, franchise, code, promotionPrice } = req.body;

  if (!name || cost == null || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }

  try {
    const [result] = await db.query(
      'INSERT INTO products (name, cost, franchise, code, promotion_price) VALUES (?, ?, ?, ?, ?)',
      [name, cost, franchise, code, promotionPrice || null]
    );
    return res.status(201).json({ message: 'Produto cadastrado com sucesso!', productId: result.insertId });
  } catch (err) {
    console.error('Erro ao criar produto:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar produto.' });
  }
}

// GET /api/products  (filtra por ?franchise=)
async function listProducts(req, res) {
  const { franchise } = req.query;
  if (!franchise) {
    return res.status(400).json({ error: 'Parâmetro franchise é obrigatório.' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE franchise = ? ORDER BY name', [franchise]);
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    return res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
}

// GET /api/products/search?code=
async function searchProductByCode(req, res) {
  const { code } = req.query;
  if (!code) {
    return res.status(400).json({ error: 'Parâmetro code é obrigatório.' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE code = ?', [code]);
    if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    const p = rows[0];
    return res.json({ id: p.id, name: p.name, cost: p.cost, code: p.code });
  } catch (err) {
    console.error('Erro ao buscar produto por código:', err);
    return res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
}

// GET /api/products/:id  — DEVE vir depois de /search no router
async function getProductById(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: 'ID inválido.' });
  }
  try {
    const [rows] = await db.query('SELECT * FROM products WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    const p = rows[0];
    return res.json({ id: p.id, name: p.name, cost: p.cost, franchise: p.franchise, code: p.code });
  } catch (err) {
    console.error('Erro ao buscar produto:', err);
    return res.status(500).json({ error: 'Erro ao buscar produto.' });
  }
}

// GET /api/franchises
async function listFranchises(req, res) {
  try {
    const [rows] = await db.query('SELECT DISTINCT franchise FROM products ORDER BY franchise');
    return res.json(rows.map(r => r.franchise));
  } catch (err) {
    console.error('Erro ao buscar franquias:', err);
    return res.status(500).json({ error: 'Erro ao buscar franquias.' });
  }
}

module.exports = { createProduct, listProducts, searchProductByCode, getProductById, listFranchises };
