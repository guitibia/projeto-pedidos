const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_pedidos',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: '-03:00'
});

pool.getConnection()
  .then(async conn => {
    console.log(`✅ Banco de dados conectado: ${process.env.DB_NAME}`);
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

    // Migração: unificação Avon + Natura → Natura/Avon
    try {
      await conn.query("UPDATE products SET franchise = 'Natura/Avon' WHERE franchise IN ('Avon', 'Natura')");
    } catch (_) {}

    conn.release();
  })
  .catch(err => {
    console.error('❌ Erro ao conectar ao banco:', err.message);
    process.exit(1);
  });

module.exports = pool;
