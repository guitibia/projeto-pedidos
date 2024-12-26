const express = require('express');
const app = express();
const path = require('path');
const mysql = require('mysql2/promise');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
dotenv.config();

// Configuração do banco de dados MySQL
const connection = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cosmeticos_db'
});
console.log("Conectado ao banco:", process.env.DB_NAME);

// Middleware para interpretar o corpo da requisição como JSON
app.use(express.json());
app.use(bodyParser.json());

// Middleware para servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Rota para cadastrar cliente
app.post('/api/clients', async (req, res) => {
  const { name, address, houseNumber, neighborhood, phone } = req.body;

  if (!name || !address || !houseNumber || !neighborhood) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  const query = 'INSERT INTO clients (name, address, house_number, neighborhood, phone) VALUES (?, ?, ?, ?, ?)';
  try {
    const [results] = await connection.query(query, [name, address, houseNumber, neighborhood, phone]);
    res.status(201).json({ message: 'Cliente cadastrado com sucesso!', clientId: results.insertId });
  } catch (err) {
    console.error('Erro ao inserir cliente: ', err);
    return res.status(500).json({ error: 'Erro ao cadastrar cliente' });
  }
});

// Rota para cadastrar produto
app.post('/api/products', async (req, res) => {
  const { name, cost, franchise, code, promotionPrice } = req.body;

  if (!name || !cost || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  const query = 'INSERT INTO products (name, cost, franchise, code, promotion_price) VALUES (?, ?, ?, ?, ?)';
  try {
    const [results] = await connection.query(query, [name, cost, franchise, code, promotionPrice || null]);
    res.status(201).json({ message: 'Produto cadastrado com sucesso!', productId: results.insertId });
  } catch (err) {
    console.error('Erro ao cadastrar produto:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar produto' });
  }
});

