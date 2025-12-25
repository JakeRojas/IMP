const express = require('express');
const router = express.Router();
const Joi = require('joi');

const borrowService = require('_services/borrow.service');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

router.post('/', authorize(), createSchema, createBorrow);
router.get('/', authorize(), listBorrows);
router.get('/:id', authorize(), getById);

router.post('/:id/approve', authorize(), approveBorrow);
router.post('/:id/decline', authorize(), declineBorrow);
router.post('/:id/cancel', authorize(), cancelBorrow);
router.post('/:id/acquire', authorize(), acquireBorrow);
router.post('/:id/return', authorize(), returnBorrow);
router.post('/:id/accept-return', authorize(), acceptReturnHandler);


module.exports = router;

// Schema for create
function createSchema(req, res, next) {
  const schema = Joi.object({
    roomId: Joi.number().integer().required(),
    itemId: Joi.number().integer().optional().allow(null),
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).optional().allow(null)
  });
  validateRequest(req, next, schema);
}

// handlers
async function createBorrow(req, res, next) {
  try {
    const payload = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    payload.requesterId = req.user.accountId;
    const created = await borrowService.createBorrow(payload, ipAddress, browserInfo);
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
}
async function listBorrows(req, res, next) {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.requesterId) where.requesterId = req.query.requesterId;
    if (req.query.roomId) where.roomId = req.query.roomId;

    const rows = await borrowService.listBorrows({ where });
    res.json({ success: true, data: rows });
  } catch (err) { next(err); }
}
async function getById(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await borrowService.getById(id);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

async function cancelBorrow(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const updated = await borrowService.cancelBorrow(id, user, ipAddress, browserInfo);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function approveBorrow(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const updated = await borrowService.approveBorrow(id, user, ipAddress, browserInfo);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
async function declineBorrow(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const { reason } = req.body || {};
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const updated = await borrowService.declineBorrow(id, user, { reason }, ipAddress, browserInfo);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function acquireBorrow(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const updated = await borrowService.acquireBorrow(id, user, ipAddress, browserInfo);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
async function returnBorrow(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const { note } = req.body || {};
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const updated = await borrowService.returnBorrow(id, user, { note }, ipAddress, browserInfo);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function acceptReturnHandler(req, res, next) {
  try {
    const id = Number(req.params.id);
    const user = req.user;
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const updated = await borrowService.acceptReturn(id, user, ipAddress, browserInfo);
    res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}
