const express = require('express');
const router = express.Router();
const Joi = require('joi');

const itemRequestService = require('_services/request.item.service');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

router.post('/', authorize([Role.SuperAdmin, Role.Teacher, Role.User]), createSchema, createRequest);

router.get('/', authorize([Role.SuperAdmin, Role.StockroomAdmin, Role.Teacher, Role.User]), listRequests);
router.get('/:id', authorize([Role.SuperAdmin, Role.StockroomAdmin, Role.Teacher, Role.User]), getRequestById);

router.post('/:id/accept', authorize([Role.SuperAdmin, Role.StockroomAdmin]), acceptRequest);
router.post('/:id/decline', authorize([Role.SuperAdmin, Role.StockroomAdmin]), declineRequest);
router.post('/:id/release', authorize([Role.SuperAdmin, Role.StockroomAdmin]), releaseRequest);

router.post('/:id/fulfill', authorize([Role.SuperAdmin, Role.Teacher, Role.User]), fulfillRequest);

module.exports = router;

function _extractIpAndBrowser(req) {
  const ipAddress = req.headers['x-forwarded-for'] || req.connection?.remoteAddress || req.ip || 'Unknown IP';
  const browserInfo = req.headers['user-agent'] || 'Unknown Browser';
  return { ipAddress, browserInfo };
}

// Schemas
function createSchema(req, res, next) {
  const schema = Joi.object({
    requesterRoomId: Joi.number().integer().required(),
    requestToRoomId: Joi.number().integer().required(),
    itemId: Joi.number().integer().allow(null).optional(),
    otherItemName: Joi.string().max(255).allow('', null).optional(),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).allow('', null).optional()
  });
  validateRequest(req, next, schema);
}

// Handlers
function isUserInCharge(room, accountId) {
  if (!room || !accountId) return false;
  const possibleFields = ['inChargeId', 'inChargeUserId', 'roomInCharge', 'managerId', 'accountId', 'createdBy'];
  for (const f of possibleFields) {
    if (typeof room[f] !== 'undefined' && String(room[f]) === String(accountId)) return true;
  }
  // also allow an array of users in charge stored as 'inChargeUsers' (comma-separated or array)
  if (room.inChargeUsers) {
    if (Array.isArray(room.inChargeUsers) && room.inChargeUsers.map(String).includes(String(accountId))) return true;
    if (typeof room.inChargeUsers === 'string' && room.inChargeUsers.split(',').map(s => s.trim()).includes(String(accountId))) return true;
  }
  return false;
}
async function createRequest(req, res) {
  try {
    const payload = req.body || {};
    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

    const accountId = req.user && req.user.accountId;
    if (!accountId) return res.status(401).json({ message: 'Unauthenticated' });

    // ensure the requesterRoom exists
    const requesterRoom = await db.Room.findByPk(payload.requesterRoomId);
    if (!requesterRoom) return res.status(400).json({ message: 'Invalid requesterRoomId' });

    // user must be in charge of the requesterRoom
    if (!isUserInCharge(requesterRoom, accountId)) {
      return res.status(403).json({ message: 'You are not authorized as requester for the selected room' });
    }

    // ensure the requestToRoom exists
    const requestToRoom = await db.Room.findByPk(payload.requestToRoomId);
    if (!requestToRoom) return res.status(400).json({ message: 'Invalid requestToRoomId' });

    // NEW: only allow requestToRoom whose roomType is 'stockroom' or 'substockroom'
    const rt = String(requestToRoom.roomType || '').toLowerCase();
    if (!['stockroom', 'substockroom'].includes(rt)) {
      return res.status(403).json({ message: 'You can only request from rooms with roomType \"stockroom\" or \"substockroom\"' });
    }

    // delegate to service — service will validate item belongs to requestToRoom, infer itemType, create record
    const created = await itemRequestService.createItemRequest({
      accountId,
      requesterRoomId: Number(payload.requesterRoomId),
      requestToRoomId: Number(payload.requestToRoomId),
      itemId: payload.itemId ? Number(payload.itemId) : null,
      otherItemName: payload.otherItemName || null,
      quantity: Number(payload.quantity),
      note: payload.note || null,
      ipAddress, browserInfo
    });

    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('createItemRequestHandler error', err);
    const status = (err && err.status) || 500;
    const message = (err && err.message) || 'Server error';
    return res.status(status).json({ message });
  }
}

async function listRequests(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.accountId) where.accountId = req.query.accountId;

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    const { rows, count } = await itemRequestService.listItemRequests({ where, limit, offset });

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
    const r = await itemRequestService.getItemRequestById(parseInt(req.params.id, 10));
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function acceptRequest(req, res, next) {
  try {
    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

    const r = await itemRequestService.acceptItemRequest(parseInt(req.params.id, 10), req.user.accountId, ipAddress, browserInfo);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
async function declineRequest(req, res, next) {
  try {
    const reason = req.body.reason || null;
    const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

    const r = await itemRequestService.declineItemRequest(parseInt(req.params.id, 10), req.user.accountId, reason, ipAddress, browserInfo);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
// async function releaseRequest(req, res, next) {
//   try {
//     const releaserId = req.user && req.user.accountId;
//     const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

//     if (!releaserId) return res.status(401).json({ success: false, message: 'Unauthenticated' });
//     const id = parseInt(req.params.id, 10);
//     const result = await itemRequestService.releaseItemRequest(id, releaserId, ipAddress, browserInfo);
//     res.json({ success: true, data: result });
//   } catch (err) { next(err); }
// }
// async function fulfillRequest(req, res, next) {
//   try {
//     const { ipAddress, browserInfo } = _extractIpAndBrowser(req);

//     const r = await itemRequestService.fulfillItemRequest(parseInt(req.params.id, 10), req.user.accountId, ipAddress, browserInfo);
//     res.json({ success: true, data: r });
//   } catch (err) { next(err); }
// }
async function releaseRequest(req, res, next) {
  try {
    const id = req.params.id;
    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '';
    const browser = req.get('User-Agent') || '';
    const result = await itemRequestService.releaseItemRequest(id, req.user, ip, browser);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

async function fulfillRequest(req, res, next) {
  try {
    const id = req.params.id;
    const ip = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || '';
    const browser = req.get('User-Agent') || '';
    const result = await itemRequestService.fulfillItemRequest(id, req.user, ip, browser);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
