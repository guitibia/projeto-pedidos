-- --------------------------------------------------------
-- Servidor:                     127.0.0.1
-- Versão do servidor:           10.4.32-MariaDB - mariadb.org binary distribution
-- OS do Servidor:               Win64
-- HeidiSQL Versão:              12.7.0.6850
-- --------------------------------------------------------

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET NAMES utf8 */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;


-- Copiando estrutura do banco de dados para cosmeticos_db
CREATE DATABASE IF NOT EXISTS `cosmeticos_db` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci */;
USE `cosmeticos_db`;

-- Copiando estrutura para tabela cosmeticos_db.clients
CREATE TABLE IF NOT EXISTS `clients` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `address` varchar(255) NOT NULL,
  `house_number` varchar(50) NOT NULL,
  `neighborhood` varchar(255) NOT NULL,
  `phone` varchar(20) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.clients: ~9 rows (aproximadamente)
INSERT INTO `clients` (`id`, `name`, `address`, `house_number`, `neighborhood`, `phone`) VALUES
	(1, 'Guilherme Moraes', 'David Carvalho', '233', 'Pratinha', '1999544947'),
	(2, 'Teste', 'Teste teste teste', '1', 'teste', '1999544948'),
	(3, 'Guilherme Moraes Eleutério', 'David Carvalho Pinto', '234', 'Pratinha', '1999544947'),
	(4, 'Pedro', 'David Carvalho', '233', 'Pratinha', '1999544947'),
	(5, 'Marcelo', 'Rua Gil Cabral de Vasconcelos', '445', 'Vila Valentin', '19995444938'),
	(6, 'Guilherme Missaci', 'Rua Santa Elisa', '100', 'Alto da Boa Vista', '1999999999'),
	(7, 'Maria', 'Rua Doutor José Osório de Oliveira Azevedo', '33', 'Alto da Boa Vista', '1999544946'),
	(8, 'Erika', 'Rua David de Carvalho', '255', 'Vila Valentin', '1999544946'),
	(9, 'Camila', 'Rua David de Carvalho', '234', 'Vila Valentin', '1999544947'),
	(10, 'Thais', 'Rua David de Carvalho', '266', 'Vila Valentin', '1999544947'),
	(11, 'Luciana', 'Rua David de Carvalho', '555', 'Vila Valentin', '19995444945');

-- Copiando estrutura para tabela cosmeticos_db.notas_fiscais
CREATE TABLE IF NOT EXISTS `notas_fiscais` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `numero` varchar(50) NOT NULL,
  `data_emissao` date NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.notas_fiscais: ~1 rows (aproximadamente)
INSERT INTO `notas_fiscais` (`id`, `numero`, `data_emissao`, `valor`) VALUES
	(10, '5554', '2024-12-01', 1000.00),
	(11, '5554', '2024-12-01', 1000.00);

-- Copiando estrutura para tabela cosmeticos_db.orders
CREATE TABLE IF NOT EXISTS `orders` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `client_id` int(11) NOT NULL,
  `payment_method` enum('PIX','DINHEIRO','CARTÃO DE CRÉDITO','PARCELADO','PAGAMENTO COMBINADO') NOT NULL,
  `installments` int(11) DEFAULT NULL,
  `total_cost` decimal(10,2) NOT NULL,
  `combined_payment_value` decimal(10,2) DEFAULT NULL,
  `status` varchar(255) DEFAULT 'Pendente',
  PRIMARY KEY (`id`),
  KEY `client_id` (`client_id`),
  CONSTRAINT `orders_ibfk_1` FOREIGN KEY (`client_id`) REFERENCES `clients` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=87 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.orders: ~5 rows (aproximadamente)
INSERT INTO `orders` (`id`, `client_id`, `payment_method`, `installments`, `total_cost`, `combined_payment_value`, `status`) VALUES
	(77, 9, 'PIX', 1, 68.64, NULL, 'Pendente'),
	(78, 8, 'PIX', 1, 79.90, NULL, 'Pendente'),
	(79, 10, 'PIX', 1, 76.80, NULL, 'Pendente'),
	(81, 11, 'PIX', 1, 199.90, NULL, 'Pendente'),
	(82, 3, 'PIX', 1, 179.40, NULL, 'Pendente');

