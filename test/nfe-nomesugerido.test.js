const { test } = require('node:test');
const assert = require('node:assert');
const { parseNfeXml } = require('../src/utils/nfe');

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe Id="NFe35240101010101010101010101010101010101010101">
  <ide><nNF>123</nNF><serie>1</serie><dhEmi>2024-01-01T00:00:00-03:00</dhEmi></ide>
  <emit><xNome>FORNECEDOR TESTE</xNome><CNPJ>11111111000111</CNPJ></emit>
  <det nItem="1"><prod>
    <cProd>ABC1</cProd>
    <xProd>THE BLEND EDP CARDAMOM 100ml</xProd>
    <NCM>33030010</NCM>
    <cEAN>7891111111111</cEAN>
    <qCom>2</qCom><vUnCom>10.00</vUnCom><vProd>20.00</vProd>
  </prod></det>
  <total><ICMSTot><vNF>20.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;

test('parseNfeXml: item traz nomeSugerido em title case e descricao crua', () => {
  const nf = parseNfeXml(XML);
  const it = nf.itens[0];
  assert.strictEqual(it.descricao, 'THE BLEND EDP CARDAMOM 100ml');
  assert.strictEqual(it.nomeSugerido, 'The Blend Edp Cardamom 100ml');
});
