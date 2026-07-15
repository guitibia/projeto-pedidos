const mysql = require('mysql2/promise');

// Decide qual banco usar:
//  1. DB_NAME explícito no ambiente sempre vence (override manual)
//  2. Senão, detecta a branch git: na "Teste" usa o banco isolado db_pedidos_teste
//  3. Qualquer outra branch (incluindo main) usa db_pedidos
function resolveDbName() {
  if (process.env.DB_NAME) return process.env.DB_NAME;
  try {
    const branch = require('child_process')
      .execSync('git rev-parse --abbrev-ref HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString().trim();
    if (branch === 'Teste') return 'db_pedidos_teste';
  } catch (_) { /* fora de um repo git: cai no padrão */ }
  return 'db_pedidos';
}

const DB_NAME = resolveDbName();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00'
});

pool.getConnection()
  .then(async conn => {
    console.log(`✅ Banco de dados conectado: ${DB_NAME}`);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS order_parcelas (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        order_id        INT NOT NULL,
        numero          INT NOT NULL,
        valor           DECIMAL(10,2) NOT NULL,
        status          ENUM('Pendente','Pago') DEFAULT 'Pendente',
        data_pagamento  DATETIME DEFAULT NULL,
        UNIQUE KEY uq_order_parcela (order_id, numero),
        CONSTRAINT op2_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Migração: coordenadas em clients
    for (const sql of [
      'ALTER TABLE clients ADD COLUMN lat DECIMAL(10,8) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN lng DECIMAL(11,8) DEFAULT NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: taxa de entrega em orders
    try { await conn.query('ALTER TABLE orders ADD COLUMN delivery_fee DECIMAL(6,2) NOT NULL DEFAULT 0.00'); } catch (_) {}

    // Migração: custo por item do pedido (preço de custo promocional)
    try { await conn.query('ALTER TABLE order_products ADD COLUMN cost_price DECIMAL(10,2) DEFAULT NULL'); } catch (_) {}

    // Migração: valor de venda (base para cálculo de custo por desconto de franquia)
    try { await conn.query('ALTER TABLE products ADD COLUMN sale_value DECIMAL(10,2) DEFAULT NULL'); } catch (_) {}

    // Migração: foto e descrição de produto (para a loja)
    try { await conn.query('ALTER TABLE products ADD COLUMN image VARCHAR(255) DEFAULT NULL'); } catch (_) {}
    try { await conn.query('ALTER TABLE products ADD COLUMN description TEXT DEFAULT NULL'); } catch (_) {}

    // Migração: contas de cliente da loja
    for (const sql of [
      'ALTER TABLE clients ADD COLUMN email VARCHAR(255) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN cpf VARCHAR(11) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN birthdate DATE DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN password_hash VARCHAR(255) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN email_verified TINYINT(1) NOT NULL DEFAULT 0',
      'ALTER TABLE clients ADD COLUMN verification_token VARCHAR(64) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN verification_expires DATETIME DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN lgpd_consent_at DATETIME DEFAULT NULL',
      // Cadastro de cliente da loja não informa endereço (só no checkout):
      // tornar essas colunas opcionais para o INSERT de registro funcionar em MySQL strict mode.
      'ALTER TABLE clients MODIFY address VARCHAR(255) NULL DEFAULT NULL',
      'ALTER TABLE clients MODIFY house_number VARCHAR(50) NULL DEFAULT NULL',
      'ALTER TABLE clients MODIFY neighborhood VARCHAR(255) NULL DEFAULT NULL',
      'CREATE UNIQUE INDEX uq_clients_email ON clients(email)',
      'CREATE UNIQUE INDEX uq_clients_cpf ON clients(cpf)',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: checkout da loja (sub-projeto 3)
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN origin VARCHAR(20) NOT NULL DEFAULT 'painel'",
      'ALTER TABLE clients ADD COLUMN cep VARCHAR(8) DEFAULT NULL',
      'ALTER TABLE clients ADD COLUMN city VARCHAR(120) DEFAULT NULL',
      "ALTER TABLE orders MODIFY COLUMN payment_method ENUM('PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO','A COMBINAR') NOT NULL",
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: pagamento (sub-projeto 4)
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS payment_intents (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          external_reference VARCHAR(64) NOT NULL UNIQUE,
          items_json JSON NOT NULL,
          address VARCHAR(255), house_number VARCHAR(30), neighborhood VARCHAR(120),
          cep VARCHAR(8), city VARCHAR(120),
          subtotal DECIMAL(10,2) NOT NULL,
          delivery_fee DECIMAL(6,2) NOT NULL DEFAULT 0,
          total DECIMAL(10,2) NOT NULL,
          mp_preference_id VARCHAR(64),
          mp_payment_id VARCHAR(64),
          status VARCHAR(20) NOT NULL DEFAULT 'pendente',
          order_id INT DEFAULT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`);
    } catch (_) {}
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN payment_status VARCHAR(20) DEFAULT NULL",
      "ALTER TABLE orders ADD COLUMN mp_payment_id VARCHAR(64) DEFAULT NULL",
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: PIX transparente (sub-projeto 5)
    for (const sql of [
      'ALTER TABLE payment_intents ADD COLUMN pix_qr_code TEXT DEFAULT NULL',
      'ALTER TABLE payment_intents ADD COLUMN pix_qr_base64 MEDIUMTEXT DEFAULT NULL',
      'ALTER TABLE payment_intents ADD COLUMN pix_expiration DATETIME DEFAULT NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: favoritos da loja
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS favorites (
          id INT AUTO_INCREMENT PRIMARY KEY,
          client_id INT NOT NULL,
          product_id INT NOT NULL,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY uq_fav (client_id, product_id)
        )`);
    } catch (_) {}

    // Migração: frete por zona + settings da loja
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS delivery_zones (id INT AUTO_INCREMENT PRIMARY KEY, bairro VARCHAR(120) NOT NULL, fee DECIMAL(6,2) NOT NULL DEFAULT 0, active TINYINT(1) NOT NULL DEFAULT 1, UNIQUE KEY uq_bairro (bairro))',
      'CREATE TABLE IF NOT EXISTS store_settings (skey VARCHAR(60) PRIMARY KEY, svalue VARCHAR(255))',
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('cidade_entrega', 'São João da Boa Vista')",
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('frete_padrao', '15.00')",
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Seeds: desconto global
    for (const sql of [
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('desconto_global_ativo', '0')",
      "INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('desconto_global_percent', '0')",
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: tabela de percentuais de desconto por franquia
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS franchise_discounts (
          franchise VARCHAR(255) PRIMARY KEY,
          percent   DECIMAL(5,2) NOT NULL DEFAULT 0
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
    } catch (_) {}

    // Seed dos percentuais (idempotente — não sobrescreve valores já ajustados pelo usuário)
    try {
      await conn.query(`
        INSERT IGNORE INTO franchise_discounts (franchise, percent) VALUES
        ('Boticário', 15), ('Natura', 32), ('Avon', 32),
        ('Abelha Rainha', 20), ('Eudora', 30), ('Outros', 0)
      `);
    } catch (_) {}

    // Backfill do sale_value reconstruindo a partir do custo já descontado (roda só uma vez)
    try {
      await conn.query(`
        UPDATE products p
        LEFT JOIN franchise_discounts fd ON fd.franchise = p.franchise
        SET p.sale_value = ROUND(p.cost / (1 - COALESCE(fd.percent, 0) / 100), 2)
        WHERE p.sale_value IS NULL
      `);
    } catch (_) {}

    // Migração: notas fiscais de entrada
    for (const sql of [
      'CREATE TABLE IF NOT EXISTS nf_entradas (id INT AUTO_INCREMENT PRIMARY KEY, chave VARCHAR(44) NOT NULL UNIQUE, emitente_nome VARCHAR(160), emitente_cnpj VARCHAR(14), numero VARCHAR(20), serie VARCHAR(10), valor_total DECIMAL(12,2), data_emissao DATETIME NULL, xml LONGTEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)',
      'CREATE TABLE IF NOT EXISTS nf_entrada_itens (id INT AUTO_INCREMENT PRIMARY KEY, nf_id INT NOT NULL, cprod VARCHAR(60), descricao VARCHAR(255), ncm VARCHAR(10), quantidade DECIMAL(12,3), valor_unit DECIMAL(12,4), valor_total DECIMAL(12,2), product_id INT NULL, INDEX (nf_id))',
      'CREATE TABLE IF NOT EXISTS nf_item_vinculos (id INT AUTO_INCREMENT PRIMARY KEY, emitente_cnpj VARCHAR(14) NOT NULL, cprod VARCHAR(60) NOT NULL, product_id INT NOT NULL, UNIQUE KEY uq_vinc (emitente_cnpj, cprod))',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: origem (NF/Manual) + nf_id nas movimentações de estoque
    for (const sql of [
      "ALTER TABLE estoque_movimentacoes ADD COLUMN origem ENUM('Manual','NF') NOT NULL DEFAULT 'Manual'",
      'ALTER TABLE estoque_movimentacoes ADD COLUMN nf_id INT NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }
    // Backfill one-shot: marca as entradas antigas de NF (rodadas antes da coluna existir).
    // Roda só uma vez pra não re-rotular, no futuro, uma movimentação manual cujo motivo comece com "NF ".
    try {
      const [[done]] = await conn.query("SELECT svalue FROM store_settings WHERE skey = 'nf_origem_backfill'");
      if (!done) {
        await conn.query("UPDATE estoque_movimentacoes SET origem='NF' WHERE observacao LIKE 'NF %'");
        await conn.query("INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('nf_origem_backfill', '1')");
      }
    } catch (_) {}

    // Migração: EAN nos produtos e itens de NF
    for (const sql of [
      'ALTER TABLE products ADD COLUMN ean VARCHAR(14) NULL',
      'ALTER TABLE nf_entrada_itens ADD COLUMN ean VARCHAR(14) NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: pedidos das clientes + conciliação com a NF
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS demanda_pedidos (id INT AUTO_INCREMENT PRIMARY KEY, client_id INT NOT NULL, observacao VARCHAR(255) NULL, status VARCHAR(12) NOT NULL DEFAULT 'aberto', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (client_id))",
      "CREATE TABLE IF NOT EXISTS demanda_itens (id INT AUTO_INCREMENT PRIMARY KEY, pedido_id INT NOT NULL, fornecedor_cnpj VARCHAR(14) NULL, fornecedor_nome VARCHAR(160) NULL, codigo VARCHAR(60) NOT NULL, nome VARCHAR(200) NULL, qtd_pedida INT NOT NULL, qtd_recebida INT NOT NULL DEFAULT 0, preco_venda DECIMAL(10,2) NULL, product_id INT NULL, status VARCHAR(12) NOT NULL DEFAULT 'pendente', order_id INT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX (pedido_id), INDEX (fornecedor_cnpj, codigo))",
      "CREATE TABLE IF NOT EXISTS demanda_conciliacoes (id INT AUTO_INCREMENT PRIMARY KEY, nf_id INT NOT NULL, demanda_item_id INT NOT NULL, qtd INT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uq_nf_item (nf_id, demanda_item_id))",
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: desconto no PIX por cliente
    for (const sql of [
      'ALTER TABLE clients ADD COLUMN pix_discount_percent DECIMAL(5,2) NULL',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Migração: visibilidade do produto na loja (produto da NF nasce oculto; padrão visível)
    for (const sql of [
      'ALTER TABLE products ADD COLUMN visivel_loja TINYINT(1) NOT NULL DEFAULT 1',
    ]) { try { await conn.query(sql); } catch (_) {} }

    // Backfill one-shot: nomes de produto "gritando" (CAIXA ALTA) viram Title Case.
    // Só mexe nos 100% maiúsculos; nomes já formatados ficam intactos.
    try {
      const [[done]] = await conn.query("SELECT svalue FROM store_settings WHERE skey = 'produtos_titlecase_backfill'");
      if (!done) {
        const { titleCasePtBr, isShoutingName } = require('../utils/textcase');
        const [rows] = await conn.query('SELECT id, name FROM products');
        for (const r of rows) {
          if (isShoutingName(r.name)) {
            const novo = titleCasePtBr(r.name).slice(0, 200);
            if (novo !== r.name) await conn.query('UPDATE products SET name = ? WHERE id = ?', [novo, r.id]);
          }
        }
        await conn.query("INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('produtos_titlecase_backfill', '1')");
      }
    } catch (_) {}

    // Migração: método de entrega (entrega/retirada) + endereço de retirada
    for (const sql of [
      "ALTER TABLE orders ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'",
      "ALTER TABLE payment_intents ADD COLUMN delivery_method VARCHAR(20) NOT NULL DEFAULT 'entrega'",
    ]) { try { await conn.query(sql); } catch (_) {} }
    try { await conn.query("INSERT IGNORE INTO store_settings (skey, svalue) VALUES ('endereco_retirada', '')"); } catch (_) {}

    conn.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1);
  });

module.exports = pool;
