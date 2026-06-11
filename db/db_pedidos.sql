-- ============================================================
-- Sistema de Pedidos v2.0 — Schema atualizado
-- ============================================================

/*!40101 SET NAMES utf8mb4 */;
/*!40014 SET FOREIGN_KEY_CHECKS=0 */;

CREATE DATABASE IF NOT EXISTS `db_pedidos`
  DEFAULT CHARACTER SET utf8mb4
  COLLATE utf8mb4_general_ci;
USE `db_pedidos`;

-- ── Usuários (autenticação JWT/bcrypt) ───────────────────────
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT(11)      NOT NULL AUTO_INCREMENT,
  `username`      VARCHAR(100) NOT NULL UNIQUE,
  `password_hash` VARCHAR(255) NOT NULL,
  `role`          ENUM('admin','user') DEFAULT 'user',
  `created_at`    DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Usuário padrão: admin / admin123  (altere após o primeiro login!)
INSERT IGNORE INTO `users` (`username`, `password_hash`, `role`)
VALUES ('admin', '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy', 'admin');
-- senha acima = "admin123" com bcrypt rounds=10

-- ── Clientes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `clients` (
  `id`           INT(11)      NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(255) NOT NULL,
  `address`      VARCHAR(255) NOT NULL,
  `house_number` VARCHAR(50)  NOT NULL,
  `neighborhood` VARCHAR(255) NOT NULL,
  `phone`        VARCHAR(20)  DEFAULT NULL,
  `created_at`   DATETIME     DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `clients` (`id`,`name`,`address`,`house_number`,`neighborhood`,`phone`) VALUES
  (1,'Guilherme Moraes','David Carvalho','233','Pratinha','1999544947'),
  (2,'Teste','Teste teste teste','1','teste','1999544948'),
  (3,'Guilherme Moraes Eleutério','David Carvalho Pinto','234','Pratinha','1999544947'),
  (4,'Pedro','David Carvalho','233','Pratinha','1999544947'),
  (5,'Marcelo','Rua Gil Cabral de Vasconcelos','445','Vila Valentin','19995444938'),
  (6,'Guilherme Missaci','Rua Santa Elisa','100','Alto da Boa Vista','1999999999'),
  (7,'Maria','Rua Doutor José Osório de Oliveira Azevedo','33','Alto da Boa Vista','1999544946'),
  (8,'Erika','Rua David de Carvalho','255','Vila Valentin','1999544946'),
  (9,'Camila','Rua David de Carvalho','234','Vila Valentin','1999544947'),
  (10,'Thais','Rua David de Carvalho','266','Vila Valentin','1999544947'),
  (11,'Luciana','Rua David de Carvalho','555','Vila Valentin','19995444945');

-- ── Produtos ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `products` (
  `id`              INT(11)       NOT NULL AUTO_INCREMENT,
  `name`            VARCHAR(255)  NOT NULL,
  `cost`            DECIMAL(10,2) NOT NULL,
  `franchise`       VARCHAR(255)  NOT NULL,
  `code`            VARCHAR(50)   NOT NULL,
  `promotion_price` DECIMAL(10,2) DEFAULT NULL,
  `created_at`      DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_code`      (`code`),
  INDEX `idx_franchise` (`franchise`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `products` (`id`,`name`,`cost`,`franchise`,`code`) VALUES
  (1,'Gel para Cabelo',25.00,'Boticário','8080'),
  (2,'Creme para Pés',15.00,'Eudora','5566'),
  (3,'Shampoo',15.00,'Natura','5555'),
  (4,'KAIK',25.00,'Natura','4444'),
  (5,'Tadala',12.00,'Natura','6768'),
  (7,'Creme para Pés',15.00,'Abelha Rainha','4341'),
  (8,'Creme de Pentear Dr. Botica',29.17,'Boticário','48745'),
  (9,'Refil Creme Liley Acetinado',67.91,'Boticário','48062'),
  (10,'Colonia Comexion Masculina',65.28,'Boticário','27707'),
  (11,'Colonia Coffe Seduction',169.91,'Boticário','48139'),
  (12,'Body Spray Eudora',20.93,'Boticário','58633'),
  (13,'Body Spray La Victoria',20.93,'Boticário','58640'),
  (14,'Body Spray Lira',20.93,'Boticário','58639');

-- ── Pedidos ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `orders` (
  `id`                    INT(11)       NOT NULL AUTO_INCREMENT,
  `client_id`             INT(11)       NOT NULL,
  `payment_method`        ENUM('PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO') NOT NULL,
  `installments`          INT(11)       DEFAULT NULL,
  `total_cost`            DECIMAL(10,2) NOT NULL,
  `combined_payment_value` DECIMAL(10,2) DEFAULT NULL,
  `status`                VARCHAR(50)   DEFAULT 'Pendente',
  `created_at`            DATETIME      DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_status`     (`status`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_client_id`  (`client_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `orders` (`id`,`client_id`,`payment_method`,`installments`,`total_cost`,`combined_payment_value`,`status`) VALUES
  (77,9,'PIX',1,68.64,NULL,'Pendente'),
  (78,8,'PIX',1,79.90,NULL,'Pendente'),
  (79,10,'PIX',1,76.80,NULL,'Pendente'),
  (81,11,'PIX',1,199.90,NULL,'Pendente'),
  (82,3,'PIX',1,179.40,NULL,'Pendente'),
  (111,6,'PAGAMENTO COMBINADO',3,200.00,50.00,'Pendente');

-- ── Produtos por pedido ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS `order_products` (
  `order_id`       INT(11)       NOT NULL,
  `product_id`     INT(11)       NOT NULL,
  `sale_price`     DECIMAL(10,2) NOT NULL,
  `not_came`       TINYINT(1)    DEFAULT 0,
  `promotion_price` DECIMAL(10,2) DEFAULT NULL,
  `quantity`       INT(11)       DEFAULT 1,
  PRIMARY KEY (`order_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `op_ibfk_1` FOREIGN KEY (`order_id`)   REFERENCES `orders`  (`id`) ON DELETE CASCADE,
  CONSTRAINT `op_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `order_products` VALUES
  (77,8,34.32,0,NULL,2),
  (78,9,79.90,0,NULL,1),
  (79,10,76.80,0,NULL,1),
  (81,11,199.90,0,NULL,1),
  (82,12,29.90,0,NULL,2),
  (82,13,29.90,0,NULL,2),
  (82,14,29.90,0,NULL,2),
  (111,1,50.00,0,NULL,4);

-- ── Notas fiscais ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `notas_fiscais` (
  `id`           INT(11)       NOT NULL AUTO_INCREMENT,
  `numero`       VARCHAR(50)   NOT NULL,
  `data_emissao` DATE          NOT NULL,
  `valor`        DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `notas_fiscais` VALUES (16,'5554','2024-12-01',1000.00),(17,'4543','2024-12-02',900.00);

-- ── Promissórias ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `promissorias` (
  `id`             INT(11)       NOT NULL AUTO_INCREMENT,
  `nota_fiscal_id` INT(11)       NOT NULL,
  `valor`          DECIMAL(10,2) NOT NULL,
  `data_vencimento` DATE         NOT NULL,
  `status`         ENUM('Pendente','Pago') DEFAULT 'Pendente',
  `parcelas`       INT(11)       DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `nota_fiscal_id` (`nota_fiscal_id`),
  CONSTRAINT `prom_ibfk_1` FOREIGN KEY (`nota_fiscal_id`) REFERENCES `notas_fiscais` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `promissorias` VALUES (17,16,1000.00,'2025-01-01','Pendente',4);

-- ── Parcelas ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `parcelas` (
  `id`              INT(11)       NOT NULL AUTO_INCREMENT,
  `promissoria_id`  INT(11)       NOT NULL,
  `numero_parcela`  INT(11)       NOT NULL,
  `data_vencimento` DATE          NOT NULL,
  `valor`           DECIMAL(10,2) NOT NULL,
  `status`          ENUM('Pendente','Pago') DEFAULT 'Pendente',
  PRIMARY KEY (`id`),
  KEY `promissoria_id` (`promissoria_id`),
  CONSTRAINT `parc_ibfk_1` FOREIGN KEY (`promissoria_id`) REFERENCES `promissorias` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO `parcelas` VALUES
  (13,17,1,'2025-01-01',250.00,'Pago'),
  (14,17,2,'2025-02-01',250.00,'Pago'),
  (15,17,3,'2025-03-04',250.00,'Pago'),
  (16,17,4,'2025-04-01',250.00,'Pago');

/*!40014 SET FOREIGN_KEY_CHECKS=1 */;
