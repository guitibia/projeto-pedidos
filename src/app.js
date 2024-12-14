const express = require('express');
const app = express();
const path = require('path');
const mysql = require('mysql2');
const dotenv = require('dotenv');
dotenv.config();

// Configuração do banco de dados MySQL
const connection = mysql.createConnection({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cosmeticos_db'
});

// Middleware para interpretar o corpo da requisição como JSON
app.use(express.json());

// Middleware para servir arquivos estáticos da pasta "public"
app.use(express.static(path.join(__dirname, 'public')));

// Rota para cadastrar cliente
app.post('/api/clients', (req, res) => {
  const { name, address, houseNumber, neighborhood, phone } = req.body;

  if (!name || !address || !houseNumber || !neighborhood) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  const query = 'INSERT INTO clients (name, address, house_number, neighborhood, phone) VALUES (?, ?, ?, ?, ?)';
  connection.query(query, [name, address, houseNumber, neighborhood, phone], (err, results) => {
    if (err) {
      console.error('Erro ao inserir cliente: ', err);
      return res.status(500).json({ error: 'Erro ao cadastrar cliente' });
    }
    res.status(201).json({ message: 'Cliente cadastrado com sucesso!', clientId: results.insertId });
  });
});

// Rota para cadastrar produto
app.post('/api/products', (req, res) => {
  const { name, cost, franchise, code } = req.body;

  if (!name || !cost || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  const query = 'INSERT INTO products (name, cost, franchise, code) VALUES (?, ?, ?, ?)';
  connection.query(query, [name, cost, franchise, code], (err, results) => {
    if (err) {
      console.error('Erro ao cadastrar produto:', err);
      return res.status(500).json({ error: 'Erro ao cadastrar produto' });
    }
    res.status(201).json({ message: 'Produto cadastrado com sucesso!', productId: results.insertId });
  });
});

// Rota para criar pedido
app.post('/api/orders', (req, res) => {
  const { clientId, paymentMethod, products, totalValue, combinedPaymentValue, installments } = req.body;

  console.log('Dados recebidos no pedido:', req.body);

  // Garantir que `products` seja um array
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

  // Validar e converter salePrice para float
  const validProducts = productArray.map(product => {
    if (isNaN(parseFloat(product.salePrice)) || parseFloat(product.salePrice) <= 0) {
      return { error: `Preço de venda inválido para o produto "${product.name}"` };
    }
    return { name: product.name, salePrice: parseFloat(product.salePrice) };
  });

  const invalidProduct = validProducts.find(product => product.error);
  if (invalidProduct) {
    return res.status(400).json({ error: invalidProduct.error });
  }

  // Buscar IDs dos produtos para associar ao pedido
  const productQueries = validProducts.map(product => {
    return new Promise((resolve, reject) => {
      const query = 'SELECT id FROM products WHERE name = ?';
      connection.query(query, [product.name], (err, results) => {
        if (err) {
          return reject('Erro ao buscar produto: ' + err);
        }

        if (results.length === 0) {
          return reject(`Produto "${product.name}" não encontrado.`);
        }

        const productId = results[0].id;
        resolve({ productId, salePrice: product.salePrice });
      });
    });
  });

  // Processar todos os produtos
  Promise.all(productQueries)
    .then(productData => {
      const queryOrder = 'INSERT INTO orders (client_id, payment_method, installments, total_cost, combined_payment_value) VALUES (?, ?, ?, ?, ?)';
      connection.query(queryOrder, [clientId, paymentMethod, installments || null, totalValue, combinedPaymentValue || null], (err, result) => {
        if (err) {
          console.error('Erro ao inserir pedido:', err);
          return res.status(500).json({ error: 'Erro ao inserir pedido' });
        }

        const orderId = result.insertId;
        const productQuery = 'INSERT INTO order_products (order_id, product_id, sale_price) VALUES ?';
        const productsValues = productData.map(product => [orderId, product.productId, product.salePrice]);

        connection.query(productQuery, [productsValues], (err) => {
          if (err) {
            console.error('Erro ao inserir produtos no pedido:', err);
            return res.status(500).json({ error: 'Erro ao inserir produtos no pedido' });
          }

          res.status(201).json({ message: 'Pedido criado com sucesso!', orderId, totalValue });
        });
      });
    })
    .catch(error => {
      console.error('Erro ao processar produtos:', error);
      res.status(400).json({ error });
    });
});

// Rota para listar produtos
app.get('/api/products', (req, res) => {
  const franchise = req.query.franchise;
  if (!franchise) {
    return res.status(400).json({ error: 'Parâmetro franchise é obrigatório' });
  }

  const query = 'SELECT * FROM products WHERE franchise = ?';
  connection.query(query, [franchise], (err, results) => {
    if (err) {
      console.error('Erro ao buscar produtos:', err);
      return res.status(500).json({ error: 'Erro ao buscar produtos' });
    }
    res.status(200).json(results);
  });
});

// Rota para buscar franquias
app.get('/api/franchises', (req, res) => {
  const query = 'SELECT DISTINCT franchise FROM products';

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar franquias:', err);
      return res.status(500).json({ error: 'Erro ao buscar franquias' });
    }
    const franchises = results.map(row => row.franchise);
    res.status(200).json(franchises);
  });
});

// Rota para listar clientes
app.get('/api/clients', (req, res) => {
  const query = 'SELECT * FROM clients';

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar clientes:', err);
      return res.status(500).json({ error: 'Erro ao buscar clientes' });
    }
    res.status(200).json(results);
  });
});

// Rota para buscar produto por ID
app.get('/api/products/:id', (req, res) => {
  const productId = req.params.id;

  const query = 'SELECT * FROM products WHERE id = ?';
  connection.query(query, [productId], (err, results) => {
    if (err) {
      console.error('Erro ao buscar produto:', err);
      return res.status(500).json({ error: 'Erro ao buscar produto' });
    }

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
  });
});

// Rota para listar todos os pedidos
app.get('/api/orders', (req, res) => {
  const query = `
  SELECT o.id, o.payment_method, o.total_cost, c.name AS client_name
  FROM orders o
  JOIN clients c ON o.client_id = c.id
  `;

  connection.query(query, (err, results) => {
    if (err) {
      console.error('Erro ao buscar pedidos:', err);
      return res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
    res.status(200).json(results);
  });
});

// Rota para buscar detalhes do pedido específico
app.get('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;

  const query = `
  SELECT o.id, o.payment_method, o.total_cost, o.installments, o.combined_payment_value, 
         c.name AS client_name, 
         GROUP_CONCAT(p.name) AS product_names, 
         GROUP_CONCAT(op.sale_price) AS product_prices
  FROM orders o
  JOIN clients c ON o.client_id = c.id
  JOIN order_products op ON op.order_id = o.id
  JOIN products p ON p.id = op.product_id
  WHERE o.id = ?
  GROUP BY o.id
  `;

  connection.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Erro ao buscar detalhes do pedido:', err);
      return res.status(500).json({ error: 'Erro ao buscar detalhes do pedido' });
    }

    if (results.length > 0) {
      res.status(200).json(results[0]);
    } else {
      res.status(404).json({ error: 'Pedido não encontrado' });
    }
  });
});

// Porta para o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
