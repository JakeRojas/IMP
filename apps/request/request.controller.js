const express = require('express');
const router = express.Router();
const Joi = require('joi');
const requestService = require('apps/request/request.service');
const validateRequest = require('_middlewares/validate-request');

router.post('/', requestSchema, submitRequest);
router.put('/approve', approveSchema, approveRequest);

module.exports = router;

function submitRequest(req, res, next) {
  requestService.createItemRequest(req.body)
    .then(result => res.json(result))
    .catch(next);
}

function approveRequest(req, res, next) {
  requestService.approveItemRequest(req.body)
    .then(result => res.json(result))
    .catch(next);
}

function requestSchema(req, res, next) {
  const schema = Joi.object({
    roomName: Joi.string().required(),
    itemName: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required()
  });
  validateRequest(req, next, schema);
}

function approveSchema(req, res, next) {
  const schema = Joi.object({
    requestId: Joi.number().integer().required()
  });
  validateRequest(req, next, schema);
}