// _controllers/transfer.controller.js
const express = require('express');
const router = express.Router();
const Joi = require('joi');

const transferService = require('_services/transfer.service');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

// create transfer (teacher/admin/room-in-charge)
router.post('/', authorize(Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher), createSchema, createTransfer);

// list & get
router.get('/', authorize(Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher), listTransfers);
router.get('/:id', authorize(Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher), getById);

// accept by receiving room (confirm receipt)
router.post('/:id/accept', authorize(Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher), acceptTransfer);

// receiver initiates return
router.post('/:id/return', authorize(Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher), returnTransfer);

// original sender accepts returned
router.post('/:id/accept-return', authorize(Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher), acceptReturned);

module.exports = router;

/* Schemas */
function createSchema(req, res, next) {
  const schema = Joi.object({
    fromRoomId: Joi.number().integer().required(),
    toRoomId: Joi.number().integer().required(),
    itemType: Joi.string().valid('apparel','supply','genItem').required(),
    itemId: Joi.number().integer().required(), // inventory aggregate id
    quantity: Joi.number().integer().min(1).required(),
    note: Joi.string().max(500).optional()
  });
  validateRequest(req, next, schema);
}

/* Handlers */
async function createTransfer(req, res, next) {
  try {
    const payload = req.body;
    payload.createdBy = req.user.accountId;
    const created = await transferService.createTransfer(payload);
    res.status(201).json({ success: true, data: created });
  } catch (err) { next(err); }
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

async function acceptTransfer(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await transferService.acceptTransfer(id, req.user.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

async function returnTransfer(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await transferService.returnTransfer(id, req.user.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}

async function acceptReturned(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    const r = await transferService.acceptReturned(id, req.user.accountId);
    res.json({ success: true, data: r });
  } catch (err) { next(err); }
}
