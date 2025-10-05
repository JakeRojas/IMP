// _controllers/itemRequest.controller.js
const express = require('express');
const router = express.Router();
const Joi = require('joi');

const itemRequestService = require('_services/request.item.service');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

// create request (teacher or room in-charge)
router.post('/', authorize([Role.SuperAdmin, Role.Teacher, Role.User]), createSchema, createRequest);

// list & get
router.get('/',     authorize([Role.SuperAdmin, Role.StockroomAdmin, Role.Teacher, Role.User]), listRequests);
router.get('/:id',  authorize([Role.SuperAdmin, Role.StockroomAdmin, Role.Teacher, Role.User]), getRequestById);

// stockroom accept/decline (stockroom admins)
router.post('/:id/accept',  authorize([Role.SuperAdmin, Role.StockroomAdmin]), acceptRequest);
router.post('/:id/decline', authorize([Role.SuperAdmin, Role.StockroomAdmin]), declineRequest);
router.post('/:id/release', authorize([Role.SuperAdmin, Role.StockroomAdmin]), releaseRequest);

// requester fulfills an accepted request
router.post('/:id/fulfill', authorize([Role.SuperAdmin, Role.Teacher, Role.User]), fulfillRequest);

module.exports = router;

/* Schemas */
function createSchema(req, res, next) {
  const schema = Joi.object({
    requesterRoomId: Joi.number().integer().optional(),
    itemId: Joi.number().integer().allow(null),
    itemType: Joi.string().valid('apparel','supply','genItem').required(),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).allow('', null).optional(),
  });
  validateRequest(req, next, schema);
}

/* Handlers */
async function createRequest(req, res, next) {
  try {
    const payload = req.body;
    payload.accountId = req.user.accountId;
    const created = await itemRequestService.createItemRequest(payload);
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
}

async function listRequests(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.accountId) where.accountId = req.query.accountId;
    const rows = await itemRequestService.listItemRequests({ where });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}

async function getRequestById(req, res, next) {
  try {
    const r = await itemRequestService.getItemRequestById(parseInt(req.params.id, 10));
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

async function acceptRequest(req, res, next) {
  try {
    const r = await itemRequestService.acceptItemRequest(parseInt(req.params.id, 10), req.user.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

async function declineRequest(req, res, next) {
  try {
    const reason = req.body.reason || null;
    const r = await itemRequestService.declineItemRequest(parseInt(req.params.id, 10), req.user.accountId, reason);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

async function releaseRequest(req, res, next) {
  try {
    const releaserId = req.user && req.user.accountId;
    if (!releaserId) return res.status(401).json({ success: false, message: 'Unauthenticated' });
    const id = parseInt(req.params.id, 10);
    const result = await itemRequestService.releaseItemRequest(id, releaserId);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
}

async function fulfillRequest(req, res, next) {
  try {
    const r = await itemRequestService.fulfillItemRequest(parseInt(req.params.id, 10), req.user.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
