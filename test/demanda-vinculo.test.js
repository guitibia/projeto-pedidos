const { test } = require('node:test');
const assert = require('node:assert');
require('dotenv').config();
const db = require('../src/database/connection');
const { aplicarConciliacao } = require('../src/controllers/demandaController');

const CNPJ = '71673990005136'; // Natura (exemplo)
async function seedClient(){ const [r]=await db.query('INSERT INTO clients (name) VALUES (?)',['zz_test_cli_'+Date.now()+Math.random()]); return r.insertId; }
async function seedPedidoItem(clientId, codigo, qtd){
  const [p]=await db.query('INSERT INTO demanda_pedidos (client_id) VALUES (?)',[clientId]);
  const [i]=await db.query('INSERT INTO demanda_itens (pedido_id, fornecedor_cnpj, fornecedor_nome, codigo, qtd_pedida) VALUES (?,?,?,?,?)',[p.insertId, CNPJ, 'ZZ Natura', codigo, qtd]);
  return { pedidoId:p.insertId, itemId:i.insertId };
}
async function seedNf(cprod, qtd){
  const chave='zzv'+Date.now()+Math.floor(Math.random()*1e9);
  const [n]=await db.query('INSERT INTO nf_entradas (chave, emitente_nome, emitente_cnpj, numero) VALUES (?,?,?,?)',[String(chave).slice(0,44),'ZZ Natura',CNPJ,'1']);
  await db.query('INSERT INTO nf_entrada_itens (nf_id, cprod, quantidade) VALUES (?,?,?)',[n.insertId, cprod, qtd]);
  return n.insertId;
}
async function cleanup(){
  await db.query('DELETE FROM demanda_cod_vinculos WHERE fornecedor_cnpj = ?',[CNPJ]);
  await db.query('DELETE FROM demanda_conciliacoes WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)',[CNPJ]);
  await db.query('DELETE FROM nf_entrada_itens WHERE nf_id IN (SELECT id FROM nf_entradas WHERE emitente_cnpj = ?)',[CNPJ]);
  await db.query('DELETE FROM nf_entradas WHERE emitente_cnpj = ?',[CNPJ]);
  await db.query("DELETE di FROM demanda_itens di JOIN demanda_pedidos dp ON dp.id=di.pedido_id JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE dp FROM demanda_pedidos dp JOIN clients c ON c.id=dp.client_id WHERE c.name LIKE 'zz_test_cli_%'");
  await db.query("DELETE FROM clients WHERE name LIKE 'zz_test_cli_%'");
}

test('sem vínculo: cProd diferente do código NÃO casa', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',2);         // código de catálogo
  const nfId=await seedNf('000000000050512547',2);              // cProd da NF (diferente)
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),0,'sem vínculo não casa');
  await cleanup();
});

test('com vínculo cProd→código: casa (aprendeu)', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',2);
  const nfId=await seedNf('000000000050512547',2);
  await db.query('INSERT INTO demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido) VALUES (?,?,?)',[CNPJ,'000000000050512547','160380']);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),2,'com vínculo casa');
  assert.strictEqual(row.status,'veio');
  await cleanup();
});

test('fallback: cProd == código casa mesmo sem vínculo', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'ABC123',1);
  const nfId=await seedNf('ABC123',1);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),1);
  await cleanup();
});

const { conferirNf, conciliarManual } = require('../src/controllers/demandaController');
function mockRes(){ return { statusCode:200, body:null, status(c){this.statusCode=c;return this;}, json(b){this.body=b;return this;} }; }

test('conferirNf devolve itens da NF e pendentes do fornecedor', async () => {
  const cli=await seedClient();
  await seedPedidoItem(cli,'160380',2);
  const nfId=await seedNf('000000000050512547',2);
  const res=mockRes();
  await conferirNf({ params:{ nfId } }, res);
  assert.strictEqual(res.statusCode,200);
  assert.ok(res.body.itens.some(i => i.cprod==='000000000050512547'));
  assert.ok(res.body.pendentes.some(p => p.codigo==='160380'));
  await cleanup();
});

test('conciliarManual grava vínculo, reconcilia e aprende p/ a próxima NF', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',3);
  const nf1=await seedNf('000000000050512547',2);
  let res=mockRes();
  await conciliarManual({ body:{ nf_id:nf1, cprod:'000000000050512547', codigo_pedido:'160380' } }, res);
  assert.strictEqual(res.statusCode,200);
  let [[row]]=await db.query('SELECT qtd_recebida,status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),2,'reconciliou o que veio');
  assert.strictEqual(row.status,'parcial');
  // 2ª NF do mesmo cProd casa AUTOMÁTICO (sem manual), pelo vínculo aprendido
  const nf2=await seedNf('000000000050512547',1);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nf2,CNPJ); await conn.commit(); } finally { conn.release(); }
  [[row]]=await db.query('SELECT qtd_recebida,status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),3,'2ª NF casou sozinha');
  assert.strictEqual(row.status,'veio');
  await cleanup();
});

test('dois cProd diferentes traduzem p/ o mesmo código na mesma NF: soma, não perde qtd', async () => {
  const cli=await seedClient();
  const { itemId }=await seedPedidoItem(cli,'160380',3);
  const nfId=await seedNf('AAA111',2); // primeiro item da NF
  await db.query('INSERT INTO nf_entrada_itens (nf_id, cprod, quantidade) VALUES (?,?,?)',[nfId,'BBB222',2]); // segundo item, mesma NF
  await db.query('INSERT INTO demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido) VALUES (?,?,?)',[CNPJ,'AAA111','160380']);
  await db.query('INSERT INTO demanda_cod_vinculos (fornecedor_cnpj, cprod, codigo_pedido) VALUES (?,?,?)',[CNPJ,'BBB222','160380']);
  const conn=await db.getConnection();
  try{ await conn.beginTransaction(); await aplicarConciliacao(conn,nfId,CNPJ); await conn.commit(); } finally { conn.release(); }
  const [[row]]=await db.query('SELECT qtd_recebida, status FROM demanda_itens WHERE id = ?',[itemId]);
  assert.strictEqual(Number(row.qtd_recebida),3,'soma as duas alocações (2+1), não perde a segunda');
  assert.strictEqual(row.status,'veio');
  await cleanup();
});

test('conciliarManual: cprod que não está na NF → 400', async () => {
  const nfId=await seedNf('AAA',1);
  const res=mockRes();
  await conciliarManual({ body:{ nf_id:nfId, cprod:'NAO_EXISTE', codigo_pedido:'160380' } }, res);
  assert.strictEqual(res.statusCode,400);
  await cleanup();
});
