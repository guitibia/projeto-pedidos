-- ============================================================
-- Sistema de Pedidos — Schema completo (gerado de db_pedidos)
-- Atualizado em: 2026-08-08
--
-- Como usar em outra máquina (XAMPP/MySQL):
--   mysql -u root < db/db_pedidos.sql
-- ou importe este arquivo pelo phpMyAdmin.
--
-- Depois: copie o .env (DB_USER/DB_PASSWORD) e rode `npm install && npm run dev`.
-- Login inicial: admin / admin123  (troque após o primeiro acesso!)
--
-- Observação: o app roda migrações automáticas no boot (src/database/connection.js),
-- então este arquivo é só o ponto de partida — ele NÃO apaga nada se o banco já existir.
-- Para o banco de testes (branch Teste), veja o final do arquivo.
-- ============================================================

CREATE DATABASE IF NOT EXISTS `db_pedidos`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
USE `db_pedidos`;


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `address` varchar(255) DEFAULT NULL,
  `house_number` varchar(50) DEFAULT NULL,
  `neighborhood` varchar(255) DEFAULT NULL,
  `phone` varchar(20) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `lat` decimal(10,8) DEFAULT NULL,
  `lng` decimal(11,8) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `cpf` varchar(11) DEFAULT NULL,
  `birthdate` date DEFAULT NULL,
  `password_hash` varchar(255) DEFAULT NULL,
  `email_verified` tinyint(1) NOT NULL DEFAULT 0,
  `verification_token` varchar(64) DEFAULT NULL,
  `verification_expires` datetime DEFAULT NULL,
  `lgpd_consent_at` datetime DEFAULT NULL,
  `cep` varchar(8) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `pix_discount_percent` decimal(5,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_clients_email` (`email`),
  UNIQUE KEY `uq_clients_cpf` (`cpf`),
  KEY `idx_name` (`name`)
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `delivery_zones` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `bairro` varchar(120) NOT NULL,
  `fee` decimal(6,2) NOT NULL DEFAULT 0.00,
  `active` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_bairro` (`bairro`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `demanda_cod_vinculos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `fornecedor_cnpj` varchar(14) NOT NULL,
  `cprod` varchar(60) NOT NULL,
  `codigo_pedido` varchar(60) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_forn_cprod` (`fornecedor_cnpj`,`cprod`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `demanda_conciliacoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nf_id` int(11) NOT NULL,
  `demanda_item_id` int(11) NOT NULL,
  `qtd` int(11) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_nf_item` (`nf_id`,`demanda_item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `demanda_itens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `pedido_id` int(11) NOT NULL,
  `fornecedor_cnpj` varchar(14) DEFAULT NULL,
  `fornecedor_nome` varchar(160) DEFAULT NULL,
  `codigo` varchar(60) NOT NULL,
  `nome` varchar(200) DEFAULT NULL,
  `qtd_pedida` int(11) NOT NULL,
  `qtd_recebida` int(11) NOT NULL DEFAULT 0,
  `preco_venda` decimal(10,2) DEFAULT NULL,
  `product_id` int(11) DEFAULT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'pendente',
  `order_id` int(11) DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `pedido_id` (`pedido_id`),
  KEY `fornecedor_cnpj` (`fornecedor_cnpj`,`codigo`)
) ENGINE=InnoDB AUTO_INCREMENT=22 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `demanda_pedidos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `observacao` varchar(255) DEFAULT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'aberto',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `estoque_movimentacoes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `product_id` int(11) NOT NULL,
  `tipo` enum('Entrada','Saída') NOT NULL,
  `quantidade` int(11) NOT NULL,
  `observacao` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `origem` enum('Manual','NF') NOT NULL DEFAULT 'Manual',
  `nf_id` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `estoque_movimentacoes_ibfk_1` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=158 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `favorites` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_fav` (`client_id`,`product_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `franchise_discounts` (
  `franchise` varchar(255) NOT NULL,
  `percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`franchise`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `nf_entrada_itens` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nf_id` int(11) NOT NULL,
  `cprod` varchar(60) DEFAULT NULL,
  `descricao` varchar(255) DEFAULT NULL,
  `ncm` varchar(10) DEFAULT NULL,
  `quantidade` decimal(12,3) DEFAULT NULL,
  `valor_unit` decimal(12,4) DEFAULT NULL,
  `valor_total` decimal(12,2) DEFAULT NULL,
  `product_id` int(11) DEFAULT NULL,
  `ean` varchar(14) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `nf_id` (`nf_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `nf_entradas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `chave` varchar(44) NOT NULL,
  `emitente_nome` varchar(160) DEFAULT NULL,
  `emitente_cnpj` varchar(14) DEFAULT NULL,
  `numero` varchar(20) DEFAULT NULL,
  `serie` varchar(10) DEFAULT NULL,
  `valor_total` decimal(12,2) DEFAULT NULL,
  `data_emissao` datetime DEFAULT NULL,
  `xml` longtext DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `chave` (`chave`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `nf_item_vinculos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `emitente_cnpj` varchar(14) NOT NULL,
  `cprod` varchar(60) NOT NULL,
  `product_id` int(11) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vinc` (`emitente_cnpj`,`cprod`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `notas_fiscais` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero` varchar(50) DEFAULT NULL,
  `fornecedor` varchar(100) DEFAULT NULL,
  `data_emissao` date DEFAULT NULL,
  `valor` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `order_parcelas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `order_id` int(11) NOT NULL,
  `numero` int(11) NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `status` enum('Pendente','Pago') DEFAULT 'Pendente',
  `data_pagamento` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_order_parcela` (`order_id`,`numero`),
  CONSTRAINT `op2_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=19 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `order_products` (
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `sale_price` decimal(10,2) NOT NULL,
  `not_came` tinyint(1) DEFAULT 0,
  `promotion_price` decimal(10,2) DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  `cost_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`order_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `op_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `op_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `payment_method` enum('PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO','A COMBINAR') NOT NULL,
  `installments` int(11) DEFAULT NULL,
  `total_cost` decimal(10,2) NOT NULL,
  `combined_payment_value` decimal(10,2) DEFAULT NULL,
  `status` varchar(50) DEFAULT 'Pendente',
  `created_at` datetime DEFAULT current_timestamp(),
  `delivery_fee` decimal(6,2) NOT NULL DEFAULT 0.00,
  `origin` varchar(20) NOT NULL DEFAULT 'painel',
  `payment_status` varchar(20) DEFAULT NULL,
  `mp_payment_id` varchar(64) DEFAULT NULL,
  `delivery_method` varchar(20) NOT NULL DEFAULT 'entrega',
  PRIMARY KEY (`id`),
  KEY `idx_status` (`status`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_client_id` (`client_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=139 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `parcelas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `promissoria_id` int(11) NOT NULL,
  `numero_parcela` int(11) NOT NULL,
  `data_vencimento` date NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `status` enum('Pendente','Pago') DEFAULT 'Pendente',
  `numero_boleto` varchar(60) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `promissoria_id` (`promissoria_id`),
  CONSTRAINT `parc_ibfk_1` FOREIGN KEY (`promissoria_id`) REFERENCES `promissorias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=166 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `payment_intents` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `external_reference` varchar(64) NOT NULL,
  `items_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`items_json`)),
  `address` varchar(255) DEFAULT NULL,
  `house_number` varchar(30) DEFAULT NULL,
  `neighborhood` varchar(120) DEFAULT NULL,
  `cep` varchar(8) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `delivery_fee` decimal(6,2) NOT NULL DEFAULT 0.00,
  `total` decimal(10,2) NOT NULL,
  `mp_preference_id` varchar(64) DEFAULT NULL,
  `mp_payment_id` varchar(64) DEFAULT NULL,
  `status` varchar(20) NOT NULL DEFAULT 'pendente',
  `order_id` int(11) DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT current_timestamp(),
  `pix_qr_code` text DEFAULT NULL,
  `pix_qr_base64` mediumtext DEFAULT NULL,
  `pix_expiration` datetime DEFAULT NULL,
  `delivery_method` varchar(20) NOT NULL DEFAULT 'entrega',
  PRIMARY KEY (`id`),
  UNIQUE KEY `external_reference` (`external_reference`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `cost` decimal(10,2) NOT NULL,
  `franchise` varchar(255) NOT NULL,
  `code` varchar(50) NOT NULL,
  `promotion_price` decimal(10,2) DEFAULT NULL,
  `created_at` datetime DEFAULT current_timestamp(),
  `estoque` int(11) NOT NULL DEFAULT 0,
  `sale_value` decimal(10,2) DEFAULT NULL,
  `image` varchar(255) DEFAULT NULL,
  `description` text DEFAULT NULL,
  `ean` varchar(14) DEFAULT NULL,
  `visivel_loja` tinyint(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (`id`),
  KEY `idx_code` (`code`),
  KEY `idx_franchise` (`franchise`)
) ENGINE=InnoDB AUTO_INCREMENT=140 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `promissorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nota_fiscal_id` int(11) NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `data_vencimento` date NOT NULL,
  `status` enum('Pendente','Pago') DEFAULT 'Pendente',
  `parcelas` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `nota_fiscal_id` (`nota_fiscal_id`),
  CONSTRAINT `prom_ibfk_1` FOREIGN KEY (`nota_fiscal_id`) REFERENCES `notas_fiscais` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=134 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `store_settings` (
  `skey` varchar(60) NOT NULL,
  `svalue` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`skey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `users` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `username` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `role` enum('admin','user') DEFAULT 'user',
  `created_at` datetime DEFAULT current_timestamp(),
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


-- ============================================================
-- Dados iniciais (idempotentes)
-- ============================================================

-- Usuário padrão: admin / admin123  (bcrypt rounds=10) — ALTERE após o primeiro login!
INSERT IGNORE INTO `users` (`username`, `password_hash`, `role`)
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin');

-- Percentuais de desconto por franquia
INSERT IGNORE INTO `franchise_discounts` (`franchise`, `percent`) VALUES
  ('Boticário', 15), ('Natura', 32), ('Avon', 32),
  ('Abelha Rainha', 20), ('Eudora', 30), ('Outros', 0);

-- Configurações da loja
INSERT IGNORE INTO `store_settings` (`skey`, `svalue`) VALUES
  ('cidade_entrega', 'São João da Boa Vista'),
  ('frete_padrao', '15.00'),
  ('endereco_retirada', ''),
  ('desconto_global_ativo', '0'),
  ('desconto_global_percent', '0');

-- ============================================================
-- Banco de testes (opcional — usado automaticamente na branch "Teste")
-- Para criá-lo, rode no MySQL:
--   CREATE DATABASE IF NOT EXISTS `db_pedidos_teste`
--     DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- e depois importe este mesmo arquivo trocando o USE acima, ou:
--   mysqldump -u root --no-data db_pedidos | mysql -u root db_pedidos_teste
-- ============================================================
