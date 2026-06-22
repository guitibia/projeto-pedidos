/**
 * Clona o banco de produção (db_pedidos) para o banco de teste (db_pedidos_teste),
 * copiando estrutura + dados de todas as tabelas.
 *
 * Uso: node scripts/setup-db-teste.js
 *
 * ATENÇÃO: recria o db_pedidos_teste do zero (DROP + CREATE). Qualquer dado
 * que estiver só no banco de teste será perdido — é uma cópia fiel da produção.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

const SOURCE = process.env.DB_SOURCE || 'db_pedidos';
const TARGET = process.env.DB_TARGET || 'db_pedidos_teste';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  try {
    console.log(`Clonando ${SOURCE} -> ${TARGET} ...`);

    await conn.query(`DROP DATABASE IF EXISTS \`${TARGET}\``);
    await conn.query(`CREATE DATABASE \`${TARGET}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    await conn.query('SET FOREIGN_KEY_CHECKS=0');

    const [tables] = await conn.query(
      'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = ? AND table_type = "BASE TABLE"',
      [SOURCE]
    );

    let total = 0;
    for (const row of tables) {
      const name = row.t;
      await conn.query(`CREATE TABLE \`${TARGET}\`.\`${name}\` LIKE \`${SOURCE}\`.\`${name}\``);
      const [res] = await conn.query(`INSERT INTO \`${TARGET}\`.\`${name}\` SELECT * FROM \`${SOURCE}\`.\`${name}\``);
      console.log(`  ${name}: ${res.affectedRows} linhas`);
      total += res.affectedRows;
    }

    await conn.query('SET FOREIGN_KEY_CHECKS=1');
    console.log(`OK — ${tables.length} tabelas, ${total} linhas copiadas para ${TARGET}.`);
  } catch (err) {
    console.error('Erro ao clonar banco:', err.message);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
})();
