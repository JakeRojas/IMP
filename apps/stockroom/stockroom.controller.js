const express = require('express');
const router = express.Router();
const stockroomService = require('apps/stockroom/stockroom.service');

router.get('/', getStockroomDetails);

module.exports = router;

function getStockroomDetails(req, res, next) {
    stockroomService.getStockroomDetails()
        .then(details => res.json(details))
        .catch(next);
}