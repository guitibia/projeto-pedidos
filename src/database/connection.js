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
      'CREATE UNIQUE INDEX uq_clients_email ON clients(email)',
      'CREATE UNIQUE INDEX uq_clients_cpf ON clients(cpf)',
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

    conn.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1);
  });

module.exports = pool;
