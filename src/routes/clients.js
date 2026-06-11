const express = require('express');
const router = express.Router();
const { createClient, listClients, listClientOrders } = require('../controllers/clientController');

router.post('/', createClient);
router.get('/', listClients);
router.get('/:clientId/orders', listClientOrders);

module.exports = router;
