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
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.clients: ~2 rows (aproximadamente)
INSERT INTO `clients` (`id`, `name`, `address`, `house_number`, `neighborhood`, `phone`) VALUES
	(1, 'Guilherme Moraes', 'David Carvalho', '233', 'Pratinha', '1999544947'),
	(2, 'Teste', 'Teste teste teste', '1', 'teste', '1999544948'),
	(3, 'Guilherme Moraes Eleutério', 'David Carvalho Pinto', '234', 'Pratinha', '1999544947'),
	(4, 'Pedro', 'David Carvalho', '233', 'Pratinha', '1999544947');

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
) ENGINE=InnoDB AUTO_INCREMENT=12 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.orders: ~10 rows (aproximadamente)
INSERT INTO `orders` (`id`, `client_id`, `payment_method`, `installments`, `total_cost`, `combined_payment_value`, `status`) VALUES
	(1, 1, 'PIX', 1, 30.00, NULL, 'Pendente'),
	(2, 1, 'DINHEIRO', 1, 30.00, NULL, 'Pendente'),
	(3, 1, 'CARTÃO DE CRÉDITO', 1, 30.00, NULL, 'Pendente'),
	(4, 1, 'PARCELADO', 2, 30.00, NULL, 'Pendente'),
	(5, 1, 'PAGAMENTO COMBINADO', 2, 30.00, 15.00, 'Pendente'),
	(6, 1, 'PIX', 1, 45.00, NULL, 'Pendente'),
	(7, 1, 'PIX', 1, 44.00, NULL, 'Pendente'),
	(8, 2, 'PARCELADO', 2, 55.00, NULL, 'Pendente'),
	(9, 1, 'PARCELADO', 2, 30.00, NULL, 'Pendente'),
	(10, 1, 'PAGAMENTO COMBINADO', 2, 30.00, 15.00, 'Pendente'),
	(11, 2, 'PARCELADO', 3, 75.00, NULL, 'Pendente'),
	(12, 4, 'PIX', 1, 15.00, NULL, 'Pendente');

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

-- Copiando dados para a tabela cosmeticos_db.order_products: ~11 rows (aproximadamente)
INSERT INTO `order_products` (`order_id`, `product_id`, `sale_price`) VALUES
	(1, 1, 30.00),
	(2, 1, 30.00),
	(3, 1, 30.00),
	(4, 1, 30.00),
	(5, 1, 30.00),
	(6, 1, 45.00),
	(7, 1, 44.00),
	(8, 1, 30.00),
	(8, 2, 25.00),
	(9, 1, 30.00),
	(10, 1, 30.00),
	(11, 1, 45.00),
	(11, 2, 30.00),
	(12, 1, 15.00);

-- Copiando estrutura para tabela cosmeticos_db.products
CREATE TABLE IF NOT EXISTS `products` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `name` varchar(255) NOT NULL,
  `cost` decimal(10,2) NOT NULL,
  `franchise` varchar(255) NOT NULL,
  `code` varchar(50) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `code` (`code`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- Copiando dados para a tabela cosmeticos_db.products: ~2 rows (aproximadamente)
INSERT INTO `products` (`id`, `name`, `cost`, `franchise`, `code`) VALUES
	(1, 'Gel para Cabelo', 25.00, 'Boticário', '8080'),
	(2, 'Creme para Pés', 15.00, 'Eudora', '5566');

/*!40103 SET TIME_ZONE=IFNULL(@OLD_TIME_ZONE, 'system') */;
/*!40101 SET SQL_MODE=IFNULL(@OLD_SQL_MODE, '') */;
/*!40014 SET FOREIGN_KEY_CHECKS=IFNULL(@OLD_FOREIGN_KEY_CHECKS, 1) */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40111 SET SQL_NOTES=IFNULL(@OLD_SQL_NOTES, 1) */;
