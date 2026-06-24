require('dotenv').config();
const express = require('express');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();

// ── Middlewares globais ───────────────────────────────────────────────────────
app.use(express.json());

// Raiz pública → loja (o cliente cai direto na vitrine)
app.get('/', (req, res) => res.redirect('/loja/'));

app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting — 120 req/min por IP nas rotas de API
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em instantes.' }
});

// Rate limiting mais restrito para login
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,
  message: { error: 'Muitas tentativas de login. Tente novamente em 15 minutos.' }
});

// ── Rotas públicas ────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
app.use('/api/auth', loginLimiter, authRoutes);

// ── Rotas protegidas por JWT ──────────────────────────────────────────────────
const auth = require('./middleware/auth');
const clientRoutes = require('./routes/clients');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');
const promissoriaRoutes = require('./routes/promissorias');
const estoqueRoutes     = require('./routes/estoque');
const franchiseDiscountRoutes = require('./routes/franchiseDiscounts');
const { getDashboard } = require('./controllers/dashboardController');

app.use('/api/clients', apiLimiter, auth, clientRoutes);
app.use('/api/products', apiLimiter, auth, productRoutes);
app.use('/api/orders', apiLimiter, auth, orderRoutes);
app.use('/api/promissorias', apiLimiter, auth, promissoriaRoutes);
app.use('/api/estoque',     apiLimiter, auth, estoqueRoutes);
app.use('/api/franchise-discounts', apiLimiter, auth, franchiseDiscountRoutes);
app.get('/api/dashboard', apiLimiter, auth, getDashboard);

// Manter compatibilidade com rota antiga de listagem por cliente
app.get('/api/client-orders/:clientId', apiLimiter, auth, (req, res) => {
  req.params.clientId = req.params.clientId;
  require('./controllers/clientController').listClientOrders(req, res);
});

// Manter compatibilidade: /api/franchises → agora em /api/products/franchises
app.get('/api/franchises', apiLimiter, auth, (req, res) => {
  require('./controllers/productController').listFranchises(req, res);
});

// ── Tratamento de erros 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

// ── Inicializar servidor ──────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando em http://localhost:${PORT}`);
});
