const express = require('express');
const router  = express.Router();
const { listDiscounts, updateDiscount } = require('../controllers/franchiseDiscountController');

router.get('/',           listDiscounts);
router.put('/:franchise', updateDiscount);

module.exports = router;
