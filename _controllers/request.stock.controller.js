const express = require('express');
const router = express.Router();
const Joi = require('joi');

const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');
const stockService = require('_services/request.stock.service');
const roomService = require('_services/room.service');

router.post('/', authorize([Role.SuperAdmin, Role.StockroomAdmin]), createSchema, createStockRequestHandler);
router.get('/', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), listRequests);

router.get('/:stockRequestId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getRequestById);

router.post('/:id/approve', authorize([Role.SuperAdmin, Role.Admin]), approveRequest);
router.post('/:id/disapprove', authorize([Role.SuperAdmin, Role.Admin]), disapproveRequest);
router.post('/:id/fulfill', authorize([Role.SuperAdmin, Role.StockroomAdmin]), fulfillRequest);

module.exports = router;

function _extractIpAndBrowser(req) {
  const ipAddress = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'Unknown IP';
  const browserInfo = req.headers['user-agent'] || 'Unknown Browser';
  return { ipAddress, browserInfo };
}

function createSchema(req, res, next) {
  // accountId and itemType removed from client payload
  const schema = Joi.object({
    requesterRoomId: Joi.number().integer().required(),
    itemId: Joi.number().integer().allow(null).optional(),
    otherItemName: Joi.string().max(255).allow('', null).optional(),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).allow('', null).optional(),
    details: Joi.object().optional(),
  });
  validateRequest(req, next, schema);
}
async function createStockRequestHandler(req, res) {
  try {
    // take accountId from logged-in user
    const payload = req.body || {};
    payload.accountId = req.user && req.user.accountId;

    // basic presence check (validateRequest already checked requesterRoomId is a number)
    if (!payload.accountId) return res.status(401).json({ message: 'Unauthenticated' });

    // verify requesterRoomId exists and is a stockroom (only stockroom-type rooms can create stock requests)
    const room = await db.Room.findByPk(payload.requesterRoomId);
    if (!room) return res.status(400).json({ message: 'Invalid requesterRoomId' });

    // normalize roomType (some of your code uses roomType fields like 'stockroom' / 'substockroom' / 'room')
    const rType = String(room.roomType || '').toLowerCase();
    if (rType !== 'stockroom' && rType !== 'substockroom') {
      return res.status(403).json({ message: 'Only rooms with roomType \"stockroom\" or \"subStockroom\" can create stock requests' });
    }

    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

    // delegate to service (service will infer itemType from itemId)
    const created = await stockService.createStockRequest(payload, ipAddress, browserInfo);
    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('Error in createStockRequestHandler:', err && err.stack ? err.stack : err);
    const status = (err && err.status) || 500;
    const message = (err && (err.message || err.error || err.toString())) || 'Server error';
    return res.status(status).json({ message, details: process.env.NODE_ENV === 'development' ? (err && err.stack ? err.stack : err) : undefined });
  }
}

async function listRequests(req, res, next) {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows, count } = await stockService.listStockRequests({ query: req.query, limit, offset });

    res.json({
      success: true,
      data: rows,
      meta: {
        total: count,
        page,
        limit,
        totalPages: Math.ceil(count / limit)
      }
    });

  } catch (err) { next(err); }
}
async function getRequestById(req, res, next) {
  try {
    const stockRequestId = parseInt(req.params.stockRequestId, 10);
    const r = await stockService.getStockRequestById(stockRequestId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
// async function approveRequest(req, res, next) {
//   try {
//     const id = parseInt(req.params.id, 10);
//     const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

//     const r = await stockService.approveStockRequest(id, req.user?.accountId, ipAddress, browserInfo);
//     res.json({ success: true, data: r });
//   } catch (err) { next(err); }
// }
async function approveRequest(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { quantity } = req.body; // [NEW] Extract quantity
    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);
    // [MODIFIED] Pass quantity to the service
    const r = await stockService.approveStockRequest(id, req.user?.accountId, ipAddress, browserInfo, quantity);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function disapproveRequest(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const reason = req.body.reason || null;
    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

    const r = await stockService.disapproveStockRequest(id, req.user?.accountId, reason, ipAddress, browserInfo);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function fulfillRequest(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

    const r = await stockService.fulfillStockRequest(id, req.user?.accountId, ipAddress, browserInfo);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}