const express           = require('express');
const router            = express.Router();
const Joi               = require('joi');
const apparelService    = require('_services/apparel.service.js');
const validateRequest   = require('_middlewares/validate-request');
const authorize         = require('_middlewares/authorize');
const Role              = require('_helpers/role');

router.post('/receive',     receiveApparelSchema, receiveApparel);
router.post('/release',     releaseApparelSchema, releaseApparel);

router.get('/',             getReceivedApparel);
router.get('/:id',          getReceivedApparelById);

router.put('/:id',          updateReceivedApparelSchema, updateReceivedApparel);

module.exports = router;

// Schema's part
function receiveApparelSchema (req, res, next) {
  const schema = Joi.object({
        receivedFrom: Joi.string().max(50).required(), 
        receivedBy: Joi.string().required(), 
        apparelName: Joi.string().max(20).required(), 
        apparelLevel: Joi.string().valid('pre', 'elem', '7', '8', '9', '10', 'sh', 'it', 'hs', 'educ', 'teachers').required(),
        apparelType: Joi.string().valid('uniform', 'pe').required(),
        apparelFor: Joi.string().valid('girls', 'boys').required(),
        apparelSize: Joi.string().valid('2', '4', '6', '8', '10', '12', '14', '16', '18', '20', 'xs', 's', 'm', 'l', 'xl', '2xl', '3xl').required(),
        apparelQuantity: Joi.number().integer().min(1).required(),
  });
  validateRequest(req, next, schema);
}
function releaseApparelSchema(req, res, next) {
  const schema = Joi.object({
    apparelInventoryId: Joi.number().integer().required(),
    releasedBy: Joi.string().max(50).required(),
    claimedBy: Joi.string().required(),
    releaseQuantity: Joi.number().integer().min(1).required()
  });
  validateRequest(req, next, schema);
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

// Receive Apparel part
function receiveApparel(req, res, next) {
  apparelService.receiveApparelHandler(req.body) 
  .then (apparel => res.json (apparel)) 
  .catch(next);
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

// Release Apparel part
function releaseApparel(req, res, next) {
  apparelService.releaseApparelHandler(req.body)
    .then(release => res.json(release))
    .catch(next);
}