// Rota para criar pedido
app.post('/api/orders', async (req, res) => {
  const { clientId, paymentMethod, products, totalValue, combinedPaymentValue, installments } = req.body;

  console.log('Dados recebidos no pedido:', req.body);

  const productArray = Array.isArray(products) ? products : [products];

  if (!clientId || !paymentMethod || productArray.length === 0 || !totalValue) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  const validPaymentMethods = ['PIX', 'DINHEIRO', 'CARTÃO DE CRÉDITO', 'PARCELADO', 'PAGAMENTO COMBINADO'];
  if (!validPaymentMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: 'Método de pagamento inválido' });
  }

  if ((paymentMethod === 'PARCELADO' || paymentMethod === 'PAGAMENTO COMBINADO') && !installments) {
    return res.status(400).json({ error: 'Número de parcelas é obrigatório para pagamentos parcelados ou combinados' });
  }

  if (paymentMethod === 'PAGAMENTO COMBINADO' && (combinedPaymentValue === undefined || combinedPaymentValue <= 0)) {
    return res.status(400).json({ error: 'Valor de pagamento combinado inválido' });
  }

  const validProducts = productArray.map(product => {
    if (!product.id || isNaN(parseFloat(product.salePrice)) || parseFloat(product.salePrice) <= 0) {
      return { error: `Preço de venda inválido para o produto ID "${product.id || 'desconhecido'}"` };
    }
    return {
      id: product.id,
      salePrice: parseFloat(product.salePrice),
      promotionPrice: product.promotionPrice || null, // Captura o preço promocional
      quantity: product.quantity
    };
  });

  const invalidProduct = validProducts.find(product => product.error);
  if (invalidProduct) {
    return res.status(400).json({ error: invalidProduct.error });
  }

  try {
    const productQueries = validProducts.map(product => {
      return connection.query('SELECT id, promotion_price FROM products WHERE id = ?', [product.id])
        .then(([results]) => {
          if (results.length === 0) {
            throw new Error(`Produto ID "${product.id}" não encontrado.`);
          }
          const promotionPrice = product.promotionPrice !== null ? product.promotionPrice : results[0].promotion_price; // Usa o preço promocional do payload ou do banco
          return {
            productId: results[0].id,
            salePrice: product.salePrice,
            promotionPrice: promotionPrice, // Inclui o preço promocional
            quantity: product.quantity
          };
        });
    });

    // Aguarda todas as consultas de produtos
    const productsWithPrices = await Promise.all(productQueries);

    // Salvar o pedido na tabela orders e obter o ID
    const [orderResult] = await connection.query('INSERT INTO orders (client_id, payment_method, total_cost) VALUES (?, ?, ?)',
      [clientId, paymentMethod, totalValue]);

    const orderId = orderResult.insertId; // Obter o ID do pedido inserido

    // Insira os dados na tabela order_products
    const insertQueries = productsWithPrices.map(product => {
      return connection.query('INSERT INTO order_products (order_id, product_id, sale_price, promotion_price, quantity) VALUES (?, ?, ?, ?, ?)',
        [orderId, product.productId, product.salePrice, product.promotionPrice, product.quantity]);
    });

    await Promise.all(insertQueries); // Aguarda todas as inserções

    res.status(201).json({ orderId });
  } catch (error) {
    console.error('Erro ao processar o pedido:', error);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

// Rota para listar produtos
app.get('/api/products', async (req, res) => {
  const franchise = req.query.franchise;
  if (!franchise) {
    return res.status(400).json({ error: 'Parâmetro franchise é obrigatório' });
  }

  try {
    const [results] = await connection.query('SELECT * FROM products WHERE franchise = ?', [franchise]);
    res.status(200).json(results);
  } catch (err) {
    console.error('Erro ao buscar produtos:', err);
    return res.status(500).json({ error: 'Erro ao buscar produtos' });
  }
});

// Rota para buscar franquias
app.get('/api/franchises', async (req, res) => {
  try {
    const [results] = await connection.query('SELECT DISTINCT franchise FROM products');
    const franchises = results.map(row => row.franchise);
    res.status(200).json(franchises);
  } catch (err) {
    console.error('Erro ao buscar franquias:', err);
    return res.status(500).json({ error: 'Erro ao buscar franquias' });
  }
});

// Rota para listar clientes
app.get('/api/clients', async (req, res) => {
  try {
    const [results] = await connection.query('SELECT * FROM clients');
    res.status(200).json(results);
  } catch (err) {
    console.error('Erro ao buscar clientes:', err);
    return res.status(500).json({ error: 'Erro ao buscar clientes' });
  }
});

// Rota para buscar produto por ID
app.get('/api/products/:id', async (req, res) => {
  const productId = req.params.id;

  try {
    const [results] = await connection.query('SELECT * FROM products WHERE id = ?', [productId]);
    if (results.length > 0) {
      const product = results[0];
      res.status(200).json({
        id: product.id,
        name: product.name,
        cost: product.cost,
        franchise: product.franchise,
        code: product.code
      });
    } else {
      res.status(404).json({ error: 'Produto não encontrado' });
    }
  } catch (err) {
    console.error('Erro ao buscar produto:', err);
    return res.status(500).json({ error: 'Erro ao buscar produto', details: err });
  }
});

// Rota para listar todos os pedidos
app.get('/api/orders', async (req, res) => {
  const statusFilter = req.query.status || 'Todos';
  let query = `SELECT o.id, o.payment_method, o.total_cost, o.status, c.name AS client_name
               FROM orders o
               JOIN clients c ON o.client_id = c.id`;

  if (statusFilter !== 'Todos') {
    query += ' WHERE o.status = ?';
  }

  try {
    const [results] = await connection.query(query, [statusFilter === 'Todos' ? null : statusFilter]);
    res.status(200).json(results);
  } catch (err) {
    console.error('Erro ao buscar pedidos:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos' });
  }
});

// Rota para buscar detalhes do pedido específico
app.get('/api/orders/:id', async (req, res) => {
  const orderId = req.params.id;

  const query = `
    SELECT 
      o.id, o.payment_method, o.total_cost, o.installments, o.combined_payment_value, 
      c.name AS client_name,
      c.address AS client_address,
      c.house_number AS client_house_number,
      c.neighborhood AS client_neighborhood,
      GROUP_CONCAT(p.name SEPARATOR ', ') AS product_names,
      GROUP_CONCAT(op.sale_price SEPARATOR ', ') AS product_prices,
      GROUP_CONCAT(p.cost SEPARATOR ', ') AS product_costs,
      GROUP_CONCAT(p.franchise SEPARATOR ', ') AS product_franchises,
      GROUP_CONCAT(p.code SEPARATOR ', ') AS product_codes,
      GROUP_CONCAT(op.quantity SEPARATOR ', ') AS product_quantities
    FROM orders o
    JOIN clients c ON o.client_id = c.id
    JOIN order_products op ON op.order_id = o.id
    JOIN products p ON p.id = op.product_id
    WHERE o.id = ?
    GROUP BY o.id
  `;

  try {
    const [results] = await connection.query(query, [orderId]);
    if (results.length > 0) {
      const order = results[0];
      const productNames = order.product_names.split(', ');
      const productPrices = order.product_prices.split(', ').map(Number);
      const productCosts = order.product_costs.split(', ').map(Number);
      const productFranchises = order.product_franchises.split(', ');
      const productCodes = order.product_codes.split(', ');
      const productQuantities = order.product_quantities.split(', ').map(Number); // Conversão para números

      const products = productNames.map((name, index) => ({
        product_name: name,
        sale_price: productPrices[index],
        cost_price: productCosts[index],
        franchise: productFranchises[index],
        code: productCodes[index],
        quantity: productQuantities[index] // Adiciona a quantidade
      }));

      order.products = products;
      delete order.product_names;
      delete order.product_prices;
      delete order.product_costs;
      delete order.product_franchises;
      delete order.product_codes;

      res.status(200).json(order);
    } else {
      res.status(404).json({ error: 'Pedido não encontrado' });
    }
  } catch (err) {
    console.error('Erro ao buscar detalhes do pedido:', err);
    return res.status(500).json({ error: 'Erro ao buscar detalhes do pedido' });
  }
});

