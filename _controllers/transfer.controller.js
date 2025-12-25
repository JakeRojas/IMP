const express = require('express');
const router  = express.Router();
const Joi     = require('joi');

const transferService = require('_services/transfer.service');
const validateRequest = require('_middlewares/validate-request');
const authorize       = require('_middlewares/authorize');
const Role            = require('_helpers/role');

router.post('/', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher]), createSchema, createTransfer);

router.get('/',     authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher]), listTransfers);
router.get('/:id',  authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher]), getById);

router.post('/:id/accept', authorize(), acceptTransfer);

module.exports = router;

// Schemas
function createSchema(req, res, next) {
  const schema = Joi.object({
    fromRoomId: Joi.number().integer().required(),
    toRoomId: Joi.number().integer().required(),
    itemId: Joi.number().integer().required(),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).allow('', null).optional()
  });
  validateRequest(req, next, schema);
}

// Handlers
async function createTransfer(req, res) {
  try {
    const payload = req.body || {};
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const createdBy = req.user && req.user.accountId;
    if (!createdBy) return res.status(401).json({ message: 'Unauthenticated' });

    // ensure fromRoom exists
    const fromRoom = await db.Room.findByPk(payload.fromRoomId);
    if (!fromRoom) return res.status(400).json({ message: 'Invalid fromRoomId' });

    // requester must be in charge of fromRoom
    if (!isUserInCharge(fromRoom, createdBy)) {
      return res.status(403).json({ message: 'You are not authorized to transfer from the selected room' });
    }

    // ensure toRoom exists
    const toRoom = await db.Room.findByPk(payload.toRoomId);
    if (!toRoom) return res.status(400).json({ message: 'Invalid toRoomId' });

    // NEW: only allow toRoom whose roomType is 'stockroom' or 'substockroom'
    const tr = String(toRoom.roomType || '').toLowerCase();
    if (!['stockroom', 'substockroom'].includes(tr)) {
      return res.status(403).json({ message: 'Transfers are allowed only to rooms with type \"stockroom\" or \"substockroom\"' });
    }

    // delegate to service
    const created = await transferService.createTransfer({
      createdBy,
      fromRoomId: Number(payload.fromRoomId),
      toRoomId: Number(payload.toRoomId),
      itemId: Number(payload.itemId),
      quantity: Number(payload.quantity),
      note: payload.note || null,
      ipAddress, browserInfo
    });

    return res.status(201).json({ success: true, data: created });
  } catch (err) {
    console.error('createTransferHandler error', err);
    const status = (err && err.status) || 500;
    const message = (err && err.message) || 'Server error';
    return res.status(status).json({ message });
  }
}
function isUserInCharge(room, accountId) {
  if (!room || !accountId) return false;
  const possibleFields = ['inChargeId','inChargeUserId','roomInCharge','managerId','accountId','createdBy'];
  for (const f of possibleFields) {
    if (typeof room[f] !== 'undefined' && String(room[f]) === String(accountId)) return true;
  }
  if (room.inChargeUsers) {
    if (Array.isArray(room.inChargeUsers) && room.inChargeUsers.map(String).includes(String(accountId))) return true;
    if (typeof room.inChargeUsers === 'string' && room.inChargeUsers.split(',').map(s => s.trim()).includes(String(accountId))) return true;
  }
  return false;
}
async function listTransfers(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    const rows = await transferService.listTransfers({ where });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}
async function getById(req, res, next) {
  try {
    const tr = await transferService.getById(parseInt(req.params.id, 10));
    res.json({ success: true, data: tr });
  } catch (err) { next(err); }
}
// async function acceptTransfer(req, res, next) {
//   try {
//     const id = parseInt(req.params.id, 10);
//     const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
//     const browserInfo = req.headers['user-agent'] || '';

//     // pass both accountId and role so service can decide authorization
//     const r = await transferService.acceptTransfer(id, req.user.accountId, req.user.role, ipAddress, browserInfo);
//     res.json({ success: true, data: r });
//   } catch (err) { next(err); }
// }
async function acceptTransfer(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    // pass ip and user-agent for logging
    const ipAddress = req.ip || (req.headers && req.headers['x-forwarded-for']) || '';
    const browserInfo = req.headers?.['user-agent'] || '';
    const r = await transferService.acceptTransfer(id, req.user.accountId, req.user.role, ipAddress, browserInfo);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}