const db = require('../database/connection');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { fetchImageBuffer, processAndSaveProductImage, UPLOAD_DIR } = require('../utils/imageProcessor');

const uploadImage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /image\/(jpe?g|png|webp|gif)/.test(file.mimetype))
}).single('image');

// Busca o percentual de desconto da franquia (0 se não houver) e calcula o custo
async function calcCost(conn, franchise, saleValue) {
  const [[row]] = await conn.query('SELECT percent FROM franchise_discounts WHERE franchise = ?', [franchise]);
  const percent = row ? parseFloat(row.percent) : 0;
  return Math.round(saleValue * (1 - percent / 100) * 100) / 100;
}

// POST /api/products
async function createProduct(req, res) {
  const { name, saleValue, franchise, code, promotionPrice, estoqueInicial, description } = req.body;

  if (!name || saleValue == null || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos obrigatórios devem ser preenchidos.' });
  }
  const sv = parseFloat(saleValue);
  if (isNaN(sv) || sv < 0) {
    return res.status(400).json({ error: 'Valor de venda inválido.' });
  }

  const qtdInicial = parseInt(estoqueInicial) || 0;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cost = await calcCost(conn, franchise, sv);

    const [result] = await conn.query(
      'INSERT INTO products (name, cost, sale_value, franchise, code, promotion_price, estoque, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, cost, sv, franchise, code, promotionPrice || null, qtdInicial, description ?? null]
    );
    const productId = result.insertId;

    if (qtdInicial > 0) {
      await conn.query(
        'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao) VALUES (?, ?, ?, ?)',
        [productId, 'Entrada', qtdInicial, 'Estoque inicial']
      );
    }

    await conn.commit();
    return res.status(201).json({ message: 'Produto cadastrado com sucesso!', productId });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao criar produto:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar produto.' });
  } finally {
    conn.release();
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
    return res.json({ id: p.id, name: p.name, cost: p.cost, sale_value: p.sale_value, code: p.code, promotion_price: p.promotion_price ?? null, description: p.description ?? null, image: p.image ?? null });
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
    return res.json({ id: p.id, name: p.name, cost: p.cost, sale_value: p.sale_value, franchise: p.franchise, code: p.code, promotion_price: p.promotion_price ?? null, description: p.description ?? null, image: p.image ?? null, ean: p.ean ?? null });
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

// GET /api/products/all
async function listAllProducts(req, res) {
  try {
    const [rows] = await db.query('SELECT * FROM products ORDER BY franchise, name');
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao listar produtos:', err);
    return res.status(500).json({ error: 'Erro ao buscar produtos.' });
  }
}

// PUT /api/products/:id
async function updateProduct(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  const { name, sale_value, franchise, code, promotion_price, description, ean } = req.body;
  if (!name || sale_value == null || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }
  const sv = parseFloat(sale_value);
  if (isNaN(sv) || sv < 0) {
    return res.status(400).json({ error: 'Valor de venda inválido.' });
  }

  const promoVal = promotion_price != null && promotion_price !== ''
    ? parseFloat(promotion_price)
    : null;

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const cost = await calcCost(conn, franchise, sv);

    const [result] = await conn.query(
      'UPDATE products SET name=?, cost=?, sale_value=?, franchise=?, code=?, promotion_price=?, description=?, ean=? WHERE id=?',
      [name, cost, sv, franchise, code, promoVal, description ?? null, (ean && String(ean).trim()) ? String(ean).trim().slice(0,14) : null, id]
    );
    if (result.affectedRows === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    await conn.commit();
    return res.json({ message: 'Produto atualizado com sucesso.' });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao atualizar produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar produto.' });
  } finally {
    conn.release();
  }
}

// Troca products.image por relPath e apaga a imagem local anterior.
// Retorna false se o produto não existe.
async function replaceProductImage(id, relPath) {
  const [[old]] = await db.query('SELECT image FROM products WHERE id = ?', [id]);
  const [r] = await db.query('UPDATE products SET image = ? WHERE id = ?', [relPath, id]);
  if (r.affectedRows === 0) return false;
  if (old && old.image) {
    const oldAbs = path.resolve(__dirname, '..', 'public', '.' + old.image);
    const uploadAbs = path.resolve(UPLOAD_DIR);
    if (oldAbs.startsWith(uploadAbs + path.sep)) fs.unlink(oldAbs, () => {});
  }
  return true;
}

// remove o arquivo recém-criado quando o produto não existe (evita órfão)
function unlinkRel(relPath) {
  fs.unlink(path.resolve(__dirname, '..', 'public', '.' + relPath), () => {});
}

// POST /api/products/:id/image  (upload de arquivo)
function setProductImage(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  uploadImage(req, res, async (err) => {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 4MB, imagem).' });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada.' });
    let rel;
    try {
      rel = await processAndSaveProductImage(req.file.buffer, id);
    } catch (e) {
      console.error('Erro ao processar imagem (upload):', e.message);
      return res.status(400).json({ error: 'Arquivo não parece ser uma imagem válida.' });
    }
    try {
      const found = await replaceProductImage(id, rel);
      if (!found) { unlinkRel(rel); return res.status(404).json({ error: 'Produto não encontrado.' }); }
      return res.json({ message: 'Imagem atualizada.', image: rel });
    } catch (e) {
      console.error('Erro ao salvar imagem (upload):', e);
      return res.status(500).json({ error: 'Erro ao salvar imagem.' });
    }
  });
}

// PUT /api/products/:id/image-url  (colar URL)
async function setProductImageUrl(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const url = String(req.body.url || '').trim();
  if (!/^https?:\/\/.+/i.test(url)) return res.status(400).json({ error: 'Informe uma URL de imagem válida (http/https).' });
  let rel;
  try {
    const buffer = await fetchImageBuffer(url);
    rel = await processAndSaveProductImage(buffer, id);
  } catch (e) {
    console.error('Erro ao baixar/processar imagem por URL:', e.message);
    return res.status(422).json({ error: 'Não consegui baixar essa imagem. Verifique o link ou tente outro.' });
  }
  try {
    const found = await replaceProductImage(id, rel);
    if (!found) { unlinkRel(rel); return res.status(404).json({ error: 'Produto não encontrado.' }); }
    return res.json({ message: 'Imagem atualizada.', image: rel });
  } catch (e) {
    console.error('Erro ao gravar imagem por URL:', e);
    return res.status(500).json({ error: 'Erro ao salvar imagem.' });
  }
}

// DELETE /api/products/:id
async function deleteProduct(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const [result] = await db.query('DELETE FROM products WHERE id=?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json({ message: 'Produto excluído com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir produto:', err);
    return res.status(500).json({ error: 'Erro ao excluir produto.' });
  }
}

module.exports = { createProduct, listProducts, listAllProducts, searchProductByCode, getProductById, listFranchises, updateProduct, deleteProduct, setProductImage, setProductImageUrl };
