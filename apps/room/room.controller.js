const express = require('express');
const router = express.Router();
const Joi = require('joi');
const roomService = require('apps/room/room.service');
const validateRequest = require('_middlewares/validate-request');

router.post('/', createRoom);
router.get('/', getRooms);
router.get('/inventory', monitorRoomInventory);
router.post('/borrow', borrowSchema, borrowItems);

module.exports = router;

function createRoom(req, res, next) {
  roomService.createRoom(req.body)
      .then(() => res.json({ message: 'Room created' }))
      .catch(next);
}

function getRooms(req, res, next) {
  roomService.getRooms()
      .then(room => res.json(room))
      .catch(next);
}

function monitorRoomInventory(req, res, next) {
  roomService.monitorRoomsInventory()
    .then(inventory => res.json(inventory))
    .catch(next);
}

function borrowItems(req, res, next) {
  roomService.borrowItemBetweenRooms(req.body)
    .then(result => res.json(result))
    .catch(next);
}

function borrowSchema(req, res, next) {
  const schema = Joi.object({
    fromRoom: Joi.string().required(),
    toRoom: Joi.string().required(),
    itemName: Joi.string().required(),
    quantity: Joi.number().integer().min(1).required()
  });
  validateRequest(req, next, schema);
}