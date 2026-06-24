const express = require('express');
const router = express.Router();
const {
  createProduct, listProducts, listAllProducts, searchProductByCode,
  getProductById, listFranchises, updateProduct, deleteProduct, setProductImage
} = require('../controllers/productController');

router.post('/', createProduct);
router.get('/franchises', listFranchises);
router.get('/search', searchProductByCode);
router.get('/all', listAllProducts);
router.get('/', listProducts);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.post('/:id/image', setProductImage);
router.get('/:id', getProductById);

module.exports = router;
