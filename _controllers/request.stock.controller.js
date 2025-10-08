const express = require('express');
const router  = express.Router();
const Joi     = require('joi');

const validateRequest = require('_middlewares/validate-request');
const authorize       = require('_middlewares/authorize');
const Role            = require('_helpers/role');
const stockService    = require('_services/request.stock.service');

router.post('/',  authorize([Role.SuperAdmin, Role.StockroomAdmin]),              createSchema, createStockRequestHandler);
router.get('/',   authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]),  listRequests);

router.get('/:stockRequestId',  authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getRequestById);

router.post('/:id/approve',     authorize([Role.SuperAdmin, Role.Admin]),           approveRequest);
router.post('/:id/disapprove',  authorize([Role.SuperAdmin, Role.Admin]),           disapproveRequest);
router.post('/:id/fulfill',     authorize([Role.SuperAdmin, Role.StockroomAdmin]),  fulfillRequest);

module.exports = router;

function createSchema(req, res, next) {
  const schema = Joi.object({
    accountId: Joi.number().integer().required(), // if auth sets req.user you may not need to pass acccountId
    requesterRoomId: Joi.number().integer().optional(),
    itemId: Joi.number().integer().optional(),
    itemType: Joi.string().valid('apparel','supply','genItem').required(),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).allow('', null).optional(),
  });
  validateRequest(req, next, schema);
}
async function createStockRequestHandler(req, res) {
  try {
    console.log('POST /req-stock body:', req.body, 'user:', req.user && { id: req.user.accountId || req.user.id, role: req.user.role });
    const created = await stockService.createStockRequest(req.body);
    return res.json({ data: created });
  } catch (err) {
    // Log full error to server console for debugging
    console.error('Error in createStockRequestHandler:', err && err.stack ? err.stack : err);

    // Normalize response so frontend receives a helpful JSON on failure
    const status = (err && err.status) || 500;
    const message = (err && (err.message || err.error || err.toString())) || 'Server error';
    return res.status(status).json({ message, details: process.env.NODE_ENV === 'development' ? (err && err.stack ? err.stack : err) : undefined });
  }
}
async function listRequests(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.acccountId) where.acccountId = req.query.acccountId;
    const rows = await stockService.listStockRequests({ where });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}
async function getRequestById(req, res, next) {
  try {
    const stockRequestId = parseInt(req.params.stockRequestId, 10);
    const r = await stockService.getStockRequestById(stockRequestId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function approveRequest(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await stockService.approveStockRequest(id, req.user?.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function disapproveRequest(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const reason = req.body.reason || null;
    const r = await stockService.disapproveStockRequest(id, req.user?.accountId, reason);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function fulfillRequest(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await stockService.fulfillStockRequest(id, req.user?.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}