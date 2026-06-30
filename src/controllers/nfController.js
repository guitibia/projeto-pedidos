const db = require('../database/connection');
const multer = require('multer');
const { parseNfeXml } = require('../utils/nfe');

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

module.exports = { uploadXml, preview };
