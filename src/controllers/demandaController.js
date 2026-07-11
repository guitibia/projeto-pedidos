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
  try {
    const [r] = await db.query(
      'UPDATE demanda_itens SET fornecedor_nome = ?, fornecedor_cnpj = ?, codigo = ?, nome = ?, qtd_pedida = ?, preco_venda = ? WHERE id = ?',
      [b.fornecedor_nome ? String(b.fornecedor_nome).slice(0, 160) : null,
       b.fornecedor_cnpj ? String(b.fornecedor_cnpj).replace(/\D/g, '').slice(0, 14) : null,
       String(b.codigo || '').trim().slice(0, 60), b.nome ? String(b.nome).slice(0, 200) : null, qtd, preco, itemId]);
    if (r.affectedRows === 0) return res.status(404).json({ error: 'Item não encontrado.' });
    return res.json({ ok: true });
  } catch (e) { console.error('updateItem', e); return res.status(500).json({ error: 'Erro ao atualizar item.' }); }
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
              SUM(qtd_pedida - qtd_recebida) AS qtd_faltou
       FROM demanda_itens
       GROUP BY fornecedor_nome, fornecedor_cnpj
       ORDER BY fornecedor_nome LIMIT 300`);
    return res.json({ porCliente, porFornecedor });
  } catch (e) { console.error('relatorio', e); return res.status(500).json({ error: 'Erro no relatório.' }); }
}

module.exports = {
  criarPedido, listarPedidos, getPedido, addItem, updateItem, deleteItem, listarFornecedores,
  listaCompra, relatorio,
};
