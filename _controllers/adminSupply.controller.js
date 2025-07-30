const express = require('express');
const router = express.Router();
const Joi = require('joi');
const supplyService = require('_services/adminSupply.service.js');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

router.post('/receive', receiveAdminSupplySchema, receiveAdminSupply);
router.post('/release', releaseSupplyHandlerSchema, releaseSupplyHandler);

router.get('/received', getReceivedAdminSupply);
router.get('/released', getReleasedSupply);
router.get('/:id', getReceivedAdminSupplyById);

router.put('/:id', updateReceivedAdminSupplySchema, updateReceivedAdminSupply);

module.exports = router;

// Receive Admin Supply part
function receiveAdminSupply(req, res, next) {
  supplyService.receiveAdminSupplyHandler(req.body) 
  .then (apparel => res.json (apparel)) 
  .catch(next);
}
function receiveAdminSupplySchema (req, res, next) {
  const schema = Joi.object({
        receivedFrom: Joi.string().max(50).required(), 
        receivedBy: Joi.string().required(), 
        supplyName: Joi.string().max(20).required(), 
        supplyQuantity: Joi.number().integer().min(1).required(),
        supplyMeasure: Joi.string().valid(
          'pc', 'box', 'bottle', 'pack', 'ream', 
          'meter', 'roll', 'gallon', 'unit', 'educ', 
          'teachers').required()
  });
  validateRequest(req, next, schema);
}
function getReceivedAdminSupply(req, res, next) {
  supplyService.getReceivedSupplyHandler()
      .then(apparel => res.json(apparel))
      .catch(next);
}
function getReceivedAdminSupplyById(req, res, next) {
  supplyService.getReceivedSupplyByIdHandler(req.params.id)
        .then(apparel => res.json(apparel))
        .catch(next);
}
function updateReceivedAdminSupply(req, res, next) {
  supplyService.updateReceivedSupplyHandler(req.params.id, req.body)
        .then(() => res.json({ message: `Apparel ${req.params.id} was updated succesfully` }))
        .catch(next);
}
function updateReceivedAdminSupplySchema(req, res, next) {
    const schema = Joi.object({
      receivedFrom: Joi.string().max(50).empty(), 
      receivedBy: Joi.string().empty(), 
      supplyName: Joi.string().max(20).empty(), 
      supplyQuantity: Joi.number().integer().min(1).empty(),
      supplyMeasure: Joi.string().valid(
        'pc', 'box', 'bottle', 'pack', 'ream', 
        'meter', 'roll', 'gallon', 'unit', 'educ', 
        'teachers').empty()
    });
    validateRequest(req, next, schema);
}

// Release Admin Supply part
function releaseSupplyHandler(req, res, next) {
  supplyService.releaseSupplyHandler(req.body) 
  .then (supplies => res.json (supplies)) 
  .catch(next);
}
function releaseSupplyHandlerSchema (req, res, next) {
  const schema = Joi.object({
        releasedBy: Joi.string().max(50).required(), 
        claimedBy: Joi.string().required(),
        apparelQuantity: Joi.number().integer().min(1).required()
  });
  validateRequest(req, next, schema);
}
function getReleasedSupply(req, res, next) {
  supplyService.getReleasedSupplyHandler()
      .then(release => res.json(release))
      .catch(next);
}