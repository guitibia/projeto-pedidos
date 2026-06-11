const db = require('../database/connection');

// POST /api/promissorias
async function createPromissoria(req, res) {
  const { numero_nf, data_emissao, valor_nf, parcelas, valor_parcela, data_vencimento } = req.body;

  if (!numero_nf || !data_emissao || !valor_nf || !valor_parcela || !data_vencimento || !parcelas) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios.' });
  }

  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();

    const [nfResult] = await conn.query(
      'INSERT INTO notas_fiscais (numero, data_emissao, valor) VALUES (?, ?, ?)',
      [numero_nf, data_emissao, valor_nf]
    );
    const notaFiscalId = nfResult.insertId;

    const [promResult] = await conn.query(
      'INSERT INTO promissorias (nota_fiscal_id, valor, data_vencimento, parcelas) VALUES (?, ?, ?, ?)',
      [notaFiscalId, valor_parcela * parcelas, data_vencimento, parcelas]
    );
    const promissoriaId = promResult.insertId;

    for (let i = 0; i < parcelas; i++) {
      const dataAtual = new Date(data_vencimento);
      dataAtual.setUTCMonth(dataAtual.getUTCMonth() + i);
      await conn.query(
        'INSERT INTO parcelas (promissoria_id, numero_parcela, data_vencimento, valor) VALUES (?, ?, ?, ?)',
        [promissoriaId, i + 1, dataAtual.toISOString().split('T')[0], valor_parcela]
      );
    }

    await conn.commit();
    return res.status(201).json({ message: 'Promissória cadastrada com sucesso!', promissoriaId });
  } catch (err) {
    await conn.rollback();
    console.error('Erro ao criar promissória:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar promissória.' });
  } finally {
    conn.release();
  }
}

// GET /api/promissorias
async function listPromissorias(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT p.*, nf.numero AS numero_nf, parc.numero_parcela, parc.status AS parcela_status, parc.data_vencimento AS parcela_vencimento
      FROM promissorias p
      JOIN notas_fiscais nf ON nf.id = p.nota_fiscal_id
      LEFT JOIN parcelas parc ON parc.promissoria_id = p.id
      ORDER BY p.id, parc.numero_parcela
    `);

    const promissorias = rows.reduce((acc, row) => {
      let prom = acc.find(p => p.id === row.id);
      if (!prom) {
        prom = { id: row.id, valor: row.valor, numero_nf: row.numero_nf, parcelas: [] };
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
