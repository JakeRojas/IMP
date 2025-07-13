const express = require('express');
const router = express.Router();
const Joi = require('joi');
const roomService = require('_services/room.service');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

router.post('/create-room', /* authorize(Role.SuperAdmin), */ createRoomschema, createRoom);
router.get('/', getRooms);
router.get('/:id', getRoomById);
router.post('/:roomId/register-item', /* authorize(Role.SuperAdmin), */ registerItemSchema, registerItemHandler );
router.get('/in-charge-options', getInChargeOptions);
router.get('/:roomId/items', getRoomItems);
router.put('/:roomId/scan/items/:itemQrCode/status', updateItemStatus);

module.exports = router;

function createRoom(req, res, next) {
  roomService.createRoom(req.body)
      .then(() => res.json({ message: 'Room created' }))
      .catch(next);
}
function createRoomschema(req, res, next) {
  const schema = Joi.object({
      roomName: Joi.string().required().min(1).max(10),
      roomFloor: Joi.string().required().min(1).max(5),
      roomInCharge: Joi.number().integer().min(0)
  });
  validateRequest(req, next, schema);
}
function getRooms(req, res, next) {
  roomService.getRooms()
      .then(room => res.json(room))
      .catch(next);
}
function getRoomById(req, res, next) {
  roomService.getRoomById(req.params.id)
      .then(rooms => res.json(rooms))
      .catch(next);
}
async function getInChargeOptions(req, res, next) {
  try {
    const users = await roomService.getUsersForDropdown();
    res.json(users);
  } catch (err) {
    next(err);
  }
}
function registerItemSchema(req, res, next) {
  const schema = Joi.object({
    itemId:   Joi.number().integer().required(),
  });
  validateRequest(req, next, schema);
}
async function registerItemHandler(req, res, next) {
  try {
    const { itemId } = req.body;
    const inventory = await roomService.registerItem(req.params.roomId, itemId);
    res.status(201).json(inventory);
  } catch (err) {
    next(err);
  }
}
async function getRoomItems(req, res, next) {
  try {
    const items = await roomService.getRoomItems(req.params.roomId);
    res.json(items);
  } catch (err) {
    next(err);
  }
}
async function updateItemStatus(req, res, next) {
  try {
    const { roomId, itemQrCode } = req.params;
    const { newStatus } = req.body;
    const updatedInventory = await roomService.updateInventoryStatus(
      roomId,
      itemQrCode,
      newStatus
    );
    return res.json({ inventory: updatedInventory });
  } catch (err) {
    next(err);
  }
}