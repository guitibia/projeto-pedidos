const db = require('../database/connection');
const multer = require('multer');
const { parseNfeXml } = require('../utils/nfe');
const { titleCasePtBr } = require('../utils/textcase');

const uploadXml = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } }).single('xml');

// POST /api/nf/preview — lê o XML e devolve a prévia (não grava nada)
function preview(req, res) {
  uploadXml(req, res, async function (err) {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 2MB, XML).' });
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo XML da nota.' });
    let nf;
    try { nf = parseNfeXml(req.file.buffer.toString('utf8')); }
    catch (e) { return res.status(400).json({ error: e.message || 'XML inválido.' }); }
    try {
      const [[dup]] = await db.query('SELECT id FROM nf_entradas WHERE chave = ?', [nf.chave]);
      for (const it of nf.itens) {
        const [[v]] = await db.query(
          'SELECT product_id FROM nf_item_vinculos WHERE emitente_cnpj = ? AND cprod = ?',
          [nf.emitente.cnpj, it.cprod]
        );
        it.sugestaoProductId = v ? v.product_id : null;
      }
      return res.json(Object.assign({}, nf, { jaImportada: !!dup }));
    } catch (e) { console.error('Erro preview NF:', e); return res.status(500).json({ error: 'Erro ao processar a nota.' }); }
  });
}

