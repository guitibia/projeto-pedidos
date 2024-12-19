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
console.log("Conectado ao banco:", process.env.DB_NAME);

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
  const { name, cost, franchise, code, promotionPrice } = req.body;

  if (!name || !cost || !franchise || !code) {
    return res.status(400).json({ error: 'Todos os campos são obrigatórios!' });
  }

  const query = 'INSERT INTO products (name, cost, franchise, code, promotion_price) VALUES (?, ?, ?, ?, ?)';
  connection.query(query, [name, cost, franchise, code, promotionPrice || null], (err, results) => {
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

        const orderId = result.insertId;  // Aqui você captura o ID do pedido criado
        const productQuery = 'INSERT INTO order_products (order_id, product_id, sale_price) VALUES ?';
        const productsValues = productData.map(product => [orderId, product.productId, product.salePrice]);

        connection.query(productQuery, [productsValues], (err) => {
          if (err) {
            console.error('Erro ao inserir produtos no pedido:', err);
            return res.status(500).json({ error: 'Erro ao inserir produtos no pedido' });
          }

          res.status(201).json({ message: 'Pedido criado com sucesso!', orderId, totalValue });  // Resposta correta com orderId
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
      return res.status(500).json({ error: 'Erro ao buscar produto', details: err });
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
  // Recuperar o status a partir do filtro de query string (default é 'Todos')
  const statusFilter = req.query.status || 'Todos';
  let query = `SELECT o.id, o.payment_method, o.total_cost, o.status, c.name AS client_name
               FROM orders o
               JOIN clients c ON o.client_id = c.id`;

  // Adiciona filtro se o status for Pendente ou Entregue
  if (statusFilter !== 'Todos') {
    query += ' WHERE o.status = ?';
  }

  // Executar a consulta com ou sem filtro
  connection.query(query, [statusFilter === 'Todos' ? null : statusFilter], (err, results) => {
    if (err) {
      console.error('Erro ao buscar pedidos:', err);
      return res.status(500).json({ error: 'Erro ao buscar pedidos' });
    }
    res.status(200).json(results); // Retorna os pedidos filtrados
  });
});


// Rota para buscar detalhes do pedido específico
app.get('/api/orders/:id', (req, res) => {
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
      GROUP_CONCAT(p.code SEPARATOR ', ') AS product_codes -- Incluir o código do produto
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
      const order = results[0];

      // Processar os dados dos produtos para criar um array de objetos
      const productNames = order.product_names.split(', ');
      const productPrices = order.product_prices.split(', ').map(Number);
      const productCosts = order.product_costs.split(', ').map(Number);
      const productFranchises = order.product_franchises.split(', ');
      const productCodes = order.product_codes.split(', ');

      // Criar um array de objetos com todos os dados necessários
      const products = productNames.map((name, index) => ({
        product_name: name,
        sale_price: productPrices[index],
        cost_price: productCosts[index],
        franchise: productFranchises[index], // Atribuindo a franquia
        code: productCodes[index] // Atribuindo o código do produto
      }));

      order.products = products; // Adicionando os produtos ao pedido
      delete order.product_names;
      delete order.product_prices;
      delete order.product_costs;
      delete order.product_franchises;
      delete order.product_codes; // Removendo as variáveis temporárias

      res.status(200).json(order); // Retorna os dados do pedido com os produtos formatados
    } else {
      res.status(404).json({ error: 'Pedido não encontrado' });
    }
  });
});



// Rota para atualizar o status de um pedido
app.put('/api/orders/:id/status', (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body; // O novo status a ser atualizado

  if (!status) {
    return res.status(400).json({ error: 'O status é obrigatório!' });
  }

  // Atualizando o status do pedido
  const query = 'UPDATE orders SET status = ? WHERE id = ?';
  connection.query(query, [status, orderId], (err, results) => {
    if (err) {
      console.error('Erro ao atualizar o status do pedido:', err);
      return res.status(500).json({ error: 'Erro ao atualizar o status do pedido' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    // Buscar o pedido atualizado (incluindo o status atualizado)
    const selectQuery = `
      SELECT o.id, o.client_id, o.payment_method, o.total_cost, o.status, c.name AS client_name
      FROM orders o
      JOIN clients c ON o.client_id = c.id
      WHERE o.id = ?
    `;
    connection.query(selectQuery, [orderId], (err, results) => {
      if (err) {
        console.error('Erro ao buscar o pedido atualizado:', err);
        return res.status(500).json({ error: 'Erro ao buscar o pedido atualizado' });
      }

      // Retorna o pedido atualizado com os dados completos, incluindo o status
      res.status(200).json(results[0]);
    });
  });
});

// Rota para excluir o pedido
app.delete('/api/orders/:id', (req, res) => {
  const orderId = req.params.id;

  const query = 'DELETE FROM orders WHERE id = ?';
  connection.query(query, [orderId], (err, results) => {
    if (err) {
      console.error('Erro ao excluir pedido:', err);
      return res.status(500).json({ error: 'Erro ao excluir pedido' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Pedido não encontrado' });
    }

    res.status(200).json({ message: 'Pedido excluído com sucesso!' });
  });
});

// Rota para buscar produto pelo código
app.get('/api/products/search', (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Parâmetro code é obrigatório' });
  }

  const query = 'SELECT * FROM products WHERE code = ?';

  connection.query(query, [code], (err, results) => {
    if (err) {
      console.error('Erro ao executar a consulta SQL:', err);
      return res.status(500).json({ error: 'Erro ao buscar produto' });
    }

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
  });
});

// ROTA PARA ATUALIZAR SE O ITEM VEIO
app.patch('/api/orders/:orderId/products/:productCode/not-came', (req, res) => {
  const { orderId, productCode } = req.params;
  const { notCame } = req.body;

  const query = `
    UPDATE order_products op
    JOIN products p ON op.product_id = p.id
    SET op.not_came = ?
    WHERE op.order_id = ? AND p.code = ?;
  `;

  connection.query(query, [notCame ? 1 : 0, orderId, productCode], (err, results) => {
    if (err) {
      console.error('Erro ao atualizar o status do produto:', err);
      return res.status(500).json({ error: 'Erro ao atualizar o status do produto.' });
    }

    if (results.affectedRows === 0) {
      return res.status(404).json({ error: 'Produto não encontrado no pedido.' });
    }

    res.status(200).json({ message: notCame ? 'Produto marcado como NÃO VEIO.' : 'Produto marcado como VEIO.' });
  });
});

// Rota para listar pedidos de um cliente específico
app.get('/api/client-orders/:clientId', (req, res) => {
  const clientId = req.params.clientId;
  const statusFilter = req.query.status || 'Todos'; // Filtra por status (Todos, Pendente, Entregue)

  let query = `SELECT o.id, o.payment_method, o.total_cost, o.status, c.name AS client_name
               FROM orders o
               JOIN clients c ON o.client_id = c.id
               WHERE o.client_id = ?`;

  // Se o filtro de status for diferente de "Todos", adicione o filtro de status na consulta
  if (statusFilter !== 'Todos') {
    query += ' AND o.status = ?';
  }

  connection.query(query, [clientId, statusFilter === 'Todos' ? null : statusFilter], (err, results) => {
    if (err) {
      console.error('Erro ao buscar pedidos do cliente:', err);
      return res.status(500).json({ error: 'Erro ao buscar pedidos do cliente' });
    }
    res.status(200).json(results); // Retorna os pedidos filtrados
  });
});



// Porta para o servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
