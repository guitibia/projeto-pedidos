const express = require('express');
const router = express.Router();
const { createClient, listClients, listClientOrders, deleteClient } = require('../controllers/clientController');

router.post('/', createClient);
router.get('/', listClients);
router.get('/:clientId/orders', listClientOrders);
router.delete('/:id', deleteClient);

module.exports = router;
