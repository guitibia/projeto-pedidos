const express = require('express');
const router = express.Router();
const {
  createOrder, listOrders, getOrderById,
  updateOrderStatus, deleteOrder, updateNotCame,
  getOrderParcelas, updateOrderParcela
} = require('../controllers/orderController');

router.post('/', createOrder);
router.get('/', listOrders);
router.get('/:id', getOrderById);
router.get('/:id/parcelas', getOrderParcelas);
router.put('/:id/parcelas/:num', updateOrderParcela);
router.put('/:id/status', updateOrderStatus);
router.delete('/:id', deleteOrder);
router.patch('/:orderId/products/:productCode/not-came', updateNotCame);

module.exports = router;
