const express = require('express');
const router = express.Router();
const { createClient, listClients, listClientOrders, deleteClient, clientSummary, setPixDiscount } = require('../controllers/clientController');

router.post('/', createClient);
router.get('/', listClients);
router.get('/:clientId/orders', listClientOrders);
router.get('/:id/summary', clientSummary);
router.delete('/:id', deleteClient);
router.put('/:id/pix-discount', setPixDiscount);

module.exports = router;
