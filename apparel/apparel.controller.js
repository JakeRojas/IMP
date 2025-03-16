// const express = require('express');
// const router = express.Router();
// const Joi = require('joi');
// const validateRequest = require('_middlewares/validate-request');
// const apparelService = require('apparel/apparel.service');
// //const inventoryService = require('../inventories/inventory.service');
// //const authorize = require('_middleware/authorize');
// //const Role = require('_helpers/role');

// router.get('/', /* authorize([Role.Admin, Role.Staff, Role.User]), */ getApparel);
// router.get('/:id', /* authorize([Role.Admin, Role.Staff, Role.User]), */ getApparelById);
// router.post('/', /* authorize([Role.Admin, Role.Staff]), */ createApparelschema, createApparel);
// router.put('/:id', /* authorize([Role.Admin, Role.Staff]), */ updateApparelschema, updateApparel);
// //router.get('/:apparelId/availability', /* authorize([Role.User]), */  checkAvailability);

// // router.put('/:id/deactivateApparel', /* authorize([Role.Admin, Role.Staff]), */ deactivateApparel);
// // router.put('/:id/reactivateApparel', /* authorize([Role.Admin, Role.Staff]), */ reactivateApparel);

// module.exports = router;

// function getApparel(req, res, next) {
//     apparelService.getApparel()
//         .then(apparel => res.json(apparel))
//         .catch(next);
// }
// function getApparelById(req, res, next) {
//     apparelService.getApparelById(req.params.id)
//         .then(apparel => res.json(apparel))
//         .catch(next);
// }
// function createApparel(req, res, next) {
//     apparelService.createApparel(req.body)
//         .then(() => res.json({ message: 'Apparel created' }))
//         .catch(next);
// }
// function createApparelschema(req, res, next) {
//     const schema = Joi.object({
//         type: Joi.string().valid('intrams', 'school', 'teachers', 'maintenance'),
//         part: Joi.string().valid('upper', 'lower'),
//         sex: Joi.string().valid('male', 'female', 'unisex'),
//         name: Joi.string().required().min(5).max(30),
//         size: Joi.string().required().min(1).max(5),
//         color: Joi.string().min(3).max(20).optional(),
//         quantity: Joi.number().integer().min(0),
//         description: Joi.string().required().min(4).max(100).optional(),
//         apparelStatus: Joi.string().valid('unavailable', 'available').optional()
//     });
//     validateRequest(req, next, schema);
// }
// function updateApparelschema(req, res, next) {
//     const schema = Joi.object({
//         name: Joi.string().min(5).max(30).empty(''),
//         size: Joi.string().min(1).max(5).empty(''),
//         color: Joi.string().min(3).max(20).empty(''),
//         description: Joi.string().min(4).max(100).empty(''),
//         apparelStatus: Joi.string().valid('unavailable', 'available').optional()
//     });
//     validateRequest(req, next, schema);
// }
// function updateApparel(req, res, next) {
//     apparelService.updateApparel(req.params.id, req.body)
//         .then(() => res.json({ message: 'Apparel updated' }))
//         .catch(next);
// }
// // function deactivateApparel(req, res, next) {
// //     apparelService.deactivate(req.params.id)
// //         .then(() => res.json({ message: 'Apparel deactivated successfully' }))
// //         .catch(next); // Pass error to errorHandler
// // }
// // function reactivateApparel(req, res, next) {
// //     apparelService.reactivate(req.params.id)
// //         .then(() => res.json({ message: 'Apparel reactivated successfully' }))
// //         .catch(next); // Pass error to errorHandler
// // }
// // // Modified checkAvailability function
// // async function checkAvailability(req, res, next) {
// //     const ApparelId = req.params.ApparelId;

// //     try {
// //         const Apparel = await apparelService.getApparelById(ApparelId);

// //         // No need to check if active here; already checked in getApparelById
// //         const inventory = await inventoryService.checkAvailability(ApparelId);
// //         const available = inventory && inventory.quantity > 0;

// //         res.json({
// //             Apparel: Apparel.name,
// //             available,
// //             quantity: inventory ? inventory.quantity : 0
// //         });
// //     } catch (error) {
// //         if (error.message === 'Invalid Apparel ID') {
// //             return res.status(404).json({ message: 'Apparel not found or ID is invalid' });
// //         }
// //         next(error);
// //     }
// // }




const express = require('express');
const router = express.Router();
const Joi = require('joi');
const validateRequest = require('_middlewares/validate-request');
const apparelService = require('apparel/apparel.service');

// Original CRUD routes
router.get('/', getApparel);
router.get('/:id', getApparelById);
router.post('/', createApparelschema, createApparel);
router.put('/:id', updateApparelschema, updateApparel);
router.get('/inventory/monitor', monitorInventory);
router.post('/reorder', reorderDecisionSchema, reorderDecision);

module.exports = router;

function getApparel(req, res, next) {
    apparelService.getApparel()
        .then(apparel => res.json(apparel))
        .catch(next);
}

function getApparelById(req, res, next) {
    apparelService.getApparelById(req.params.id)
        .then(apparel => res.json(apparel))
        .catch(next);
}

function createApparel(req, res, next) {
    apparelService.createApparel(req.body)
        .then(() => res.json({ message: 'Apparel created' }))
        .catch(next);
}

function updateApparel(req, res, next) {
    apparelService.updateApparel(req.params.id, req.body)
        .then(() => res.json({ message: 'Apparel updated' }))
        .catch(next);
}

function createApparelschema(req, res, next) {
    const schema = Joi.object({
        type: Joi.string().valid('intrams', 'school', 'teachers', 'maintenance'),
        part: Joi.string().valid('upper', 'lower'),
        sex: Joi.string().valid('male', 'female', 'unisex'),
        name: Joi.string().required().min(5).max(30),
        size: Joi.string().required().min(1).max(5),
        color: Joi.string().min(3).max(20).optional(),
        quantity: Joi.number().integer().min(0),
        description: Joi.string().min(4).max(100).optional(),
        apparelStatus: Joi.string().valid('unavailable', 'available').optional()
    });
    validateRequest(req, next, schema);
}

function updateApparelschema(req, res, next) {
    const schema = Joi.object({
        name: Joi.string().min(5).max(30).empty(''),
        size: Joi.string().min(1).max(5).empty(''),
        color: Joi.string().min(3).max(20).empty(''),
        description: Joi.string().min(4).max(100).empty(''),
        apparelStatus: Joi.string().valid('unavailable', 'available').optional()
    });
    validateRequest(req, next, schema);
}

// Schema for distributeApparel endpoint
function distributeApparelSchema(req, res, next) {
    const schema = Joi.object({
        apparelId: Joi.number().integer().required(),
        saleQuantity: Joi.number().integer().min(1).required()
    });
    validateRequest(req, next, schema);
}

// 2. Monitor Inventory
// This endpoint returns the current inventory levels along with apparel details.
function monitorInventory(req, res, next) {
    apparelService.monitorInventory()
        .then(report => res.json(report))
        .catch(next);
}

// 3. Reorder Decision
// This endpoint checks if the current stock for an apparel item is below a threshold.
function reorderDecision(req, res, next) {
    const { apparelId, threshold } = req.body;
    apparelService.reorderDecision(apparelId, threshold)
        .then(result => res.json(result))
        .catch(next);
}

// Schema for reorderDecision endpoint
function reorderDecisionSchema(req, res, next) {
    const schema = Joi.object({
        apparelId: Joi.number().integer().required(),
        threshold: Joi.number().integer().min(0).required()
    });
    validateRequest(req, next, schema);
}