// Rota para atualizar o status de um pedido
app.put('/api/parcelas/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  try {
    const query = `UPDATE parcelas SET status = ? WHERE id = ?`;
    const result = await connection.query(query, [status, id]);

    // Verifique se a atualização foi bem-sucedida
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Parcela não encontrada' });
    }

    res.status(200).json({ message: 'Status da parcela atualizado com sucesso' });
  } catch (error) {
    console.error('Erro ao atualizar status da parcela:', error);
    res.status(500).json({ error: 'Erro ao atualizar status da parcela' });
  }
});

// Rota para excluir o pedido
app.delete('/api/orders/:id', async (req, res) => {
  const orderId = req.params.id;

  const query = 'DELETE FROM orders WHERE id = ?';
  try {
    const [results] = await connection.query(query, [orderId]);
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.status(200).json({ message: 'Pedido excluído com sucesso!' });
  } catch (err) {
    console.error('Erro ao excluir pedido:', err);
    return res.status(500).json({ error: 'Erro ao excluir pedido' });
  }
});

// Rota para buscar produto pelo código
app.get('/api/products/search', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Parâmetro code é obrigatório' });
  }

  const query = 'SELECT * FROM products WHERE code = ?';
  try {
    const [results] = await connection.query(query, [code]);
    if (results.length > 0) {
      const product = results[0];
      res.status(200).json({
        id: product.id,
        name: product.name,
        cost: product.cost,
        code: product.code,
      });
    } else {
      res.status(404).json({ error: 'Produto não encontrado' });
    }
  } catch (err) {
    console.error('Erro ao executar a consulta SQL:', err);
    return res.status(500).json({ error: 'Erro ao buscar produto' });
  }
});

// Rota para atualizar se o item veio
app.patch('/api/orders/:orderId/products/:productCode/not-came', async (req, res) => {
  const { orderId, productCode } = req.params;
  const { notCame } = req.body;

  const query = `
    UPDATE order_products op
    JOIN products p ON op.product_id = p.id
    SET op.not_came = ?
    WHERE op.order_id = ? AND p.code = ?;
  `;

  try {
    const [results] = await connection.query(query, [notCame ? 1 : 0, orderId, productCode]);
    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Produto não encontrado no pedido.' });
    }

    res.status(200).json({ message: notCame ? 'Produto marcado como NÃO VEIO.' : 'Produto marcado como VEIO.' });
  } catch (err) {
    console.error('Erro ao atualizar o status do produto:', err);
    return res.status(500).json({ error: 'Erro ao atualizar o status do produto.' });
  }
});

// Rota para listar pedidos de um cliente específico
app.get('/api/client-orders/:clientId', async (req, res) => {
  const clientId = req.params.clientId;
  const statusFilter = req.query.status || 'Todos';

  let query = `SELECT o.id, o.payment_method, o.total_cost, o.status, c.name AS client_name
               FROM orders o
               JOIN clients c ON o.client_id = c.id
               WHERE o.client_id = ?`;

  if (statusFilter !== 'Todos') {
    query += ' AND o.status = ?';
  }

  try {
    const [results] = await connection.query(query, [clientId, statusFilter === 'Todos' ? null : statusFilter]);
    res.status(200).json(results);
  } catch (err) {
    console.error('Erro ao buscar pedidos do cliente:', err);
    return res.status(500).json({ error: 'Erro ao buscar pedidos do cliente' });
  }
});

