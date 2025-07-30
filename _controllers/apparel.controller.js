const express           = require('express');
const router            = express.Router();
const Joi               = require('joi');
const apparelService    = require('_services/apparel.service.js');
const validateRequest   = require('_middlewares/validate-request');
const authorize         = require('_middlewares/authorize');
const Role              = require('_helpers/role');

//router.post('/create-item', /* authorize(Role.SuperAdmin, Role.Admin), */ upload, createItemSchema, createItem);
router.post('/receive', receiveApparelSchema, receiveApparel);
router.post('/release', releaseApparelSchema, releaseApparel);

router.get('/received', getReceivedApparel);
router.get('/released', getReleasedApparel);
router.get('/:id', getReceivedApparelById);

router.put('/:id', updateReceivedApparelSchema, updateReceivedApparel);

module.exports = router;

// Receive Apparel part
function receiveApparel(req, res, next) {
  apparelService.receiveApparelHandler(req.body) 
  .then (apparel => res.json (apparel)) 
  .catch(next);
}
function receiveApparelSchema (req, res, next) {
  const schema = Joi.object({
        receivedFrom: Joi.string().max(50).required(), 
        receivedBy: Joi.string().required(), 
        apparelName: Joi.string().max(20).required(), 
        apparelLevel: Joi.string().valid('pre', 'elem', '7', '8', '9', '10', 'sh', 'it', 'hs', 'educ', 'teachers').required(),
        apparelType: Joi.string().valid('uniform', 'pe').required(),
        apparelFor: Joi.string().valid('girls', 'boys').required(),
        apparelSize: Joi.string().max(3).required(),
        apparelQuantity: Joi.number().integer().min(1).required()
  });
  validateRequest(req, next, schema);
}
function getReceivedApparel(req, res, next) {
  apparelService.getReceivedApparelHandler()
      .then(apparel => res.json(apparel))
      .catch(next);
}
function getReceivedApparelById(req, res, next) {
    apparelService.getReceivedApparelByIdHandler(req.params.id)
        .then(apparel => res.json(apparel))
        .catch(next);
}
function updateReceivedApparel(req, res, next) {
    apparelService.updateReceivedApparelHandler(req.params.id, req.body)
        .then(() => res.json({ message: `Apparel ${req.params.id} was updated succesfully` }))
        .catch(next);
}
function updateReceivedApparelSchema(req, res, next) {
    const schema = Joi.object({
        apparelName: Joi.string().max(50).empty(), 
        apparelLevel: Joi.string().valid('pre', 'elem', '7', '8', '9', '10', 'sh', 'it', 'hs', 'educ', 'teachers').empty(),
        apparelType: Joi.string().valid('uniform', 'pe').empty(),
        apparelFor: Joi.string().valid('girls', 'boys').empty(),
        apparelSize: Joi.string().max(3).empty(),
        apparelQuantity: Joi.number().integer().min(1).empty()
    });
    validateRequest(req, next, schema);
}

// Release Apparel part
function releaseApparel(req, res, next) {
  apparelService.releaseApparelHandler(req.body) 
  .then (apparel => res.json (apparel)) 
  .catch(next);
}
function releaseApparelSchema (req, res, next) {
  const schema = Joi.object({
        releasedBy: Joi.string().max(50).required(), 
        claimedBy: Joi.string().required(),
        apparelQuantity: Joi.number().integer().min(1).required()
  });
  validateRequest(req, next, schema);
}
function getReleasedApparel(req, res, next) {
  apparelService.getReleasedApparelHandler()
      .then(release => res.json(release))
      .catch(next);
}
function getReleasedApparelById(req, res, next) {
  apparelService.getReceivedApparelByIdHandler(req.params.id)
      .then(apparel => res.json(apparel))
      .catch(next);
}