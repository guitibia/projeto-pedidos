-- ============================================================
-- Sistema de Pedidos - Banco completo (schema + dados)
-- Gerado de db_pedidos em: 2026-08-08
--
-- Como usar em outra maquina (XAMPP/MySQL):
--   mysql -u root < db/db_pedidos.sql
-- ou importe este arquivo pelo phpMyAdmin.
--
-- Depois: copie o .env (DB_USER/DB_PASSWORD) e rode `npm install && npm run dev`.
-- Login do painel: admin / admin123 (a menos que a senha ja tenha sido trocada -
-- os usuarios vao junto com os dados).
--
-- Seguro de re-executar: usa CREATE TABLE IF NOT EXISTS e INSERT IGNORE,
-- entao nao apaga nem sobrescreve nada num banco que ja exista.
--
-- O app ainda roda migracoes automaticas no boot (src/database/connection.js).
--
-- ATENCAO: este arquivo contem dados reais de clientes (nome, e-mail, CPF,
-- telefone, endereco). Mantenha o repositorio privado.
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

LOCK TABLES `clients` WRITE;
/*!40000 ALTER TABLE `clients` DISABLE KEYS */;
INSERT  IGNORE INTO `clients` (`id`, `name`, `address`, `house_number`, `neighborhood`, `phone`, `created_at`, `lat`, `lng`, `email`, `cpf`, `birthdate`, `password_hash`, `email_verified`, `verification_token`, `verification_expires`, `lgpd_consent_at`, `cep`, `city`, `pix_discount_percent`) VALUES (17,'Guilherme Missaci','Rua Santa Elisa','100','Alto da Boa Vista','19991127310','2026-07-03 00:01:29',NULL,NULL,'guimissaci5@gmail.com','44514038806','1997-01-14','$2a$10$gD2ct7hJe..36HJJpbxTd.ls6pcPbeD9CGcAsIWMZbq46P0u9fvpq',1,NULL,NULL,'2026-07-03 00:01:29','13873120','São João da Boa Vista',NULL),(18,'Bruno Macedo','Rua David de Carvalho','233','','21992559327','2026-07-03 00:30:06',NULL,NULL,'machadobruno1992@gmail.com','15556592764','1992-07-16','$2a$10$DxZxqB7/CIgd6Q18.5GlPOyuVkKwvtFWkFwm.3A/daBwOau037Lc.',1,NULL,NULL,'2026-07-03 00:30:06','13873020','São João da Boa Vista',NULL),(19,'Guilherme Moraes Eleutério','Rua David de Carvalho','233','Vila Valentin','19995444947','2026-07-14 16:33:29',NULL,NULL,'gui.14.2006@hotmail.com','42650460881','1994-03-24','$2a$10$j55tWAYSiRn8H35x1MA5weimB/oOPrsyc2S9WspRxIH9CNdC9WXsK',1,NULL,NULL,'2026-07-14 16:33:29','13873020','São João da Boa Vista',NULL),(20,'Gabriele Moraes','Rua Dimas Lopes Rezende','133','Recanto da Serra','19997203397','2026-08-04 19:59:55',-21.95144490,-46.79175370,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL),(21,'Beatriz Caroline','Rua Pelaio Alvares Junior','144','Jardim Aurora','19989050288','2026-08-04 20:04:10',-22.01213460,-46.77241060,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL),(22,'Sebastiana Carvalho Tabarim','Rua Santa Luzia','95','Alto da Boa Vista','19982568179','2026-08-04 20:06:23',-21.95796690,-46.80071190,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL),(23,'Maria Bernadete','Rua Rubens Jorge de Azevedo','67','Parque dos Resedás','19991511910','2026-08-04 20:09:06',-22.00679720,-46.77470670,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL),(24,'Indianara','Rua Francisca Justiniano','399','Jardim Recanto do Jaguari','19992473834','2026-08-04 20:11:30',-21.96823890,-46.80702940,NULL,NULL,NULL,NULL,0,NULL,NULL,NULL,NULL,NULL,NULL);
/*!40000 ALTER TABLE `clients` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `delivery_zones` WRITE;
/*!40000 ALTER TABLE `delivery_zones` DISABLE KEYS */;
INSERT  IGNORE INTO `delivery_zones` (`id`, `bairro`, `fee`, `active`) VALUES (1,'Alto da Boa Vista',10.00,1),(2,'Vila Valentin',10.00,1);
/*!40000 ALTER TABLE `delivery_zones` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `demanda_cod_vinculos` WRITE;
/*!40000 ALTER TABLE `demanda_cod_vinculos` DISABLE KEYS */;
/*!40000 ALTER TABLE `demanda_cod_vinculos` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `demanda_conciliacoes` WRITE;
/*!40000 ALTER TABLE `demanda_conciliacoes` DISABLE KEYS */;
/*!40000 ALTER TABLE `demanda_conciliacoes` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `demanda_itens` WRITE;
/*!40000 ALTER TABLE `demanda_itens` DISABLE KEYS */;
INSERT  IGNORE INTO `demanda_itens` (`id`, `pedido_id`, `fornecedor_cnpj`, `fornecedor_nome`, `codigo`, `nome`, `qtd_pedida`, `qtd_recebida`, `preco_venda`, `product_id`, `status`, `order_id`, `created_at`) VALUES (9,2,NULL,NULL,'244986','Batom Kiss Matte Latte',3,0,21.99,NULL,'pendente',NULL,'2026-08-04 23:15:57'),(10,3,NULL,NULL,'206233','Care Footworks Pés',1,0,23.99,NULL,'pendente',NULL,'2026-08-04 23:17:46'),(11,4,NULL,NULL,'190381','Roll-On Floral Adocicado Aquavibe',2,0,7.66,NULL,'pendente',NULL,'2026-08-04 23:20:48'),(12,4,NULL,NULL,'190386','Roll-On Frutal Floral Petit',1,0,7.66,NULL,'pendente',NULL,'2026-08-04 23:21:34'),(13,5,NULL,NULL,'248225','Garrafa Toy Story',1,0,30.00,NULL,'pendente',NULL,'2026-08-04 23:22:27'),(17,6,NULL,NULL,'148381','Touca de Banho Trevo',1,0,2.99,NULL,'pendente',NULL,'2026-08-04 23:25:43'),(18,6,NULL,NULL,'136431','Escova de Banho Rosa',1,0,23.99,NULL,'pendente',NULL,'2026-08-04 23:26:47'),(19,5,NULL,NULL,'196396','Touca Difusora Telada',1,0,19.99,NULL,'pendente',NULL,'2026-08-04 23:27:30'),(20,5,NULL,NULL,'196394','Escova Côncova Flex',1,0,25.99,NULL,'pendente',NULL,'2026-08-04 23:28:08'),(21,6,NULL,NULL,'206661','Marmita Dupla com Cinta Stitch',1,0,39.99,NULL,'pendente',NULL,'2026-08-04 23:29:03');
/*!40000 ALTER TABLE `demanda_itens` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `demanda_pedidos` WRITE;
/*!40000 ALTER TABLE `demanda_pedidos` DISABLE KEYS */;
INSERT  IGNORE INTO `demanda_pedidos` (`id`, `client_id`, `observacao`, `status`, `created_at`) VALUES (2,20,'Sobrinha','aberto','2026-08-04 23:12:43'),(3,21,NULL,'aberto','2026-08-04 23:16:32'),(4,22,NULL,'aberto','2026-08-04 23:18:07'),(5,24,NULL,'aberto','2026-08-04 23:22:07'),(6,23,NULL,'aberto','2026-08-04 23:23:19');
/*!40000 ALTER TABLE `demanda_pedidos` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `estoque_movimentacoes` WRITE;
/*!40000 ALTER TABLE `estoque_movimentacoes` DISABLE KEYS */;
INSERT  IGNORE INTO `estoque_movimentacoes` (`id`, `product_id`, `tipo`, `quantidade`, `observacao`, `created_at`, `origem`, `nf_id`) VALUES (13,19,'Entrada',21,'Estoque inicial','2026-06-19 15:11:18','Manual',NULL),(14,20,'Entrada',16,'Estoque inicial','2026-06-19 15:12:14','Manual',NULL),(15,21,'Entrada',12,'Estoque inicial','2026-06-19 15:12:54','Manual',NULL),(16,22,'Entrada',12,'Estoque inicial','2026-06-19 15:13:56','Manual',NULL),(17,23,'Entrada',4,'Estoque inicial','2026-06-19 15:15:02','Manual',NULL),(18,24,'Entrada',5,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(19,25,'Entrada',10,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(20,26,'Entrada',1,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(21,27,'Entrada',3,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(22,28,'Entrada',2,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(23,29,'Entrada',1,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(24,30,'Entrada',1,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(25,31,'Entrada',13,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(27,33,'Entrada',2,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(28,34,'Entrada',4,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(29,35,'Entrada',2,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(30,36,'Entrada',1,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(31,37,'Entrada',1,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(32,38,'Entrada',1,'Estoque inicial','2026-06-19 15:38:04','Manual',NULL),(33,39,'Entrada',1,'Estoque inicial','2026-06-19 15:38:05','Manual',NULL),(34,40,'Entrada',1,'Estoque inicial','2026-06-19 15:46:24','Manual',NULL),(35,41,'Entrada',1,'Estoque inicial','2026-06-19 15:46:24','Manual',NULL),(36,42,'Entrada',1,'Estoque inicial','2026-06-19 15:46:24','Manual',NULL),(37,43,'Entrada',1,'Estoque inicial','2026-06-19 15:46:24','Manual',NULL),(38,44,'Entrada',1,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(39,45,'Entrada',1,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(40,46,'Entrada',3,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(41,47,'Entrada',1,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(42,48,'Entrada',1,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(43,49,'Entrada',1,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(44,50,'Entrada',2,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(45,51,'Entrada',2,'Estoque inicial','2026-06-19 15:54:04','Manual',NULL),(46,52,'Entrada',2,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(47,53,'Entrada',2,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(48,54,'Entrada',2,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(49,55,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(50,56,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(51,57,'Entrada',2,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(52,58,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(53,59,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(54,60,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(55,61,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(56,62,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(57,63,'Entrada',1,'Estoque inicial','2026-06-19 16:04:44','Manual',NULL),(58,64,'Entrada',1,'Estoque inicial','2026-06-19 16:08:02','Manual',NULL),(59,65,'Entrada',1,'Estoque inicial','2026-06-19 16:08:02','Manual',NULL),(60,66,'Entrada',4,'Estoque inicial','2026-06-19 16:35:14','Manual',NULL),(61,67,'Entrada',1,'Estoque inicial','2026-06-19 16:38:35','Manual',NULL),(62,68,'Entrada',1,'Estoque inicial','2026-06-19 16:38:35','Manual',NULL),(63,69,'Entrada',1,'Estoque inicial','2026-06-19 16:38:35','Manual',NULL),(64,70,'Entrada',3,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(65,71,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(66,72,'Entrada',5,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(67,73,'Entrada',2,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(68,74,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(69,75,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(70,76,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(71,77,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(72,78,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(73,79,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(74,80,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(75,81,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(76,82,'Entrada',5,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(77,83,'Entrada',3,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(78,84,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(79,85,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(80,86,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(81,87,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(82,88,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(83,89,'Entrada',5,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(84,90,'Entrada',2,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(85,91,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(86,92,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(87,93,'Entrada',4,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(88,94,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(89,95,'Entrada',3,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(90,96,'Entrada',2,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(91,97,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(92,98,'Entrada',2,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(93,99,'Entrada',3,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(94,100,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(95,101,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(96,102,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(97,103,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(98,104,'Entrada',2,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(99,105,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(100,106,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(101,107,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(102,108,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(103,109,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(104,110,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(105,111,'Entrada',1,'Estoque inicial','2026-06-19 18:01:08','Manual',NULL),(106,76,'Entrada',1,'Correção','2026-06-19 18:12:38','Manual',NULL),(107,112,'Entrada',5,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(108,113,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(109,114,'Entrada',2,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(110,115,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(111,116,'Entrada',2,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(112,117,'Entrada',5,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(113,118,'Entrada',2,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(114,119,'Entrada',2,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(115,120,'Entrada',8,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(116,121,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(117,122,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(118,123,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(119,124,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(120,125,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(121,126,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(122,127,'Entrada',2,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(123,128,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(124,129,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(125,130,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(126,131,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(127,132,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(128,133,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(129,134,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(130,135,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(131,136,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(132,137,'Entrada',1,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(133,138,'Entrada',2,'Estoque inicial','2026-06-19 18:53:17','Manual',NULL),(134,115,'Saída',1,'Pedido #127','2026-06-19 23:33:11','Manual',NULL),(135,86,'Saída',1,'Pedido #128','2026-06-19 23:33:52','Manual',NULL),(136,70,'Saída',1,'Pedido #129','2026-06-19 23:44:18','Manual',NULL),(137,90,'Saída',1,'Pedido #130','2026-06-19 23:52:35','Manual',NULL),(138,90,'Saída',1,'Pedido #131','2026-06-19 23:55:49','Manual',NULL),(139,94,'Saída',1,'Pedido #132','2026-06-20 01:28:34','Manual',NULL),(140,89,'Saída',1,'Pedido #133','2026-06-20 02:37:39','Manual',NULL),(141,89,'Saída',1,'Pedido #134','2026-06-20 02:38:13','Manual',NULL),(142,89,'Saída',1,'Pedido #135','2026-06-20 02:39:01','Manual',NULL),(143,89,'Saída',1,'Pedido #136','2026-06-20 02:39:01','Manual',NULL),(144,89,'Entrada',1,'Pedido #135 cancelado','2026-06-20 02:39:01','Manual',NULL),(145,89,'Entrada',1,'Pedido #136 excluído','2026-06-20 02:39:01','Manual',NULL),(146,89,'Entrada',1,'Pedido #135 excluído','2026-06-20 03:02:19','Manual',NULL),(147,89,'Entrada',1,'Pedido #134 excluído','2026-06-20 03:02:21','Manual',NULL),(148,89,'Entrada',1,'Pedido #133 excluído','2026-06-20 03:02:34','Manual',NULL),(149,89,'Saída',1,NULL,'2026-06-22 03:18:39','Manual',NULL),(150,90,'Saída',1,'Pedido #137','2026-06-22 03:24:19','Manual',NULL),(151,75,'Saída',1,'Pedido #137','2026-06-22 03:24:19','Manual',NULL),(152,75,'Entrada',1,'Pedido #137 cancelado','2026-06-22 03:25:07','Manual',NULL),(153,90,'Entrada',1,'Pedido #137 cancelado','2026-06-22 03:25:07','Manual',NULL),(154,75,'Entrada',1,'Pedido #137 excluído','2026-06-22 03:34:49','Manual',NULL),(155,90,'Entrada',1,'Pedido #137 excluído','2026-06-22 03:34:49','Manual',NULL),(156,112,'Saída',1,'Pedido #138 (loja)','2026-06-27 00:37:17','Manual',NULL),(157,112,'Entrada',1,'Pedido #138 excluído','2026-06-27 04:02:09','Manual',NULL);
/*!40000 ALTER TABLE `estoque_movimentacoes` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `favorites` WRITE;
/*!40000 ALTER TABLE `favorites` DISABLE KEYS */;
/*!40000 ALTER TABLE `favorites` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `franchise_discounts` (
  `franchise` varchar(255) NOT NULL,
  `percent` decimal(5,2) NOT NULL DEFAULT 0.00,
  PRIMARY KEY (`franchise`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `franchise_discounts` WRITE;
/*!40000 ALTER TABLE `franchise_discounts` DISABLE KEYS */;
INSERT  IGNORE INTO `franchise_discounts` (`franchise`, `percent`) VALUES ('Abelha Rainha',20.00),('Avon',32.00),('Boticário',15.00),('Eudora',30.00),('Natura',32.00),('Outros',0.00);
/*!40000 ALTER TABLE `franchise_discounts` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `nf_entrada_itens` WRITE;
/*!40000 ALTER TABLE `nf_entrada_itens` DISABLE KEYS */;
/*!40000 ALTER TABLE `nf_entrada_itens` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `nf_entradas` WRITE;
/*!40000 ALTER TABLE `nf_entradas` DISABLE KEYS */;
/*!40000 ALTER TABLE `nf_entradas` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `nf_item_vinculos` WRITE;
/*!40000 ALTER TABLE `nf_item_vinculos` DISABLE KEYS */;
/*!40000 ALTER TABLE `nf_item_vinculos` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `notas_fiscais` WRITE;
/*!40000 ALTER TABLE `notas_fiscais` DISABLE KEYS */;
INSERT  IGNORE INTO `notas_fiscais` (`id`, `numero`, `fornecedor`, `data_emissao`, `valor`) VALUES (16,'5554',NULL,'2024-12-01',1000.00),(17,'4543',NULL,'2024-12-02',900.00),(18,'5554',NULL,'2026-06-10',1500.00),(19,'5554',NULL,'2026-06-11',1000.00),(20,'4544',NULL,'2026-06-11',1500.00),(21,'487139',NULL,'2026-06-03',1450.40),(22,'487139',NULL,'2026-06-03',1450.40),(23,'487139',NULL,'2026-06-03',1450.40),(24,'45554100',NULL,'2026-06-06',886.73),(25,'T1','Natura','2026-06-12',400.00),(26,'TEST003','Natura','2026-06-12',400.00),(27,'489152','Boticário','2026-06-09',877.58),(28,'487139','Boticário','2026-06-03',1450.40),(29,'45553100','Natura','2026-06-06',886.73),(30,'45563981','Natura','2026-07-07',779.64),(31,NULL,'Boticário',NULL,147.58),(32,NULL,'Boticário',NULL,147.58),(33,NULL,'Boticário',NULL,147.58),(34,NULL,'Boticário',NULL,147.59),(35,NULL,'Boticário',NULL,53.06),(36,NULL,'Boticário',NULL,53.06),(37,NULL,'Boticário',NULL,53.06),(38,NULL,'Boticário',NULL,53.06),(39,NULL,'Boticário',NULL,53.05),(40,NULL,'Boticário',NULL,350.65),(41,NULL,'Boticário',NULL,163.31),(42,NULL,'Boticário',NULL,206.52),(43,NULL,'Boticário',NULL,10.65),(44,NULL,'Boticário',NULL,219.40),(45,NULL,'Boticário',NULL,126.59),(46,NULL,'Boticário',NULL,169.16),(47,NULL,'Boticário',NULL,321.25),(48,NULL,'Boticário',NULL,130.38),(49,NULL,'Boticário',NULL,180.61),(50,NULL,'Boticário',NULL,282.44),(51,NULL,'Boticário',NULL,208.23),(52,NULL,'Boticário',NULL,271.52),(53,NULL,'Boticário',NULL,15.22),(54,NULL,'Boticário',NULL,137.02),(55,NULL,'Natura/Avon',NULL,295.58),(56,NULL,'Natura/Avon',NULL,281.69),(57,NULL,'Natura/Avon',NULL,306.00),(58,NULL,'Natura/Avon',NULL,259.88),(59,NULL,'Natura/Avon',NULL,257.06),(60,NULL,'Natura/Avon',NULL,122.98),(61,NULL,'Natura/Avon',NULL,329.24),(62,NULL,'Natura/Avon',NULL,261.39),(63,NULL,'Natura/Avon',NULL,100.17),(64,NULL,'Natura/Avon',NULL,332.06),(65,NULL,'Natura/Avon',NULL,256.08),(66,NULL,'Natura/Avon',NULL,295.58),(67,NULL,'Natura/Avon',NULL,259.88),(68,NULL,'Natura/Avon',NULL,329.24),(69,NULL,'Natura/Avon',NULL,261.40),(70,NULL,'Natura/Avon',NULL,295.57),(71,NULL,'Natura/Avon',NULL,259.88),(72,NULL,'Boticário',NULL,163.32),(73,NULL,'Boticário',NULL,206.52),(74,NULL,'Boticário',NULL,10.65),(75,NULL,'Boticário',NULL,169.16),(76,NULL,'Boticário',NULL,130.38),(77,NULL,'Boticário',NULL,180.61),(78,NULL,'Boticário',NULL,282.42),(79,NULL,'Boticário',NULL,15.22),(80,NULL,'Boticário',NULL,137.03),(81,NULL,'Boticário',NULL,219.38),(82,NULL,'Boticário',NULL,206.53),(83,NULL,'Boticário',NULL,10.62),(84,NULL,'Boticário',NULL,219.40),(85,NULL,'Boticário',NULL,169.15),(86,NULL,'Boticário',NULL,130.40),(87,NULL,'Boticário',NULL,180.61),(88,NULL,'Boticário',NULL,219.40),(89,NULL,'Boticário',NULL,219.40),(90,NULL,'Natura/Avon',NULL,108.61),(91,NULL,'Natura/Avon',NULL,220.54),(92,NULL,'Natura/Avon',NULL,108.60),(93,NULL,'Natura/Avon',NULL,220.54),(94,NULL,'Natura/Avon',NULL,220.54),(95,NULL,'Natura/Avon',NULL,220.54),(96,NULL,'Natura/Avon',NULL,220.54),(97,NULL,'Boticário',NULL,203.27),(98,NULL,'Boticário',NULL,203.27),(99,NULL,'Boticário',NULL,203.27),(100,NULL,'Boticário',NULL,203.27),(101,NULL,'Natura/Avon',NULL,129.24),(102,NULL,'Natura/Avon',NULL,129.24),(103,NULL,'Natura/Avon',NULL,129.24),(104,NULL,'Natura/Avon',NULL,129.24),(105,NULL,'Boticário',NULL,230.04),(106,NULL,'Boticário',NULL,142.97),(107,NULL,'Boticário',NULL,230.04),(108,NULL,'Boticário',NULL,142.97),(109,NULL,'Boticário',NULL,230.04),(110,NULL,'Boticário',NULL,142.97),(111,NULL,'Boticário',NULL,230.06),(112,NULL,'Boticário',NULL,142.96),(113,NULL,'Boticário',NULL,142.97),(114,NULL,'Boticário',NULL,143.34),(115,NULL,'Boticário',NULL,143.34),(116,NULL,'Boticário',NULL,143.33),(117,NULL,'Natura/Avon',NULL,69.54),(118,NULL,'Natura/Avon',NULL,244.19),(119,NULL,'Natura/Avon',NULL,69.55),(120,NULL,'Natura/Avon',NULL,244.19),(121,NULL,'Natura/Avon',NULL,244.19),(122,NULL,'Natura/Avon',NULL,244.19),(123,NULL,'Natura/Avon',NULL,69.54),(124,NULL,'Boticário',NULL,143.34),(125,NULL,'Natura/Avon',NULL,116.46),(126,NULL,'Natura/Avon',NULL,116.46),(127,NULL,'Natura/Avon',NULL,116.46),(128,NULL,'Natura/Avon',NULL,116.46),(129,NULL,'Boticário',NULL,181.18),(130,NULL,'Boticário',NULL,181.18),(131,NULL,'Boticário',NULL,181.18),(132,NULL,'Boticário',NULL,181.18),(133,NULL,'Natura/Avon',NULL,151.01);
/*!40000 ALTER TABLE `notas_fiscais` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `order_parcelas` WRITE;
/*!40000 ALTER TABLE `order_parcelas` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_parcelas` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `order_products` WRITE;
/*!40000 ALTER TABLE `order_products` DISABLE KEYS */;
/*!40000 ALTER TABLE `order_products` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `orders` WRITE;
/*!40000 ALTER TABLE `orders` DISABLE KEYS */;
/*!40000 ALTER TABLE `orders` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `parcelas` WRITE;
/*!40000 ALTER TABLE `parcelas` DISABLE KEYS */;
INSERT  IGNORE INTO `parcelas` (`id`, `promissoria_id`, `numero_parcela`, `data_vencimento`, `valor`, `status`, `numero_boleto`) VALUES (53,28,1,'2026-07-03',362.60,'Pago',NULL),(54,28,2,'2026-08-03',362.60,'Pago',NULL),(55,28,3,'2026-09-02',362.60,'Pendente',NULL),(56,28,4,'2026-10-02',362.60,'Pendente',NULL),(63,31,1,'2026-07-10',147.58,'Pago',NULL),(64,32,1,'2026-08-10',147.58,'Pago',NULL),(65,33,1,'2026-09-09',147.58,'Pendente',NULL),(66,34,1,'2026-10-09',147.59,'Pendente',NULL),(67,35,1,'2026-07-10',53.06,'Pago',NULL),(68,36,1,'2026-08-10',53.06,'Pago',NULL),(69,37,1,'2026-09-09',53.06,'Pendente',NULL),(70,38,1,'2026-10-09',53.06,'Pendente',NULL),(71,39,1,'2026-11-09',53.05,'Pendente',NULL),(72,40,1,'2026-07-06',350.65,'Pago',NULL),(73,41,1,'2026-07-06',163.31,'Pago',NULL),(74,42,1,'2026-07-08',206.52,'Pago',NULL),(75,43,1,'2026-07-08',10.65,'Pago',NULL),(77,45,1,'2026-07-10',126.59,'Pago',NULL),(78,46,1,'2026-07-13',169.16,'Pago',NULL),(79,47,1,'2026-07-17',321.25,'Pago',NULL),(80,48,1,'2026-07-20',130.38,'Pago',NULL),(81,49,1,'2026-07-22',180.61,'Pago',NULL),(82,50,1,'2026-07-22',282.44,'Pago',NULL),(83,51,1,'2026-07-27',208.23,'Pago',NULL),(84,52,1,'2026-07-27',271.52,'Pago',NULL),(85,53,1,'2026-07-29',15.22,'Pago',NULL),(86,54,1,'2026-07-29',137.02,'Pago',NULL),(87,55,1,'2026-07-06',295.58,'Pago',NULL),(88,56,1,'2026-07-06',281.69,'Pago',NULL),(89,57,1,'2026-07-07',306.00,'Pago',NULL),(90,58,1,'2026-07-07',259.88,'Pago',NULL),(91,59,1,'2026-07-13',257.06,'Pago',NULL),(92,60,1,'2026-07-13',122.98,'Pago',NULL),(93,61,1,'2026-07-13',329.24,'Pago',NULL),(94,62,1,'2026-07-20',261.39,'Pago',NULL),(95,63,1,'2026-07-21',100.17,'Pago',NULL),(96,64,1,'2026-07-22',332.06,'Pago',NULL),(97,65,1,'2026-07-23',256.08,'Pago',NULL),(98,66,1,'2026-08-05',295.58,'Pago',NULL),(99,67,1,'2026-08-06',259.88,'Pago',NULL),(100,68,1,'2026-08-12',329.24,'Pago',NULL),(101,69,1,'2026-08-18',261.40,'Pago',NULL),(102,70,1,'2026-09-04',295.57,'Pendente',NULL),(103,71,1,'2026-09-08',259.88,'Pendente',NULL),(104,72,1,'2026-08-05',163.32,'Pago',NULL),(105,73,1,'2026-08-07',206.52,'Pago',NULL),(106,74,1,'2026-08-07',10.65,'Pago',NULL),(107,75,1,'2026-08-12',169.16,'Pago',NULL),(108,76,1,'2026-08-19',130.38,'Pago',NULL),(109,77,1,'2026-08-21',180.61,'Pago',NULL),(110,78,1,'2026-08-21',282.42,'Pago',NULL),(111,79,1,'2026-08-28',15.22,'Pago',NULL),(112,80,1,'2026-08-28',137.03,'Pago',NULL),(113,81,1,'2026-10-09',219.38,'Pendente',NULL),(114,82,1,'2026-09-08',206.53,'Pendente',NULL),(115,83,1,'2026-09-08',10.62,'Pendente',NULL),(116,84,1,'2026-09-09',219.40,'Pendente',NULL),(117,85,1,'2026-09-11',169.15,'Pendente',NULL),(118,86,1,'2026-09-19',130.40,'Pendente',NULL),(119,87,1,'2026-09-21',180.61,'Pendente',NULL),(120,88,1,'2026-08-10',219.40,'Pago',NULL),(121,89,1,'2026-07-10',219.40,'Pago',NULL),(122,90,1,'2026-07-16',108.61,'Pago',NULL),(123,91,1,'2026-07-27',220.54,'Pago',NULL),(124,92,1,'2026-08-17',108.60,'Pago',NULL),(125,93,1,'2026-08-26',220.54,'Pago',NULL),(126,94,1,'2026-09-25',220.54,'Pendente',NULL),(127,95,1,'2026-10-15',220.54,'Pendente',NULL),(128,96,1,'2026-11-24',220.54,'Pendente',NULL),(129,97,1,'2026-07-17',203.27,'Pago',NULL),(130,98,1,'2026-08-17',203.27,'Pago',NULL),(131,99,1,'2026-09-16',203.27,'Pendente',NULL),(132,100,1,'2026-10-16',203.27,'Pendente',NULL),(133,101,1,'2026-08-02',129.24,'Pago',NULL),(134,102,1,'2026-09-01',129.24,'Pendente',NULL),(135,103,1,'2026-10-01',129.24,'Pendente',NULL),(136,104,1,'2026-10-31',129.24,'Pendente',NULL),(137,105,1,'2026-08-03',230.04,'Pago',NULL),(138,106,1,'2026-08-07',142.97,'Pago',NULL),(139,107,1,'2026-09-02',230.04,'Pendente',NULL),(140,108,1,'2026-09-08',142.97,'Pendente',NULL),(141,109,1,'2026-10-02',230.04,'Pendente',NULL),(143,111,1,'2026-11-03',230.06,'Pendente',NULL),(144,112,1,'2026-11-09',142.96,'Pendente',NULL),(145,113,1,'2026-10-08',142.97,'Pendente',NULL),(146,114,1,'2026-09-14',143.34,'Pendente',NULL),(147,115,1,'2026-10-14',143.34,'Pendente',NULL),(148,116,1,'2026-11-13',143.33,'Pendente',NULL),(149,117,1,'2026-09-14',69.54,'Pendente',NULL),(150,118,1,'2026-09-17',244.19,'Pendente',NULL),(151,119,1,'2026-10-14',69.55,'Pendente',NULL),(152,120,1,'2026-10-17',244.19,'Pendente',NULL),(153,121,1,'2026-11-16',244.19,'Pendente',NULL),(154,122,1,'2026-12-16',244.19,'Pendente',NULL),(155,123,1,'2026-08-15',69.54,'Pago',NULL),(156,124,1,'2026-08-14',143.34,'Pago',NULL),(157,125,1,'2026-08-22',116.46,'Pago',NULL),(158,126,1,'2026-09-21',116.46,'Pendente',NULL),(159,127,1,'2026-10-21',116.46,'Pendente',NULL),(160,128,1,'2026-11-20',116.46,'Pendente',NULL),(161,129,1,'2026-08-20',181.18,'Pago',NULL),(162,130,1,'2026-09-21',181.18,'Pendente',NULL),(163,131,1,'2026-10-21',181.18,'Pendente',NULL),(164,132,1,'2026-11-23',181.18,'Pendente',NULL),(165,133,1,'2026-08-18',151.01,'Pago','28035008-7');
/*!40000 ALTER TABLE `parcelas` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `payment_intents` WRITE;
/*!40000 ALTER TABLE `payment_intents` DISABLE KEYS */;
INSERT  IGNORE INTO `payment_intents` (`id`, `client_id`, `external_reference`, `items_json`, `address`, `house_number`, `neighborhood`, `cep`, `city`, `subtotal`, `delivery_fee`, `total`, `mp_preference_id`, `mp_payment_id`, `status`, `order_id`, `created_at`, `pix_qr_code`, `pix_qr_base64`, `pix_expiration`, `delivery_method`) VALUES (1,14,'a80792c9970652c2cff2b1b9cc7ac8d8a677092ce55533877bb239ac0bb5d9da','[{\"id\": 112, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 60}]','David Carvalho','233','Vila Valentin',NULL,'São João da Boa Vista',60.00,0.00,60.00,NULL,'165995152428','pendente',NULL,'2026-06-27 00:30:58','00020126580014br.gov.bcb.pix01365d745800-f634-4538-b78a-84898e086a37520400005303986540560.005802BR5911MOGU77756316009Sao Paulo62250521mpqrinter16599515242863042D2F','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','2026-06-26 21:45:59','entrega'),(2,15,'4cbf5f23e222f8bfc1c93abce9722feceff87a4f4e0de5d72466e332b2e06392','[{\"id\": 113, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 68}, {\"id\": 114, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 75}, {\"id\": 115, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 75}]','Rua Santa Elisa','100','Alto da Boa Vista','13873120','São João da Boa Vista',218.00,10.00,228.00,NULL,'165994730674','pendente',NULL,'2026-06-27 00:31:13','00020126580014br.gov.bcb.pix01365d745800-f634-4538-b78a-84898e086a375204000053039865406228.005802BR5911MOGU77756316009Sao Paulo62250521mpqrinter16599473067463044B3D','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','2026-06-26 21:46:14','entrega'),(3,14,'941f165accf6d8ee1eb2abc46516941655944559039d9842c2c7ffaba49faf87','[{\"id\": 112, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 60}]','Rua David de Carvalho','233','Vila Valentin','13873020','São João da Boa Vista',60.00,0.00,60.00,'201300025-ac23a62f-bc54-4052-b7b5-99a89a8ddb9c',NULL,'pendente',NULL,'2026-06-27 00:31:56',NULL,NULL,NULL,'entrega'),(4,15,'e2719b449d717a7d9ba9f66729d09bb860f8c33fdb3a4abd6d3762592251a5cf','[{\"id\": 112, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 0.01}]','Rua Santa Elisa','100','Alto da Boa Vista','13873120','São João da Boa Vista',0.01,10.00,10.01,NULL,'165994638962','pendente',NULL,'2026-06-27 00:33:57','00020126580014br.gov.bcb.pix01365d745800-f634-4538-b78a-84898e086a37520400005303986540510.015802BR5911MOGU77756316009Sao Paulo62250521mpqrinter16599463896263045F1A','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','2026-06-26 21:48:57','entrega'),(5,15,'a35f4f0e7c104dbfe74f0f85a59420164395c8413f7733133ba4cb24d431248e','[{\"id\": 112, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 0.01}]','Rua David de Carvalho','233','Vila Valentin','13873020','São João da Boa Vista',0.01,0.00,0.01,NULL,'165166463137','pago',138,'2026-06-27 00:36:22','00020126580014br.gov.bcb.pix01365d745800-f634-4538-b78a-84898e086a3752040000530398654040.015802BR5911MOGU77756316009Sao Paulo62250521mpqrinter16516646313763044A16','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','2026-06-26 21:51:23','entrega'),(6,18,'28992163b92b4544fc6078e1b7e3afd6d7f899adc88ab0952e3f91baa9c965ae','[{\"id\": 112, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 60}, {\"id\": 70, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 44.9}, {\"id\": 67, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 59.9}, {\"id\": 114, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 75}, {\"id\": 68, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 39.9}, {\"id\": 71, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 59.9}, {\"id\": 113, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 68}, {\"id\": 138, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 60}, {\"id\": 137, \"qty\": 1, \"costPrice\": null, \"unitPrice\": 93}]','Rua David de Carvalho','233','','13873020','São João da Boa Vista',560.60,10.00,570.60,NULL,'166078157971','pendente',NULL,'2026-07-03 00:34:02','00020126580014br.gov.bcb.pix01365d745800-f634-4538-b78a-84898e086a375204000053039865406570.605802BR5911MOGU77756316009Sao Paulo62250521mpqrinter16607815797163047909','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','2026-07-02 21:49:02','entrega');
/*!40000 ALTER TABLE `payment_intents` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `products` WRITE;
/*!40000 ALTER TABLE `products` DISABLE KEYS */;
INSERT  IGNORE INTO `products` (`id`, `name`, `cost`, `franchise`, `code`, `promotion_price`, `created_at`, `estoque`, `sale_value`, `image`, `description`, `ean`, `visivel_loja`) VALUES (19,'Sabonete Todo Dia  - 5 UNID',23.80,'Natura','1',NULL,'2026-06-19 12:11:18',21,35.00,NULL,NULL,NULL,1),(20,'Body Splash Todo Dia Nata',65.89,'Natura','2',NULL,'2026-06-19 12:12:14',16,96.90,'/uploads/products/p20_1783303317235.webp',NULL,NULL,1),(21,'Creme Todo Dia Natura - 400ml',53.65,'Natura','3',NULL,'2026-06-19 12:12:54',12,78.90,NULL,NULL,NULL,1),(22,'Sabonete Todo Dia - 2 UNID',15.57,'Natura','4',NULL,'2026-06-19 12:13:56',12,22.90,NULL,NULL,NULL,1),(23,'Creme de mão Todo Dia - 50 GR',27.13,'Natura','5',NULL,'2026-06-19 12:15:02',4,39.90,NULL,NULL,NULL,1),(24,'Sabonete Ekos - 4 UNID',31.21,'Natura','6',NULL,'2026-06-19 12:38:04',5,45.90,NULL,NULL,NULL,1),(25,'Rollon Todo Dia Natura Feminino',20.33,'Natura','7',NULL,'2026-06-19 12:38:04',10,29.90,NULL,NULL,NULL,1),(26,'Refil Desodorante Feminino',30.53,'Natura','8',NULL,'2026-06-19 12:38:04',1,44.90,NULL,NULL,NULL,1),(27,'Creme Todo Dia Nata - 200ml',38.69,'Natura','9',NULL,'2026-06-19 12:38:04',3,56.90,NULL,NULL,NULL,1),(28,'Sabonete Liquido Todo Dia',34.61,'Natura','10',NULL,'2026-06-19 12:38:04',2,50.90,NULL,NULL,NULL,1),(29,'Refil Sabonete Liquido',26.11,'Natura','11',NULL,'2026-06-19 12:38:04',1,38.40,NULL,NULL,NULL,1),(30,'Refil Creme Corpo Todo Dia - 400ml',38.69,'Natura','12',NULL,'2026-06-19 12:38:04',1,56.90,NULL,NULL,NULL,1),(31,'Refil Desodorante Spray Masculino',30.53,'Natura','13',NULL,'2026-06-19 12:38:04',13,44.90,NULL,NULL,NULL,1),(33,'Desodorante Masculino Completo',38.69,'Natura','15',NULL,'2026-06-19 12:38:04',2,56.90,NULL,NULL,NULL,1),(34,'Rollon Masculino',20.33,'Natura','16',NULL,'2026-06-19 12:38:04',4,29.90,NULL,NULL,NULL,1),(35,'Colonio Biografia Feminina',142.73,'Natura','17',NULL,'2026-06-19 12:38:04',2,209.90,NULL,NULL,NULL,1),(36,'Colonia Essencial Masculina',196.45,'Natura','18',NULL,'2026-06-19 12:38:04',1,288.90,NULL,NULL,NULL,1),(37,'Colonia Luna Coragem',126.41,'Natura','19',NULL,'2026-06-19 12:38:04',1,185.90,NULL,NULL,NULL,1),(38,'Condiciondor Reparador',38.69,'Natura','20',NULL,'2026-06-19 12:38:04',1,56.90,NULL,NULL,NULL,1),(39,'KIT - Shampoo+Condicionador+Mascara Lumina',129.68,'Natura','21',NULL,'2026-06-19 12:38:05',1,190.70,NULL,NULL,NULL,1),(40,'Colonia Una Nude',224.33,'Natura','22',NULL,'2026-06-19 12:46:24',1,329.90,NULL,NULL,NULL,1),(41,'Colonia Ilia Feminino',135.93,'Natura','23',NULL,'2026-06-19 12:46:24',1,199.90,NULL,NULL,NULL,1),(42,'Caixa Sabonete Todo Dia  Lembrei de Voce - 5 UNID',25.77,'Natura','24',NULL,'2026-06-19 12:46:24',1,37.90,NULL,NULL,NULL,1),(43,'Caixa Sabonete Estojo Flores',32.64,'Natura','25',NULL,'2026-06-19 12:46:24',1,48.00,NULL,NULL,NULL,1),(44,'Creme Corpo Luna Radiante',65.21,'Natura','26',NULL,'2026-06-19 12:54:04',1,95.90,NULL,NULL,NULL,1),(45,'Body Splash Humor Proprio',63.17,'Natura','27',NULL,'2026-06-19 12:54:04',1,92.90,NULL,NULL,NULL,1),(46,'Colonia Kaik Masculina',129.13,'Natura','28',NULL,'2026-06-19 12:54:04',3,189.90,NULL,NULL,NULL,1),(47,'Colonia Biografia Masculina',142.73,'Natura','29',NULL,'2026-06-19 12:54:04',1,209.90,NULL,NULL,NULL,1),(48,'Colonia Natura Homen Nós',166.53,'Natura','30',NULL,'2026-06-19 12:54:04',1,244.90,NULL,NULL,NULL,1),(49,'Sabonete Kaik Avulso Masculino',10.13,'Natura','31',NULL,'2026-06-19 12:54:04',1,14.90,NULL,NULL,NULL,1),(50,'Esponja Maquiagem Faces',27.13,'Natura','32',NULL,'2026-06-19 12:54:04',2,39.90,NULL,NULL,NULL,1),(51,'Caixa Sabonete M.Bebê - 2 UNID',15.57,'Natura','33',NULL,'2026-06-19 12:54:04',2,22.90,NULL,NULL,NULL,1),(52,'Caixa Sabonete com Saboneteira M. Bebê',17.61,'Natura','34',NULL,'2026-06-19 13:04:44',2,25.90,NULL,NULL,NULL,1),(53,'Caixa Sabonete M. Bebê - 5 UNID',35.29,'Natura','35',NULL,'2026-06-19 13:04:44',2,51.90,NULL,NULL,NULL,1),(54,'Colonia M. Bebê',72.69,'Natura','36',NULL,'2026-06-19 13:04:44',2,106.90,NULL,NULL,NULL,1),(55,'Hidratante M. Bebê',47.53,'Natura','37',NULL,'2026-06-19 13:04:44',1,69.90,NULL,NULL,NULL,1),(56,'Lenço Umedecido M. Bebê - 50 UNID',25.09,'Natura','38',NULL,'2026-06-19 13:04:44',1,36.90,NULL,NULL,NULL,1),(57,'Caixa Sabonete Natura Naturé - 4 UNID',33.93,'Natura','39',NULL,'2026-06-19 13:04:44',2,49.90,NULL,NULL,NULL,1),(58,'Caixa Sabonete Natura Naturé - 5 UNID',32.57,'Natura','40',NULL,'2026-06-19 13:04:44',1,47.90,NULL,NULL,NULL,1),(59,'Colonia Natura Naturé',67.93,'Natura','41',NULL,'2026-06-19 13:04:44',1,99.90,NULL,NULL,NULL,1),(60,'Caixa Sabonete Líquido Natura Naturé',27.81,'Natura','42',NULL,'2026-06-19 13:04:44',1,40.90,NULL,NULL,NULL,1),(61,'Loção Hidratante Natura Naturé',29.17,'Natura','43',NULL,'2026-06-19 13:04:44',1,42.90,NULL,NULL,NULL,1),(62,'Shampoo 2 em 1 Natura Naturé',31.89,'Natura','44',NULL,'2026-06-19 13:04:44',1,46.90,NULL,NULL,NULL,1),(63,'Sabote Líquido Natura Naturé Vida',26.45,'Natura','45',NULL,'2026-06-19 13:04:44',1,38.90,NULL,NULL,NULL,1),(64,'Protetor Solar Rosto - 50 FPS',76.77,'Natura','46',NULL,'2026-06-19 13:08:02',1,112.90,NULL,NULL,NULL,1),(65,'Hidratante Labial Acerola e Hibisco',24.41,'Natura','47',NULL,'2026-06-19 13:08:02',1,35.90,NULL,NULL,NULL,1),(66,'Desodorante Feminio Completo',38.69,'Natura','47',NULL,'2026-06-19 13:35:14',4,56.90,NULL,NULL,NULL,1),(67,'Batom Una CC Violeta 62',40.73,'Natura','48',NULL,'2026-06-19 13:38:35',1,59.90,'/uploads/products/p67_1783303292496.webp',NULL,NULL,1),(68,'Lapis Labial Una Rosa Pequeno',27.13,'Natura','49',NULL,'2026-06-19 13:38:35',1,39.90,'/uploads/products/p68_1783303446425.webp',NULL,NULL,1),(69,'Lapis de Olho Una Nude 1,14GRS',33.93,'Natura','50',NULL,'2026-06-19 13:38:35',1,49.90,NULL,NULL,NULL,1),(70,'Caixas Sabonete Dr.Botica',38.17,'Boticário','1',NULL,'2026-06-19 15:01:08',3,44.90,'/uploads/products/p70_1783303757231.webp',NULL,NULL,1),(71,'Refil Sabonete Líquido Boti Baby',50.92,'Boticário','2',NULL,'2026-06-19 15:01:08',1,59.90,'/uploads/products/p71_1783303358588.webp',NULL,NULL,1),(72,'Colonia Floata',148.67,'Boticário','3',NULL,'2026-06-19 15:01:08',5,174.90,'/uploads/products/p72_1783303406127.webp',NULL,NULL,1),(73,'Colonia Coffe Feminino',195.42,'Boticário','4',NULL,'2026-06-19 15:01:08',2,229.90,NULL,NULL,NULL,1),(74,'Colonia Elysee',280.42,'Boticário','5',NULL,'2026-06-19 15:01:08',1,329.90,NULL,NULL,NULL,1),(75,'Colonia Botica 214 Feminina',212.42,'Boticário','6',NULL,'2026-06-19 15:01:08',2,249.90,NULL,NULL,NULL,1),(76,'Colonia Egeo Feminina',140.17,'Boticário','7',NULL,'2026-06-19 15:01:08',2,164.90,NULL,NULL,NULL,1),(77,'Colonia Agua Fresta - 100ml',152.92,'Boticário','8',NULL,'2026-06-19 15:01:08',1,179.90,NULL,NULL,NULL,1),(78,'Body Spray Doon',101.92,'Boticário','42',NULL,'2026-06-19 15:01:08',1,119.90,NULL,NULL,NULL,1),(79,'Creme Corpo Florata',59.42,'Boticário','9',NULL,'2026-06-19 15:01:08',1,69.90,NULL,NULL,NULL,1),(80,'Óleo de Corpo NativoSPA',84.92,'Boticário','10',NULL,'2026-06-19 15:01:08',1,99.90,NULL,NULL,NULL,1),(81,'Refil Desodorante Spray Floata',42.42,'Boticário','11',NULL,'2026-06-19 15:01:08',1,49.90,NULL,NULL,NULL,1),(82,'Caixa Sabonete Cuide-se Bem - 2UNID',21.17,'Boticário','12',NULL,'2026-06-19 15:01:08',5,24.90,NULL,NULL,NULL,1),(83,'Colonia Uomini Masculino',178.42,'Boticário','13',NULL,'2026-06-19 15:01:08',3,209.90,NULL,NULL,NULL,1),(84,'Colonia Malbac Tradicional',178.42,'Boticário','14',NULL,'2026-06-19 15:01:08',1,209.90,NULL,NULL,NULL,1),(85,'Colonia Quasar',161.42,'Boticário','15',NULL,'2026-06-19 15:01:08',1,189.90,NULL,NULL,NULL,1),(86,'Colonia Egeo Masculina',140.17,'Boticário','16',NULL,'2026-06-19 15:01:08',1,164.90,NULL,NULL,NULL,1),(87,'Colonia Obsession',152.92,'Boticário','17',NULL,'2026-06-19 15:01:08',1,179.90,NULL,NULL,NULL,1),(88,'Shampoo Amigos Pets',50.92,'Boticário','18',NULL,'2026-06-19 15:01:08',1,59.90,NULL,NULL,NULL,1),(89,'Aerosol Masculino 125ml',33.92,'Boticário','19',NULL,'2026-06-19 15:01:08',5,39.90,NULL,NULL,NULL,1),(90,'Aerosol Man Masculino',33.92,'Boticário','20',NULL,'2026-06-19 15:01:08',3,39.90,'/uploads/products/p90_1783302632706.webp',NULL,NULL,1),(91,'Refil Colonia Arbo Masculino',118.92,'Boticário','21',NULL,'2026-06-19 15:01:08',1,139.90,NULL,NULL,NULL,1),(92,'Refil Desodorante Celebral Masculino',36.47,'Boticário','22',NULL,'2026-06-19 15:01:08',1,42.90,NULL,NULL,NULL,1),(93,'Creme Corpo NativaSPA',73.87,'Boticário','23',NULL,'2026-06-19 15:01:08',4,86.90,NULL,NULL,NULL,1),(94,'Body Spray NativaSPA',93.42,'Boticário','24',NULL,'2026-06-19 15:01:08',1,109.90,NULL,NULL,NULL,1),(95,'Body Spray Cuida Bem',80.67,'Boticário','25',NULL,'2026-06-19 15:01:08',3,94.90,NULL,NULL,NULL,1),(96,'Creme Corpo Lily',127.42,'Boticário','26',NULL,'2026-06-19 15:01:08',2,149.90,NULL,NULL,NULL,1),(97,'Creme Corpo Elysee',127.42,'Boticário','27',NULL,'2026-06-19 15:01:08',1,149.90,NULL,NULL,NULL,1),(98,'Caixa Sabonete Cuide-se Bem - 2UNID',25.42,'Boticário','28',NULL,'2026-06-19 15:01:08',2,29.90,NULL,NULL,NULL,1),(99,'Caixa Sabonete Cuide-se Bem - 4UNID',33.07,'Boticário','29',NULL,'2026-06-19 15:01:08',3,38.90,NULL,NULL,NULL,1),(100,'Caixa Sabonete NativaSPA',55.17,'Boticário','30',NULL,'2026-06-19 15:01:08',1,64.90,NULL,NULL,NULL,1),(101,'Refil Creme Corpo Cuida-se Bem',50.92,'Boticário','31',NULL,'2026-06-19 15:01:08',1,59.90,NULL,NULL,NULL,1),(102,'Shampoo Nevon',32.22,'Boticário','32',NULL,'2026-06-19 15:01:08',1,37.90,NULL,NULL,NULL,1),(103,'Condicionador Nevon',32.22,'Boticário','33',NULL,'2026-06-19 15:01:08',1,37.90,NULL,NULL,NULL,1),(104,'Creme NativaSPA Pote Vidro',127.42,'Boticário','34',NULL,'2026-06-19 15:01:08',2,149.90,NULL,NULL,NULL,1),(105,'Manteiga Corporal Cuida-se Bem',61.97,'Boticário','35',NULL,'2026-06-19 15:01:08',1,72.90,NULL,NULL,NULL,1),(106,'Live Match Nutrição 150ml',46.67,'Boticário','36',NULL,'2026-06-19 15:01:08',1,54.90,NULL,NULL,NULL,1),(107,'Serum Match Curvas - 50ml',38.17,'Boticário','37',NULL,'2026-06-19 15:01:08',1,44.90,NULL,NULL,NULL,1),(108,'Duo de Sombro Quentedisse Berenice',76.42,'Boticário','38',NULL,'2026-06-19 15:01:08',1,89.90,NULL,NULL,NULL,1),(109,'Base MakB Cor 280',84.92,'Boticário','39',NULL,'2026-06-19 15:01:08',1,99.90,'/uploads/products/p109_1783302834825.webp',NULL,NULL,1),(110,'Batom Quentedisse Berenice',44.97,'Boticário','40',NULL,'2026-06-19 15:01:08',1,52.90,NULL,NULL,NULL,1),(111,'Batom Intenso Pop Cor Bege',16.06,'Boticário','41',NULL,'2026-06-19 15:01:08',1,18.90,'/uploads/products/p111_1783302925029.webp',NULL,NULL,1),(112,'Creme de Corpo Eudora - 400ml',42.00,'Eudora','1',NULL,'2026-06-19 15:53:17',5,60.00,'/uploads/products/p112_1783303821519.webp',NULL,NULL,1),(113,'Creme de Corpo Eudora La Piel',47.60,'Eudora','2',NULL,'2026-06-19 15:53:17',1,68.00,'/uploads/products/p113_1783303055832.webp',NULL,NULL,1),(114,'Body Spray Eudora',52.50,'Eudora','3',NULL,'2026-06-19 15:53:17',2,75.00,'/uploads/products/p114_1783303795515.webp',NULL,NULL,1),(115,'KIT de 2 Cremes Eudora',52.50,'Eudora','4',NULL,'2026-06-19 15:53:17',1,75.00,NULL,NULL,NULL,1),(116,'Creme de Mãos Eudora',16.10,'Eudora','5',NULL,'2026-06-19 15:53:17',2,23.00,NULL,NULL,NULL,1),(117,'Caixa de Sabonete  Eudora - 4UNID',23.10,'Eudora','6',NULL,'2026-06-19 15:53:17',5,33.00,NULL,NULL,NULL,1),(118,'KIT Shampoo + Condicionar + Mascara Cresimento',123.20,'Eudora','7',NULL,'2026-06-19 15:53:17',2,176.00,NULL,NULL,NULL,1),(119,'Condicionador Eudora Kids',24.50,'Eudora','8',NULL,'2026-06-19 15:53:17',2,35.00,NULL,NULL,NULL,1),(120,'Body Spray Eudora Feminino',33.60,'Eudora','9',NULL,'2026-06-19 15:53:17',8,48.00,NULL,NULL,NULL,1),(121,'Body Spray Eudora Masculino',33.60,'Eudora','10',NULL,'2026-06-19 15:53:17',1,48.00,NULL,NULL,NULL,1),(122,'Colonia Eudora Intantion Masculina',111.93,'Eudora','11',NULL,'2026-06-19 15:53:17',1,159.90,NULL,NULL,NULL,1),(123,'KIT Creme + Sabonete Intense 180ml',54.60,'Eudora','12',NULL,'2026-06-19 15:53:17',1,78.00,NULL,NULL,NULL,1),(124,'KIT Shampoo + Condicionador + Refil Mascara Liso',123.20,'Eudora','13',NULL,'2026-06-19 15:53:17',1,176.00,NULL,NULL,NULL,1),(125,'KIT Shampoo + Condicionador + Refil Mascara Plastic',123.20,'Eudora','14',NULL,'2026-06-19 15:53:17',1,176.00,NULL,NULL,NULL,1),(126,'KIT Shampoo + Condicionar + Mascara Cauterização dos Fios',123.20,'Eudora','15',NULL,'2026-06-19 15:53:17',1,176.00,'/uploads/products/p126_1783303109795.webp',NULL,NULL,1),(127,'Condicionador Intense',21.00,'Eudora','16',NULL,'2026-06-19 15:53:17',2,30.00,NULL,NULL,NULL,1),(128,'Mascara Liso Intense',37.10,'Eudora','17',NULL,'2026-06-19 15:53:17',1,53.00,NULL,NULL,NULL,1),(129,'KIT Shampooo + Condicionador + Mascara Cica',123.20,'Eudora','18',NULL,'2026-06-19 15:53:17',1,176.00,NULL,NULL,NULL,1),(130,'KIT Condicionador + Mascara Pós Química',88.20,'Eudora','19',NULL,'2026-06-19 15:53:17',1,126.00,NULL,NULL,NULL,1),(131,'Condicionador Combate Frizz',37.10,'Eudora','20',NULL,'2026-06-19 15:53:17',1,53.00,NULL,NULL,NULL,1),(132,'Shampoo Micelor',35.00,'Eudora','21',NULL,'2026-06-19 15:53:17',1,50.00,NULL,NULL,NULL,1),(133,'Esfoliante Eudora Neo Demo',42.00,'Eudora','22',NULL,'2026-06-19 15:53:17',1,60.00,NULL,NULL,NULL,1),(134,'Batom Liquido Turbo Marron',28.00,'Eudora','23',NULL,'2026-06-19 15:53:17',1,40.00,NULL,NULL,NULL,1),(135,'Creme Anti-Sinais Eudora 60+',53.90,'Eudora','24',NULL,'2026-06-19 15:53:17',1,77.00,NULL,NULL,NULL,1),(136,'Creme Facial Neo Demo - 50gr',73.50,'Eudora','25',NULL,'2026-06-19 15:53:17',1,105.00,NULL,NULL,NULL,1),(137,'Primar Rosé Rosto',65.10,'Eudora','26',NULL,'2026-06-19 15:53:17',1,93.00,NULL,NULL,NULL,1),(138,'Batom Liquido Matte Tint',42.00,'Eudora','27',NULL,'2026-06-19 15:53:17',2,60.00,NULL,NULL,NULL,1);
/*!40000 ALTER TABLE `products` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `promissorias` WRITE;
/*!40000 ALTER TABLE `promissorias` DISABLE KEYS */;
INSERT  IGNORE INTO `promissorias` (`id`, `nota_fiscal_id`, `valor`, `data_vencimento`, `status`, `parcelas`) VALUES (28,28,1450.40,'2026-07-03','Pendente',4),(31,31,147.58,'2026-07-10','Pendente',1),(32,32,147.58,'2026-08-10','Pendente',1),(33,33,147.58,'2026-09-09','Pendente',1),(34,34,147.59,'2026-10-09','Pendente',1),(35,35,53.06,'2026-07-10','Pendente',1),(36,36,53.06,'2026-08-10','Pendente',1),(37,37,53.06,'2026-09-09','Pendente',1),(38,38,53.06,'2026-10-09','Pendente',1),(39,39,53.05,'2026-11-09','Pendente',1),(40,40,350.65,'2026-07-06','Pendente',1),(41,41,163.31,'2026-07-06','Pendente',1),(42,42,206.52,'2026-07-08','Pendente',1),(43,43,10.65,'2026-07-08','Pendente',1),(45,45,126.59,'2026-07-10','Pendente',1),(46,46,169.16,'2026-07-13','Pendente',1),(47,47,321.25,'2026-07-17','Pendente',1),(48,48,130.38,'2026-07-20','Pendente',1),(49,49,180.61,'2026-07-22','Pendente',1),(50,50,282.44,'2026-07-22','Pendente',1),(51,51,208.23,'2026-07-27','Pendente',1),(52,52,271.52,'2026-07-27','Pendente',1),(53,53,15.22,'2026-07-29','Pendente',1),(54,54,137.02,'2026-07-29','Pendente',1),(55,55,295.58,'2026-07-06','Pendente',1),(56,56,281.69,'2026-07-06','Pendente',1),(57,57,306.00,'2026-07-07','Pendente',1),(58,58,259.88,'2026-07-07','Pendente',1),(59,59,257.06,'2026-07-13','Pendente',1),(60,60,122.98,'2026-07-13','Pendente',1),(61,61,329.24,'2026-07-13','Pendente',1),(62,62,261.39,'2026-07-20','Pendente',1),(63,63,100.17,'2026-07-21','Pendente',1),(64,64,332.06,'2026-07-22','Pendente',1),(65,65,256.08,'2026-07-23','Pendente',1),(66,66,295.58,'2026-08-05','Pendente',1),(67,67,259.88,'2026-08-06','Pendente',1),(68,68,329.24,'2026-08-12','Pendente',1),(69,69,261.40,'2026-08-18','Pendente',1),(70,70,295.57,'2026-09-04','Pendente',1),(71,71,259.88,'2026-09-08','Pendente',1),(72,72,163.32,'2026-08-05','Pendente',1),(73,73,206.52,'2026-08-07','Pendente',1),(74,74,10.65,'2026-08-07','Pendente',1),(75,75,169.16,'2026-08-12','Pendente',1),(76,76,130.38,'2026-08-19','Pendente',1),(77,77,180.61,'2026-08-21','Pendente',1),(78,78,282.42,'2026-08-21','Pendente',1),(79,79,15.22,'2026-08-28','Pendente',1),(80,80,137.03,'2026-08-28','Pendente',1),(81,81,219.38,'2026-10-09','Pendente',1),(82,82,206.53,'2026-09-08','Pendente',1),(83,83,10.62,'2026-09-08','Pendente',1),(84,84,219.40,'2026-09-09','Pendente',1),(85,85,169.15,'2026-09-11','Pendente',1),(86,86,130.40,'2026-09-19','Pendente',1),(87,87,180.61,'2026-09-21','Pendente',1),(88,88,219.40,'2026-08-10','Pendente',1),(89,89,219.40,'2026-07-10','Pendente',1),(90,90,108.61,'2026-07-16','Pendente',1),(91,91,220.54,'2026-07-27','Pendente',1),(92,92,108.60,'2026-08-17','Pendente',1),(93,93,220.54,'2026-08-26','Pendente',1),(94,94,220.54,'2026-09-25','Pendente',1),(95,95,220.54,'2026-10-15','Pendente',1),(96,96,220.54,'2026-11-24','Pendente',1),(97,97,203.27,'2026-07-17','Pendente',1),(98,98,203.27,'2026-08-17','Pendente',1),(99,99,203.27,'2026-09-16','Pendente',1),(100,100,203.27,'2026-10-16','Pendente',1),(101,101,129.24,'2026-08-02','Pendente',1),(102,102,129.24,'2026-09-01','Pendente',1),(103,103,129.24,'2026-10-01','Pendente',1),(104,104,129.24,'2026-10-31','Pendente',1),(105,105,230.04,'2026-08-03','Pendente',1),(106,106,142.97,'2026-08-07','Pendente',1),(107,107,230.04,'2026-09-02','Pendente',1),(108,108,142.97,'2026-09-08','Pendente',1),(109,109,230.04,'2026-10-02','Pendente',1),(111,111,230.06,'2026-11-03','Pendente',1),(112,112,142.96,'2026-11-09','Pendente',1),(113,113,142.97,'2026-10-08','Pendente',1),(114,114,143.34,'2026-09-14','Pendente',1),(115,115,143.34,'2026-10-14','Pendente',1),(116,116,143.33,'2026-11-13','Pendente',1),(117,117,69.54,'2026-09-14','Pendente',1),(118,118,244.19,'2026-09-17','Pendente',1),(119,119,69.55,'2026-10-14','Pendente',1),(120,120,244.19,'2026-10-17','Pendente',1),(121,121,244.19,'2026-11-16','Pendente',1),(122,122,244.19,'2026-12-16','Pendente',1),(123,123,69.54,'2026-08-15','Pendente',1),(124,124,143.34,'2026-08-14','Pendente',1),(125,125,116.46,'2026-08-22','Pendente',1),(126,126,116.46,'2026-09-21','Pendente',1),(127,127,116.46,'2026-10-21','Pendente',1),(128,128,116.46,'2026-11-20','Pendente',1),(129,129,181.18,'2026-08-20','Pendente',1),(130,130,181.18,'2026-09-21','Pendente',1),(131,131,181.18,'2026-10-21','Pendente',1),(132,132,181.18,'2026-11-23','Pendente',1),(133,133,151.01,'2026-08-18','Pendente',1);
/*!40000 ALTER TABLE `promissorias` ENABLE KEYS */;
UNLOCK TABLES;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!40101 SET character_set_client = utf8 */;
CREATE TABLE IF NOT EXISTS `store_settings` (
  `skey` varchar(60) NOT NULL,
  `svalue` varchar(255) DEFAULT NULL,
  PRIMARY KEY (`skey`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

LOCK TABLES `store_settings` WRITE;
/*!40000 ALTER TABLE `store_settings` DISABLE KEYS */;
INSERT  IGNORE INTO `store_settings` (`skey`, `svalue`) VALUES ('cidade_entrega','São João da Boa Vista'),('desconto_global_ativo','0'),('desconto_global_percent','0'),('endereco_retirada','Rua David de Carvalho'),('frete_padrao','10'),('nf_origem_backfill','1'),('produtos_titlecase_backfill','1');
/*!40000 ALTER TABLE `store_settings` ENABLE KEYS */;
UNLOCK TABLES;
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

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT  IGNORE INTO `users` (`id`, `username`, `password_hash`, `role`, `created_at`) VALUES (1,'admin','$2a$10$Jp9blr8TLuqfI1by2NZq.eQEQBuevp.PEThq741BbzdRF7VUnSySe','admin','2026-06-11 17:15:16');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;


-- ============================================================
-- Banco de testes (usado automaticamente na branch "Teste")
-- Para cria-lo com os mesmos dados, rode no terminal:
--   mysql -u root -e "CREATE DATABASE IF NOT EXISTS db_pedidos_teste DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci"
--   mysqldump -u root db_pedidos | mysql -u root db_pedidos_teste
-- ============================================================
