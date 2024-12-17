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
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.clients: ~6 rows (aproximadamente)
INSERT INTO `clients` (`id`, `name`, `address`, `house_number`, `neighborhood`, `phone`) VALUES
	(1, 'Guilherme Moraes', 'David Carvalho', '233', 'Pratinha', '1999544947'),
	(2, 'Teste', 'Teste teste teste', '1', 'teste', '1999544948'),
	(3, 'Guilherme Moraes Eleutério', 'David Carvalho Pinto', '234', 'Pratinha', '1999544947'),
	(4, 'Pedro', 'David Carvalho', '233', 'Pratinha', '1999544947'),
	(5, 'Marcelo', 'Rua Gil Cabral de Vasconcelos', '445', 'Vila Valentin', '19995444938'),
	(6, 'Guilherme Missaci', 'Rua Santa Elisa', '100', 'Alto da Boa Vista', '1999999999');

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
) ENGINE=InnoDB AUTO_INCREMENT=41 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.orders: ~5 rows (aproximadamente)
INSERT INTO `orders` (`id`, `client_id`, `payment_method`, `installments`, `total_cost`, `combined_payment_value`, `status`) VALUES
	(19, 3, 'PARCELADO', 5, 110.00, NULL, 'Pendente'),
	(37, 2, 'CARTÃO DE CRÉDITO', 1, 35.00, NULL, 'Pendente'),
	(38, 5, 'PARCELADO', 2, 50.00, NULL, 'Pendente'),
	(39, 6, 'PAGAMENTO COMBINADO', 1, 100.00, 30.00, 'Pendente'),
	(40, 2, 'PAGAMENTO COMBINADO', 2, 55.00, 15.00, 'Pendente');

-- Copiando estrutura para tabela cosmeticos_db.order_products
CREATE TABLE IF NOT EXISTS `order_products` (
  `order_id` int(11) NOT NULL,
  `product_id` int(11) NOT NULL,
  `sale_price` decimal(10,2) NOT NULL,
  PRIMARY KEY (`order_id`,`product_id`),
  KEY `product_id` (`product_id`),
  CONSTRAINT `order_products_ibfk_1` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_products_ibfk_2` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.order_products: ~7 rows (aproximadamente)
INSERT INTO `order_products` (`order_id`, `product_id`, `sale_price`) VALUES
	(19, 1, 35.00),
	(19, 2, 30.00),
	(19, 4, 45.00),
	(37, 1, 35.00),
	(38, 4, 50.00),
	(39, 2, 100.00),
	(40, 2, 55.00);

-- Copiando estrutura para tabela cosmeticos_db.products
CREATE TABLE IF NOT EXISTS `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `cost` decimal(10,2) NOT NULL,
  `franchise` varchar(255) NOT NULL,
  `code` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.products: ~5 rows (aproximadamente)
INSERT INTO `products` (`id`, `name`, `cost`, `franchise`, `code`) VALUES
	(1, 'Gel para Cabelo', 25.00, 'Boticário', '8080'),
	(2, 'Creme para Pés', 15.00, 'Eudora', '5566'),
	(3, 'Shampoo', 15.00, 'Natura', '5555'),
	(4, 'KAIK', 25.00, 'Natura', '4444'),
	(5, 'Tadala', 12.00, 'Natura', '6768');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