-- Copiando estrutura para tabela cosmeticos_db.order_products
CREATE TABLE IF NOT EXISTS `order_products` (
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `sale_price` decimal(10,2) NOT NULL,
  `not_came` tinyint(1) DEFAULT 0,
  `promotion_price` decimal(10,2) DEFAULT NULL,
  `quantity` int(11) DEFAULT 1,
  PRIMARY KEY (`order_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `order_products_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_products_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.order_products: ~7 rows (aproximadamente)
INSERT INTO `order_products` (`order_id`, `product_id`, `sale_price`, `not_came`, `promotion_price`, `quantity`) VALUES
	(77, 8, 34.32, 0, NULL, 2),
	(78, 9, 79.90, 0, NULL, 1),
	(79, 10, 76.80, 0, NULL, 1),
	(81, 11, 199.90, 0, NULL, 1),
	(82, 12, 29.90, 0, NULL, 2),
	(82, 13, 29.90, 0, NULL, 2),
	(82, 14, 29.90, 0, NULL, 2);

-- Copiando estrutura para tabela cosmeticos_db.parcelas
CREATE TABLE IF NOT EXISTS `parcelas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `promissoria_id` int(11) NOT NULL,
  `numero_parcela` int(11) NOT NULL,
  `data_vencimento` date NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `status` varchar(50) DEFAULT 'PENDENTE',
  PRIMARY KEY (`id`),
  KEY `promissoria_id` (`promissoria_id`),
  CONSTRAINT `parcelas_ibfk_1` FOREIGN KEY (`promissoria_id`) REFERENCES `promissorias` (`id`)
) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.parcelas: ~4 rows (aproximadamente)
INSERT INTO `parcelas` (`id`, `promissoria_id`, `numero_parcela`, `data_vencimento`, `valor`, `status`) VALUES
	(17, 12, 1, '2025-01-01', 250.00, 'PENDENTE'),
	(18, 12, 2, '2025-02-01', 250.00, 'PENDENTE'),
	(19, 12, 3, '2025-03-04', 250.00, 'PENDENTE'),
	(20, 12, 4, '2025-04-01', 250.00, 'PENDENTE');

-- Copiando estrutura para tabela cosmeticos_db.products
CREATE TABLE IF NOT EXISTS `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `cost` decimal(10,2) NOT NULL,
  `franchise` varchar(255) NOT NULL,
  `code` varchar(50) NOT NULL,
  `promotion_price` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.products: ~11 rows (aproximadamente)
INSERT INTO `products` (`id`, `name`, `cost`, `franchise`, `code`, `promotion_price`) VALUES
	(1, 'Gel para Cabelo', 25.00, 'Boticário', '8080', NULL),
	(2, 'Creme para Pés', 15.00, 'Eudora', '5566', NULL),
	(3, 'Shampoo', 15.00, 'Natura', '5555', NULL),
	(4, 'KAIK', 25.00, 'Natura', '4444', NULL),
	(5, 'Tadala', 12.00, 'Natura', '6768', NULL),
	(7, 'Creme para Pés', 15.00, 'Abelha Rainha', '4341', NULL),
	(8, 'Creme de Pentear Dr. Botica', 29.17, 'Boticário', '48745', NULL),
	(9, 'Refil Creme Liley Acetinado', 67.91, 'Boticário', '48062', NULL),
	(10, 'Colonia Comexion Masculina', 65.28, 'Boticário', '27707', NULL),
	(11, 'Colonia Coffe Seduction', 169.91, 'Boticário', '48139', NULL),
	(12, 'Body Spray Eudora', 20.93, 'Boticário', '58633', NULL),
	(13, 'Body Spray La Victoria', 20.93, 'Boticário', '58640', NULL),
	(14, 'Body Spray Lira', 20.93, 'Boticário', '58639', NULL);

-- Copiando estrutura para tabela cosmeticos_db.promissorias
CREATE TABLE IF NOT EXISTS `promissorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nota_fiscal_id` int(11) NOT NULL,
  `valor` decimal(10,2) NOT NULL,
  `data_vencimento` date NOT NULL,
  `status` enum('Pendente','Pago') DEFAULT 'Pendente',
  `parcelas` int(11) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `nota_fiscal_id` (`nota_fiscal_id`),
  CONSTRAINT `promissorias_ibfk_1` FOREIGN KEY (`nota_fiscal_id`) REFERENCES `notas_fiscais` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=13 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.promissorias: ~1 rows (aproximadamente)
INSERT INTO `promissorias` (`id`, `nota_fiscal_id`, `valor`, `data_vencimento`, `status`, `parcelas`) VALUES
	(12, 11, 1000.00, '2025-01-01', 'Pendente', 4);

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
