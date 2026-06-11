const express = require('express');
const router = express.Router();
const {
  createProduct, listProducts, searchProductByCode,
  getProductById, listFranchises
} = require('../controllers/productController');

router.post('/', createProduct);
router.get('/franchises', listFranchises);  // /api/products/franchises
router.get('/search', searchProductByCode); // /api/products/search?code=  — ANTES de /:id
router.get('/', listProducts);              // /api/products?franchise=
router.get('/:id', getProductById);         // /api/products/:id

module.exports = router;
