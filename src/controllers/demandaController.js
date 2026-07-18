const db = require('../database/connection');
const { conciliar } = require('../services/conciliacaoNf');

// POST /api/demanda
async function criarPedido(req, res) {
  const clientId = parseInt(req.body.client_id, 10);
  if (!Number.isInteger(clientId)) return res.status(400).json({ error: 'Cliente inválido.' });
  const obs = req.body.observacao ? String(req.body.observacao).slice(0, 255) : null;
  try {
    const [[cli]] = await db.query('SELECT id FROM clients WHERE id = ?', [clientId]);
    if (!cli) return res.status(400).json({ error: 'Cliente não encontrado.' });
    const [r] = await db.query('INSERT INTO demanda_pedidos (client_id, observacao) VALUES (?, ?)', [clientId, obs]);
    return res.status(201).json({ id: r.insertId });
  } catch (e) { console.error('criarPedido', e); return res.status(500).json({ error: 'Erro ao criar pedido.' }); }
}

// GET /api/demanda
async function listarPedidos(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT dp.id, dp.client_id, c.name AS client_name, dp.observacao, dp.status, dp.created_at,
              (SELECT COUNT(*) FROM demanda_itens i WHERE i.pedido_id = dp.id) AS qtd_itens
       FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id
       ORDER BY dp.created_at DESC LIMIT 300`);
    return res.json(rows);
  } catch (e) { console.error('listarPedidos', e); return res.status(500).json({ error: 'Erro ao listar.' }); }
}

// GET /api/demanda/:id
async function getPedido(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[ped]] = await db.query(
      'SELECT dp.id, dp.client_id, c.name AS client_name, c.phone, dp.observacao, dp.status, dp.created_at FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id WHERE dp.id = ?', [id]);
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [itens] = await db.query(
      'SELECT id, fornecedor_cnpj, fornecedor_nome, codigo, nome, qtd_pedida, qtd_recebida, preco_venda, product_id, status, order_id FROM demanda_itens WHERE pedido_id = ? ORDER BY id', [id]);
    return res.json(Object.assign({}, ped, { itens }));
  } catch (e) { console.error('getPedido', e); return res.status(500).json({ error: 'Erro.' }); }
}

// POST /api/demanda/:id/itens
async function addItem(req, res) {
  const pedidoId = parseInt(req.params.id, 10);
  if (!Number.isInteger(pedidoId)) return res.status(400).json({ error: 'Pedido inválido.' });
  const b = req.body || {};
  const codigo = String(b.codigo || '').trim();
  const qtd = parseInt(b.qtd_pedida, 10);
  if (!codigo) return res.status(400).json({ error: 'Informe o código do produto.' });
  if (!Number.isInteger(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const preco = b.preco_venda == null || b.preco_venda === '' ? null : Number(b.preco_venda);
  if (preco != null && (isNaN(preco) || preco < 0)) return res.status(400).json({ error: 'Preço inválido.' });
  const cnpj = b.fornecedor_cnpj ? String(b.fornecedor_cnpj).replace(/\D/g, '').slice(0, 14) : null;
  try {
    const [[ped]] = await db.query('SELECT id FROM demanda_pedidos WHERE id = ?', [pedidoId]);
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [r] = await db.query(
      'INSERT INTO demanda_itens (pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, nome, qtd_pedida, preco_venda) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [pedidoId, cnpj || null, b.fornecedor_nome ? String(b.fornecedor_nome).slice(0, 160) : null,
       codigo.slice(0, 60), b.nome ? String(b.nome).slice(0, 200) : null, qtd, preco]);
    return res.status(201).json({ id: r.insertId });
  } catch (e) { console.error('addItem', e); return res.status(500).json({ error: 'Erro ao adicionar item.' }); }
}

// PUT /api/demanda/itens/:itemId
async function updateItem(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  const b = req.body || {};
  const qtd = parseInt(b.qtd_pedida, 10);
  if (!Number.isInteger(qtd) || qtd <= 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const preco = b.preco_venda == null || b.preco_venda === '' ? null : Number(b.preco_venda);
  if (preco != null && (isNaN(preco) || preco < 0)) return res.status(400).json({ error: 'Preço inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [r] = await conn.query(
      'UPDATE demanda_itens SET fornecedor_nome = ?, fornecedor_cnpj = ?, codigo = ?, nome = ?, qtd_pedida = ?, preco_venda = ? WHERE id = ?',
      [b.fornecedor_nome ? String(b.fornecedor_nome).slice(0, 160) : null,
       b.fornecedor_cnpj ? String(b.fornecedor_cnpj).replace(/\D/g, '').slice(0, 14) : null,
       String(b.codigo || '').trim().slice(0, 60), b.nome ? String(b.nome).slice(0, 200) : null, qtd, preco, itemId]);
    if (r.affectedRows === 0) { await conn.rollback(); return res.status(404).json({ error: 'Item não encontrado.' }); }

    // Clamp: reduzir qtd_pedida abaixo do que já foi recebido não pode deixar qtd_faltou negativo.
    await conn.query('UPDATE demanda_itens SET qtd_recebida = LEAST(qtd_recebida, qtd_pedida) WHERE id = ?', [itemId]);

    const [[item]] = await conn.query('SELECT qtd_pedida, qtd_recebida, pedido_id FROM demanda_itens WHERE id = ?', [itemId]);
    const recebida = Number(item.qtd_recebida);
    const pedida = Number(item.qtd_pedida);
    const status = recebida >= pedida ? 'veio' : (recebida > 0 ? 'parcial' : 'pendente');
    await conn.query('UPDATE demanda_itens SET status = ? WHERE id = ?', [status, itemId]);
    await recalcularStatusPedido(conn, item.pedido_id);

    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('updateItem', e); return res.status(500).json({ error: 'Erro ao atualizar item.' }); }
  finally { conn.release(); }
}

// DELETE /api/demanda/itens/:itemId
async function deleteItem(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  try {
    const [r] = await db.query('DELETE FROM demanda_itens WHERE id = ?', [itemId]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Item não encontrado.' });
    return res.json({ ok: true });
  } catch (e) { console.error('deleteItem', e); return res.status(500).json({ error: 'Erro ao remover item.' }); }
}

// GET /api/demanda/fornecedores  — do histórico de NFs
async function listarFornecedores(req, res) {
  try {
    const [rows] = await db.query(
      "SELECT DISTINCT emitente_nome AS nome, emitente_cnpj AS cnpj FROM nf_entradas WHERE emitente_cnpj IS NOT NULL AND emitente_cnpj <> '' ORDER BY emitente_nome");
    return res.json(rows);
  } catch (e) { console.error('listarFornecedores', e); return res.status(500).json({ error: 'Erro.' }); }
}

// GET /api/demanda/compra
async function listaCompra(req, res) {
  try {
    const [rows] = await db.query(
      `SELECT di.fornecedor_cnpj, di.fornecedor_nome, di.codigo, di.nome,
              (di.qtd_pedida - di.qtd_recebida) AS falta, c.name AS client_name
       FROM demanda_itens di
       JOIN demanda_pedidos dp ON dp.id = di.pedido_id
       JOIN clients c ON c.id = dp.client_id
       WHERE di.status IN ('pendente','parcial') AND (di.qtd_pedida - di.qtd_recebida) > 0
       ORDER BY di.fornecedor_nome, di.codigo, di.id`);
    const mapF = new Map();
    for (const r of rows) {
      const fk = r.fornecedor_cnpj || ('nome:' + (r.fornecedor_nome || '?'));
      if (!mapF.has(fk)) mapF.set(fk, { fornecedor_cnpj: r.fornecedor_cnpj, fornecedor_nome: r.fornecedor_nome, itens: new Map() });
      const forn = mapF.get(fk);
      const ck = String(r.codigo);
      if (!forn.itens.has(ck)) forn.itens.set(ck, { codigo: r.codigo, nome: r.nome, qtd_total: 0, clientes: [] });
      const it = forn.itens.get(ck);
      it.qtd_total += Number(r.falta) || 0;
      it.clientes.push({ client_name: r.client_name, qtd: Number(r.falta) || 0 });
    }
    const out = [...mapF.values()].map(f => ({ fornecedor_cnpj: f.fornecedor_cnpj, fornecedor_nome: f.fornecedor_nome, itens: [...f.itens.values()] }));
    return res.json(out);
  } catch (e) { console.error('listaCompra', e); return res.status(500).json({ error: 'Erro na lista de compra.' }); }
}

// GET /api/demanda/relatorio
async function relatorio(req, res) {
  try {
    const [porCliente] = await db.query(
      `SELECT c.name AS client_name, dp.id AS pedido_id,
              SUM(CASE WHEN di.status='veio' THEN 1 ELSE 0 END) AS itens_veio,
              SUM(CASE WHEN di.status='parcial' THEN 1 ELSE 0 END) AS itens_parcial,
              SUM(CASE WHEN di.status IN ('pendente','faltou') THEN 1 ELSE 0 END) AS itens_faltou,
              COUNT(*) AS itens_total
       FROM demanda_itens di
       JOIN demanda_pedidos dp ON dp.id = di.pedido_id
       JOIN clients c ON c.id = dp.client_id
       GROUP BY dp.id, c.name
       ORDER BY dp.created_at DESC LIMIT 300`);
    const [porFornecedor] = await db.query(
      `SELECT COALESCE(fornecedor_nome, '(sem fornecedor)') AS fornecedor_nome, fornecedor_cnpj,
              SUM(qtd_pedida) AS qtd_pedida, SUM(qtd_recebida) AS qtd_recebida,
              SUM(GREATEST(qtd_pedida - qtd_recebida, 0)) AS qtd_faltou
       FROM demanda_itens
       GROUP BY fornecedor_nome, fornecedor_cnpj
       ORDER BY fornecedor_nome LIMIT 300`);
    return res.json({ porCliente, porFornecedor });
  } catch (e) { console.error('relatorio', e); return res.status(500).json({ error: 'Erro no relatório.' }); }
}

// Helper: recalcula o status do pedido pai a partir das suas linhas.
async function recalcularStatusPedido(conn, pedidoId) {
  const [itens] = await conn.query('SELECT qtd_recebida, status FROM demanda_itens WHERE pedido_id = ?', [pedidoId]);
  if (!itens.length) return;
  const algumRecebido = itens.some(i => Number(i.qtd_recebida) > 0);
  const todosVieram = itens.every(i => i.status === 'veio');
  const status = todosVieram ? 'concluido' : (algumRecebido ? 'parcial' : 'aberto');
  await conn.query('UPDATE demanda_pedidos SET status = ? WHERE id = ?', [status, pedidoId]);
}

// Chamado por nfController.importar, DENTRO da mesma transação, atrás da flag `conciliar`.
async function aplicarConciliacao(conn, nfId, emitenteCnpj) {
  if (!emitenteCnpj) return;
  const [nfItensRows] = await conn.query(
    'SELECT cprod AS codigo, SUM(quantidade) AS qtd, MAX(product_id) AS product_id FROM nf_entrada_itens WHERE nf_id = ? GROUP BY cprod', [nfId]);
  const [linhas] = await conn.query(
    "SELECT id, codigo, qtd_pedida, qtd_recebida, created_at, product_id, pedido_id FROM demanda_itens WHERE fornecedor_cnpj = ? AND status IN ('pendente','parcial') ORDER BY created_at, id", [emitenteCnpj]);
  if (!linhas.length || !nfItensRows.length) return;

  // vínculos aprendidos: traduz o cProd da NF -> código do pedido (se houver vínculo p/ este fornecedor)
  const [vincs] = await conn.query('SELECT cprod, codigo_pedido FROM demanda_cod_vinculos WHERE fornecedor_cnpj = ?', [emitenteCnpj]);
  const mapCprod = new Map(vincs.map(v => [String(v.cprod).trim().toLowerCase(), v.codigo_pedido]));
  const traduz = (cprod) => mapCprod.get(String(cprod).trim().toLowerCase()) || cprod;

  const nfItens = nfItensRows.map(r => ({ codigo: traduz(r.codigo), qtd: Number(r.qtd) }));
  const { alocacoes } = conciliar(nfItens, linhas);

  // product_id chaveado pelo código TRADUZIDO, para o backfill cair na linha certa
  const prodPorCod = new Map(nfItensRows.map(r => [String(traduz(r.codigo)).trim().toLowerCase(), r.product_id]));
  const linhaPorId = new Map(linhas.map(l => [l.id, l]));
  const pedidosAfetados = new Set();

  // agrega as alocações por item (dois cProd podem traduzir p/ o mesmo código na mesma NF)
  const somaPorItem = new Map();
  for (const a of alocacoes) somaPorItem.set(a.demanda_item_id, (somaPorItem.get(a.demanda_item_id) || 0) + a.qtd);
  for (const [demandaItemId, qtd] of somaPorItem) {
    const [ins] = await conn.query('INSERT IGNORE INTO demanda_conciliacoes (nf_id, demanda_item_id, qtd) VALUES (?, ?, ?)', [nfId, demandaItemId, qtd]);
    if (ins.affectedRows === 0) continue; // já contado numa importação anterior (idempotência)
    const linha = linhaPorId.get(demandaItemId);
    const novoRecebido = (Number(linha.qtd_recebida) || 0) + qtd;
    const novoStatus = novoRecebido >= Number(linha.qtd_pedida) ? 'veio' : 'parcial';
    const pid = linha.product_id || prodPorCod.get(String(linha.codigo).trim().toLowerCase()) || null;
    await conn.query('UPDATE demanda_itens SET qtd_recebida = ?, status = ?, product_id = COALESCE(product_id, ?) WHERE id = ?',
      [novoRecebido, novoStatus, pid, demandaItemId]);
    linha.qtd_recebida = novoRecebido;
    pedidosAfetados.add(linha.pedido_id);
  }
  for (const pid of pedidosAfetados) await recalcularStatusPedido(conn, pid);
}

// GET /api/demanda/:id/rascunho-venda
async function rascunhoVenda(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  try {
    const [[ped]] = await db.query('SELECT dp.id, dp.client_id, c.name AS client_name FROM demanda_pedidos dp JOIN clients c ON c.id = dp.client_id WHERE dp.id = ?', [id]);
    if (!ped) return res.status(404).json({ error: 'Pedido não encontrado.' });
    const [itens] = await db.query(
      `SELECT di.id AS demanda_item_id, di.product_id, di.nome, di.qtd_recebida AS qtd,
              COALESCE(di.preco_venda, p.sale_value) AS preco
       FROM demanda_itens di LEFT JOIN products p ON p.id = di.product_id
       WHERE di.pedido_id = ? AND di.qtd_recebida > 0 AND di.product_id IS NOT NULL AND di.order_id IS NULL`, [id]);
    return res.json({ client_id: ped.client_id, client_name: ped.client_name, itens });
  } catch (e) { console.error('rascunhoVenda', e); return res.status(500).json({ error: 'Erro.' }); }
}

// PUT /api/demanda/itens/:itemId/venda
async function marcarVenda(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  const orderId = parseInt(req.body.order_id, 10);
  if (!Number.isInteger(itemId) || !Number.isInteger(orderId)) return res.status(400).json({ error: 'Dados inválidos.' });
  try {
    const [[item]] = await db.query('SELECT order_id FROM demanda_itens WHERE id = ?', [itemId]);
    if (!item) return res.status(404).json({ error: 'Item não encontrado.' });
    if (item.order_id) return res.status(409).json({ error: 'Este item já foi vendido.' });
    const [r] = await db.query('UPDATE demanda_itens SET order_id = ? WHERE id = ? AND order_id IS NULL', [orderId, itemId]);
    if (r.affectedRows === 0) return res.status(409).json({ error: 'Este item já foi vendido.' });
    return res.json({ ok: true });
  } catch (e) { console.error('marcarVenda', e); return res.status(500).json({ error: 'Erro.' }); }
}

// PUT /api/demanda/itens/:itemId/alocacao
async function remanejarAlocacao(req, res) {
  const itemId = parseInt(req.params.itemId, 10);
  const nova = parseInt(req.body.qtd_recebida, 10);
  if (!Number.isInteger(itemId)) return res.status(400).json({ error: 'Item inválido.' });
  if (!Number.isInteger(nova) || nova < 0) return res.status(400).json({ error: 'Quantidade inválida.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[item]] = await conn.query('SELECT pedido_id, qtd_pedida FROM demanda_itens WHERE id = ? FOR UPDATE', [itemId]);
    if (!item) { await conn.rollback(); return res.status(404).json({ error: 'Item não encontrado.' }); }
    if (nova > Number(item.qtd_pedida)) { await conn.rollback(); return res.status(400).json({ error: 'Não pode receber mais do que foi pedido.' }); }
    const status = nova >= Number(item.qtd_pedida) ? 'veio' : (nova > 0 ? 'parcial' : 'pendente');
    await conn.query('UPDATE demanda_itens SET qtd_recebida = ?, status = ? WHERE id = ?', [nova, status, itemId]);
    await recalcularStatusPedido(conn, item.pedido_id);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('remanejarAlocacao', e); return res.status(500).json({ error: 'Erro.' }); }
  finally { conn.release(); }
}

// GET /api/demanda/nf/:nfId/conferir — itens da NF + pedidos pendentes do fornecedor (p/ ligar na mão)
async function conferirNf(req, res) {
  const nfId = parseInt(req.params.nfId, 10);
  if (!Number.isInteger(nfId)) return res.status(400).json({ error: 'NF inválida.' });
  try {
    const [[nf]] = await db.query('SELECT id, emitente_nome, emitente_cnpj, numero FROM nf_entradas WHERE id = ?', [nfId]);
    if (!nf) return res.status(404).json({ error: 'NF não encontrada.' });
    const cnpj = nf.emitente_cnpj;
    const [itens] = await db.query(
      `SELECT i.cprod, MAX(i.descricao) AS descricao, SUM(i.quantidade) AS quantidade,
              MAX(i.product_id) AS product_id, MAX(p.name) AS produto_nome,
              (SELECT v.codigo_pedido FROM demanda_cod_vinculos v WHERE v.fornecedor_cnpj = ? AND v.cprod = i.cprod) AS codigo_vinculado
       FROM nf_entrada_itens i LEFT JOIN products p ON p.id = i.product_id
       WHERE i.nf_id = ? GROUP BY i.cprod ORDER BY i.cprod`, [cnpj, nfId]);
    const [pendentes] = await db.query(
      // mostra as pendentes deste fornecedor E as ainda sem fornecedor (que são justamente as que
      // precisam ser ligadas — ao ligar, o conciliar-manual grava o CNPJ nelas)
      `SELECT di.id AS demanda_item_id, di.codigo, di.nome, c.name AS cliente, di.qtd_pedida, di.qtd_recebida
       FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id = di.pedido_id JOIN clients c ON c.id = dp.client_id
       WHERE (di.fornecedor_cnpj = ? OR di.fornecedor_cnpj IS NULL OR di.fornecedor_cnpj = '')
         AND di.status IN ('pendente','parcial') ORDER BY di.codigo, di.created_at`, [cnpj]);
    return res.json({ nf, itens, pendentes });
  } catch (e) { console.error('conferirNf', e); return res.status(500).json({ error: 'Erro ao conferir NF.' }); }
}

// POST /api/demanda/conciliar-manual — grava o vínculo cProd->código e reconcilia a NF
async function conciliarManual(req, res) {
  const nfId = parseInt(req.body.nf_id, 10);
  const cprod = String(req.body.cprod || '').trim();
  const codigoPedido = String(req.body.codigo_pedido || '').trim();
  if (!Number.isInteger(nfId) || !cprod || !codigoPedido) return res.status(400).json({ error: 'Dados inválidos.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[nf]] = await conn.query('SELECT emitente_cnpj FROM nf_entradas WHERE id = ? FOR UPDATE', [nfId]);
    if (!nf) { await conn.rollback(); return res.status(404).json({ error: 'NF não encontrada.' }); }
    const cnpj = nf.emitente_cnpj;
    const [[temItem]] = await conn.query('SELECT 1 AS ok FROM nf_entrada_itens WHERE nf_id = ? AND cprod = ? LIMIT 1', [nfId, cprod]);
    if (!temItem) { await conn.rollback(); return res.status(400).json({ error: 'Esse código não está nesta NF.' }); }
    await conn.query(
      'INSERT INTO demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE codigo_pedido = VALUES(codigo_pedido)',
      [cnpj, cprod, codigoPedido]);
    // aprende o fornecedor nas linhas com esse código que ainda não tinham CNPJ (entram no escopo)
    await conn.query("UPDATE demanda_itens SET fornecedor_cnpj = ? WHERE codigo = ? AND (fornecedor_cnpj IS NULL OR fornecedor_cnpj = '')", [cnpj, codigoPedido]);
    await aplicarConciliacao(conn, nfId, cnpj);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('conciliarManual', e); return res.status(500).json({ error: 'Erro ao conciliar.' }); }
  finally { conn.release(); }
}

// DELETE /api/demanda/:id — exclui um pedido criado por engano (bloqueia se já virou venda)
async function excluirPedido(req, res) {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'ID inválido.' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[ped]] = await conn.query('SELECT id FROM demanda_pedidos WHERE id = ? FOR UPDATE', [id]);
    if (!ped) { await conn.rollback(); return res.status(404).json({ error: 'Pedido não encontrado.' }); }
    const [[vend]] = await conn.query('SELECT COUNT(*) c FROM demanda_itens WHERE pedido_id = ? AND order_id IS NOT NULL', [id]);
    if (vend.c > 0) { await conn.rollback(); return res.status(409).json({ error: 'Este pedido já gerou venda; não pode ser excluído.' }); }
    await conn.query('DELETE c FROM demanda_conciliacoes c JOIN demanda_itens di ON di.id = c.demanda_item_id WHERE di.pedido_id = ?', [id]);
    await conn.query('DELETE FROM demanda_itens WHERE pedido_id = ?', [id]);
    await conn.query('DELETE FROM demanda_pedidos WHERE id = ?', [id]);
    await conn.commit();
    return res.json({ ok: true });
  } catch (e) { await conn.rollback(); console.error('excluirPedido', e); return res.status(500).json({ error: 'Erro ao excluir.' }); }
  finally { conn.release(); }
}

module.exports = {
  criarPedido, listarPedidos, getPedido, addItem, updateItem, deleteItem, listarFornecedores,
  listaCompra, relatorio, aplicarConciliacao, rascunhoVenda, marcarVenda, remanejarAlocacao,
  conferirNf, conciliarManual, excluirPedido,
};