function toMysqlDate(s) {
  if (!s) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// POST /api/nf/importar — grava a nota + entradas de estoque (transação)
function importar(req, res) {
  uploadXml(req, res, async function (err) {
    if (err) return res.status(400).json({ error: 'Falha no upload (máx 2MB, XML).' });
    if (!req.file) return res.status(400).json({ error: 'Envie o arquivo XML da nota.' });
    let decisoes;
    try { decisoes = JSON.parse(req.body.decisoes || '{}'); } catch (_) { decisoes = {}; }
    const xml = req.file.buffer.toString('utf8');
    let nf;
    try { nf = parseNfeXml(xml); } catch (e) { return res.status(400).json({ error: e.message || 'XML inválido.' }); }

    const conn = await db.getConnection();
    try {
      await conn.beginTransaction();
      const [[dup]] = await conn.query('SELECT id FROM nf_entradas WHERE chave = ?', [nf.chave]);
      if (dup) { await conn.rollback(); return res.status(409).json({ error: 'Esta nota já foi importada.' }); }

      const [r] = await conn.query(
        'INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero, serie, valor_total, data_emissao, xml) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [nf.chave, nf.emitente.nome, nf.emitente.cnpj, nf.numero, nf.serie, nf.valorTotal, toMysqlDate(nf.dataEmissao), xml]
      );
      const nfId = r.insertId;

      for (const it of nf.itens) {
        const d = decisoes[it.cprod] || { acao: 'ignorar' };
        let productId = null;

        if (d.acao === 'vincular' && d.product_id) {
          productId = parseInt(d.product_id, 10) || null;
          if (productId) {
            const [[existe]] = await conn.query('SELECT id FROM products WHERE id = ?', [productId]);
            if (!existe) { await conn.rollback(); return res.status(400).json({ error: 'Produto vinculado inválido (item ' + it.cprod + ').' }); }
          }
        } else if (d.acao === 'criar' && d.novo) {
          const [pr] = await conn.query(
            'INSERT INTO products (name, cost, sale_value, franchise, code, ean, estoque, visivel_loja) VALUES (?, ?, ?, ?, ?, ?, 0, 0)',
            [titleCasePtBr(String(d.novo.name || it.nomeSugerido || it.descricao)).slice(0, 200),
             // custo = valor unitário REAL da nota de compra (proposital; difere do custo derivado do desconto de franquia)
             it.valorUnit,
             Number(d.novo.sale_value) || it.valorUnit,
             String(d.novo.franchise || 'Outros').slice(0, 60),
             String(d.novo.code || it.cprod).slice(0, 60),
             it.ean || null]
          );
          productId = pr.insertId;
        }

        await conn.query(
          'INSERT INTO nf_entrada_itens (nf_id, cprod, descricao, ncm, ean, quantidade, valor_unit, valor_total, product_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [nfId, it.cprod, it.descricao, it.ncm, it.ean || null, it.quantidade, it.valorUnit, it.valorTotal, productId]
        );

        if (productId) {
          const qtd = Math.max(0, Math.round(Number(it.quantidade) || 0));
          if (qtd > 0) {
            await conn.query('UPDATE products SET estoque = estoque + ? WHERE id = ?', [qtd, productId]);
            await conn.query(
              'INSERT INTO estoque_movimentacoes (product_id, tipo, quantidade, observacao, origem, nf_id) VALUES (?, ?, ?, ?, ?, ?)',
              [productId, 'Entrada', qtd, 'NF ' + nf.numero, 'NF', nfId]
            );
          }
          await conn.query(
            'INSERT INTO nf_item_vinculos (emitente_cnpj, cprod, product_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE product_id = VALUES(product_id)',
            [nf.emitente.cnpj, it.cprod, productId]
          );
          if (it.ean) {
            await conn.query("UPDATE products SET ean=? WHERE id=? AND (ean IS NULL OR ean='')", [it.ean, productId]);
          }
        }
      }

      // Conciliação opcional com os pedidos das clientes (não pode derrubar a importação).
      if (String(req.body.conciliar) === 'true' || String(req.body.conciliar) === '1') {
        try {
          await conn.query('SAVEPOINT sp_conc');
          const { aplicarConciliacao } = require('./demandaController');
          await aplicarConciliacao(conn, nfId, nf.emitente.cnpj);
        } catch (e) {
          console.error('Conciliação falhou (NF importada mesmo assim):', e);
          try { await conn.query('ROLLBACK TO SAVEPOINT sp_conc'); } catch (_) {}
        }
      }

      await conn.commit();
      return res.status(201).json({ ok: true, nfId, message: 'Nota importada e estoque atualizado.' });
    } catch (e) {
      await conn.rollback();
      console.error('Erro importar NF:', e);
      return res.status(500).json({ error: 'Erro ao importar a nota.' });
    } finally { conn.release(); }
  });
}

async function listar(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT n.id, n.chave, n.emitente_nome, n.numero, n.valor_total, n.data_emissao, n.created_at,
              (SELECT COUNT(*) FROM nf_entrada_itens i WHERE i.nf_id = n.id) AS qtd_itens
       FROM nf_entradas n ORDER BY n.created_at DESC LIMIT 200`);
    return res.json(rows);
  } catch (e) { console.error('Erro listar NF:', e); return res.status(500).json({ error: 'Erro ao listar notas.' }); }
}

async function detalhe(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[nf]] = await db.query('SELECT id, chave, emitente_nome, emitente_cnpj, numero, serie, valor_total, data_emissao, created_at FROM nf_entradas WHERE id = ?', [id]);
    if (!nf) return res.status(404).json({ error: 'Nota não encontrada.' });
    const [itens] = await db.query(
      `SELECT i.id, i.cprod, i.descricao, i.ncm, i.quantidade, i.valor_unit, i.valor_total, i.product_id, p.name AS produto_nome
       FROM nf_entrada_itens i LEFT JOIN products p ON p.id = i.product_id WHERE i.nf_id = ? ORDER BY i.id`, [id]);
    return res.json(Object.assign({}, nf, { itens }));
  } catch (e) { console.error('Erro detalhe NF:', e); return res.status(500).json({ error: 'Erro.' }); }
}

// DELETE /api/nf/:id  — apaga a nota e devolve o estoque que ela somou
async function remover(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    // FOR UPDATE: bloqueia a linha da NF para que dois DELETE concorrentes
    // (duplo-clique/2 abas) não devolvam o estoque em dobro — o 2º espera e cai no 404.
    const [[nf]] = await conn.query('SELECT id FROM nf_entradas WHERE id = ? FOR UPDATE', [id]);
    if (!nf) { await conn.rollback(); return res.status(404).json({ error: 'Nota não encontrada.' }); }

    const [ret] = await conn.query(
      "SELECT product_id, SUM(quantidade) q FROM estoque_movimentacoes WHERE origem='NF' AND nf_id = ? AND product_id IS NOT NULL GROUP BY product_id",
      [id]);

    let unidadesDevolvidas = 0;
    let algumJaMovimentado = false;
    for (const r of ret) {
      const qtd = Number(r.q) || 0;
      unidadesDevolvidas += qtd;
      const [[p]] = await conn.query('SELECT estoque FROM products WHERE id = ?', [r.product_id]);
      if (p && Number(p.estoque) < qtd) algumJaMovimentado = true;
      await conn.query('UPDATE products SET estoque = GREATEST(0, estoque - ?) WHERE id = ?', [qtd, r.product_id]);
    }

    await conn.query("DELETE FROM estoque_movimentacoes WHERE origem='NF' AND nf_id = ?", [id]);
    await conn.query('DELETE FROM nf_entrada_itens WHERE nf_id = ?', [id]);
    await conn.query('DELETE FROM nf_entradas WHERE id = ?', [id]);

    await conn.commit();
    return res.json({ ok: true, produtosAfetados: ret.length, unidadesDevolvidas, algumJaMovimentado });
  } catch (e) {
    await conn.rollback();
    console.error('Erro ao excluir NF:', e);
    return res.status(500).json({ error: 'Erro ao excluir a nota.' });
  } finally {
    conn.release();
  }
}

module.exports = { uploadXml, preview, importar, listar, detalhe, remover };
