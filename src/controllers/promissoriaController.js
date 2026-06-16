const db = require('../database/connection');

// POST /api/promissorias
async function createPromissoria(req, res) {
  const { fornecedor, itens } = req.body;

  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'Informe ao menos uma promissória.' });
  }
  for (const item of itens) {
    if (!item.valor || !item.data_vencimento) {
      return res.status(400).json({ error: 'Preencha valor e data em todos os itens.' });
    }
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    for (const item of itens) {
      const [nfResult] = await conn.query(
        'INSERT INTO notas_fiscais (numero, fornecedor, data_emissao, valor) VALUES (?, ?, ?, ?)',
        [null, fornecedor || null, null, item.valor]
      );
      const [promResult] = await conn.query(
        'INSERT INTO promissorias (nota_fiscal_id, valor, data_vencimento, parcelas) VALUES (?, ?, ?, ?)',
        [nfResult.insertId, item.valor, item.data_vencimento, 1]
      );
      await conn.query(
        'INSERT INTO parcelas (promissoria_id, numero_parcela, data_vencimento, valor) VALUES (?, ?, ?, ?)',
        [promResult.insertId, 1, item.data_vencimento, item.valor]
      );
    }

    await conn.commit();
    return res.status(201).json({ message: `${itens.length} promissória(s) cadastrada(s) com sucesso!` });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao criar promissórias:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar promissórias.' });
  } finally {
    conn.release();
  }
}

// GET /api/promissorias
async function listPromissorias(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT p.*, nf.numero AS numero_nf, nf.fornecedor, nf.data_emissao, parc.numero_parcela, parc.status AS parcela_status, parc.data_vencimento AS parcela_vencimento
      FROM promissorias p
      JOIN notas_fiscais nf ON nf.id = p.nota_fiscal_id
      LEFT JOIN parcelas parc ON parc.promissoria_id = p.id
      ORDER BY p.id, parc.numero_parcela
    `);

    const promissorias = rows.reduce((acc, row) => {
      let prom = acc.find(p => p.id === row.id);
      if (!prom) {
        prom = { id: row.id, valor: row.valor, numero_nf: row.numero_nf, fornecedor: row.fornecedor, data_emissao: row.data_emissao, parcelas: [] };
        acc.push(prom);
      }
      if (row.numero_parcela) {
        prom.parcelas.push({
          numero: row.numero_parcela,
          status: row.parcela_status,
          data_vencimento: row.parcela_vencimento
        });
      }
      return acc;
    }, []);

    return res.json(promissorias);
  } catch (err) {
    console.error('Erro ao listar promissórias:', err);
    return res.status(500).json({ error: 'Erro ao buscar promissórias.' });
  }
}

// GET /api/promissorias/:id/parcelas
async function listParcelas(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const [rows] = await db.query('SELECT * FROM parcelas WHERE promissoria_id = ?', [id]);
    return res.json(rows);
  } catch (err) {
    console.error('Erro ao buscar parcelas:', err);
    return res.status(500).json({ error: 'Erro ao buscar parcelas.' });
  }
}

// PUT /api/promissorias/:promissoriaId/parcelas/:parcelaId
async function updateParcelaStatus(req, res) {
  const promissoriaId = parseInt(req.params.promissoriaId);
  const parcelaId = parseInt(req.params.parcelaId);

  if (!Number.isInteger(promissoriaId) || !Number.isInteger(parcelaId)) {
    return res.status(400).json({ error: 'IDs inválidos.' });
  }

  const { status } = req.body;
  if (!status || !['Pago', 'Pendente'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido. Use "Pago" ou "Pendente".' });
  }

  try {
    const [result] = await db.query(
      'UPDATE parcelas SET status = ? WHERE promissoria_id = ? AND numero_parcela = ?',
      [status, promissoriaId, parcelaId]
    );

    if (result.affectedRows === 0) return res.status(404).json({ error: 'Parcela não encontrada.' });
    return res.json({ message: 'Status da parcela atualizado com sucesso.' });
  } catch (err) {
    console.error('Erro ao atualizar parcela:', err);
    return res.status(500).json({ error: 'Erro ao atualizar parcela.' });
  }
}

// DELETE /api/promissorias/:id
async function deletePromissoria(req, res) {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const [result] = await db.query('DELETE FROM promissorias WHERE id = ?', [id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Promissória não encontrada.' });
    return res.json({ message: 'Promissória excluída com sucesso.' });
  } catch (err) {
    console.error('Erro ao excluir promissória:', err);
    return res.status(500).json({ error: 'Erro ao excluir promissória.' });
  }
}

module.exports = { createPromissoria, listPromissorias, listParcelas, updateParcelaStatus, deletePromissoria };
