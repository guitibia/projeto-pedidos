const { XMLParser } = require('fast-xml-parser');
const { titleCasePtBr } = require('./textcase');

// Lê o XML de uma NF-e (procNFe ou NFe) e devolve os campos relevantes.
// Lança Error se não for uma NF-e válida.
function parseNfeXml(xml) {
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  let obj;
  try { obj = parser.parse(xml); } catch (e) { throw new Error('XML inválido.'); }

  const infNFe = (obj && ((obj.nfeProc && obj.nfeProc.NFe && obj.nfeProc.NFe.infNFe) ||
                          (obj.NFe && obj.NFe.infNFe))) || null;
  if (!infNFe) throw new Error('XML não é uma NF-e válida.');

  const chave = String(infNFe['@_Id'] || '').replace(/^NFe/i, '').replace(/\D/g, '');
  if (chave.length !== 44) throw new Error('Chave de acesso inválida.');

  const ide = infNFe.ide || {};
  const emit = infNFe.emit || {};
  const icmsTot = (infNFe.total && infNFe.total.ICMSTot) || {};

  let det = infNFe.det || [];
  det = Array.isArray(det) ? det : [det];
  const itens = det.map(function (d) {
    const p = (d && d.prod) || {};
    const eanRaw = String(p.cEAN != null ? p.cEAN : '').trim();
    return {
      cprod: String(p.cProd != null ? p.cProd : ''),
      descricao: String(p.xProd != null ? p.xProd : ''),
      nomeSugerido: titleCasePtBr(String(p.xProd != null ? p.xProd : '')),
      ncm: String(p.NCM != null ? p.NCM : ''),
      ean: /^\d{8,14}$/.test(eanRaw) ? eanRaw : '',
      quantidade: Number(p.qCom) || 0,
      valorUnit: Number(p.vUnCom) || 0,
      valorTotal: Number(p.vProd) || 0,
    };
  });

  return {
    chave,
    numero: String(ide.nNF != null ? ide.nNF : ''),
    serie: String(ide.serie != null ? ide.serie : ''),
    dataEmissao: ide.dhEmi || ide.dEmi || null,
    emitente: { nome: String(emit.xNome || ''), cnpj: String(emit.CNPJ || '').replace(/\D/g, '') },
    valorTotal: Number(icmsTot.vNF) || 0,
    itens,
  };
}

module.exports = { parseNfeXml };