// Rota para cadastrar promissória
app.post('/api/promissorias', async (req, res) => {
  const { numero_nf, data_emissao, valor_nf, parcelas, valor_parcela, data_vencimento } = req.body;

  if (!numero_nf || !data_emissao || !valor_nf || !valor_parcela || !data_vencimento || !parcelas) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  try {
    const queryNF = 'INSERT INTO notas_fiscais (numero, data_emissao, valor) VALUES (?, ?, ?)';
    const [resultsNF] = await connection.query(queryNF, [numero_nf, data_emissao, valor_nf]);
    const notaFiscalId = resultsNF.insertId;

    const queryProm = 'INSERT INTO promissorias (nota_fiscal_id, valor, data_vencimento, parcelas) VALUES (?, ?, ?, ?)';
    const [resultsProm] = await connection.query(queryProm, [notaFiscalId, valor_parcela * parcelas, data_vencimento, parcelas]);
    const promissoriaId = resultsProm.insertId;

    // Inserir parcelas na tabela "parcelas"
    for (let i = 0; i < parcelas; i++) {
      const dataAtual = new Date(data_vencimento);
      dataAtual.setMonth(dataAtual.getMonth() + i); // Ajusta a data de vencimento para cada parcela

      await connection.query(
        'INSERT INTO parcelas (promissoria_id, numero_parcela, data_vencimento, valor) VALUES (?, ?, ?, ?)',
        [promissoriaId, i + 1, dataAtual.toISOString().split('T')[0], valor_parcela]
      );
    }

    res.status(201).json({ message: 'Promissória e Nota Fiscal cadastradas com sucesso!' });
  } catch (err) {
    console.error('Erro ao cadastrar promissória:', err);
    return res.status(500).json({ error: 'Erro ao cadastrar promissória' });
  }
});

app.delete('/api/promissorias/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Primeiro, excluir as parcelas associadas
    await connection.query(`DELETE FROM parcelas WHERE promissoria_id = ?`, [id]);

    // Agora, excluir a promissória
    await connection.query(`DELETE FROM promissorias WHERE id = ?`, [id]);

    res.status(200).json({ message: 'Promissória e suas parcelas excluídas com sucesso' });
  } catch (error) {
    console.error('Erro ao excluir promissória:', error);
    res.status(500).json({ error: 'Erro ao excluir promissória' });
  }
});

// Rota para listar promissórias com valores das parcelas e número da NF
app.get('/api/promissorias', async (req, res) => {
  try {
    const query = `
      SELECT p.*, nf.numero AS numero_nf
      FROM promissorias p
      JOIN notas_fiscais nf ON nf.id = p.nota_fiscal_id;
    `;
    const [results] = await connection.query(query);
    res.json(results);
  } catch (err) {
    console.error('Erro ao buscar promissórias:', err);
    return res.status(500).json({ error: 'Erro ao buscar promissórias' });
  }
});

// Rota para atualizar o status de uma parcela
app.put('/api/promissorias/:promissoriaId/parcelas/:parcelaId', async (req, res) => {
  const { promissoriaId, parcelaId } = req.params;
  const { status } = req.body;

  const promissoriaIdNum = parseInt(promissoriaId);
  const parcelaIdNum = parseInt(parcelaId); // Aqui você captura o número da parcela

  console.log(`Atualizando parcela: promissoriaId=${promissoriaIdNum}, parcelaId=${parcelaIdNum}, status=${status}`);

  if (!status) {
    return res.status(400).json({ error: 'O status é obrigatório!' });
  }

  const validStatuses = ['JÁ PAGA', 'PENDENTE', 'CANCELADA'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido!' });
  }

  try {
    const [result] = await connection.query(
      `UPDATE parcelas SET status = ? WHERE promissoria_id = ? AND numero_parcela = ?`,
      [status, promissoriaIdNum, parcelaIdNum]
    );

    console.log(`Resultado da atualização: ${JSON.stringify(result)}`);

    if (result.affectedRows > 0) {
      res.json({ message: 'Status da parcela atualizado com sucesso' });
    } else {
      res.status(404).json({ message: 'Parcela não encontrada ou não foi alterada.' });
    }
  } catch (error) {
    console.error('Erro ao atualizar status da parcela:', error);
    res.status(500).json({ message: 'Erro ao atualizar a parcela.' });
  }
});

// Rota para listar parcelas de uma promissória específica
app.get('/api/promissorias/:id/parcelas', async (req, res) => {
  const promissoriaId = req.params.id;

  try {
    const [results] = await connection.query('SELECT * FROM parcelas WHERE promissoria_id = ?', [promissoriaId]);
    res.json(results);
  } catch (err) {
    console.error('Erro ao buscar parcelas:', err);
    return res.status(500).json({ error: 'Erro ao buscar parcelas' });
  }
});

// Porta para o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
