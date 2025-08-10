const express           = require('express');
const router            = express.Router();
const Joi               = require('joi');
const roomService       = require('_services/room.service');
const apparelService       = require('_services/apparel.service');
const validateRequest   = require('_middlewares/validate-request');
const authorize         = require('_middlewares/authorize');
const Role              = require('_helpers/role');
const { get }           = require('_helpers/registry');
const { capitalize }    = require('lodash');
const { DataTypes }= require('sequelize');

router.post('/create-room',                             createRoomschema, createRoom);
router.post('/:roomId/register-item',                   registerItemSchema, registerItem);
router.post( '/:roomId/receive',                        receiveSchema, receiveItem);

router.get('/filtered-by',                              getFilteredRooms);
router.get('/',                                         getRooms);
router.get('/:roomId/received-items',                   getReceivedItems);
router.get('/in-charge-options',                        getInChargeOptions);
router.get('/:id',                                      getRoomById);
router.get('/:roomId/items',                            getRoomItems); 
router.get('/:roomId/apparels',                         getReceivedApparel);  
router.get('/:roomId/enum-options',                     getRoomEnumOptions);
router.get('/:roomId/inventory',                        getInventory);


router.put('/:roomId/scan/items/:itemQrCode/status',    updateItemStatus);

module.exports = router;

// Schema's part
function createRoomschema(req, res, next) {
  const schema = Joi.object({
      roomName: Joi.string().required().min(1).max(30),
      roomFloor: Joi.string().required().min(1).max(5),
      roomType: Joi.string().lowercase().valid('stockroom','office','classroom', 'comfortroom', 'openarea').required(),
      stockroomType: Joi.string().valid('apparel', 'supply', 'it', 'maintenance').optional(),
      roomInCharge: Joi.number().integer().min(0)
  });
  validateRequest(req, next, schema);
}
function registerItemSchema(req, res, next) {
  const schema = Joi.object({
    itemId:   Joi.number().integer().required(),
  });
  validateRequest(req, next, schema);
}
function receiveSchema(req, _res, next) {
  const schema = Joi.object({
    receivedFrom: Joi.string().required(),
    receivedBy:   Joi.string().required(),
  }).unknown(true);
  validateRequest(req, next, schema);
}

// Management part
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
function getRoomById(req, res, next) {
  roomService.getRoomById(req.params.id)
      .then(rooms => res.json(rooms))
      .catch(next);
}

// Receive part
async function receiveItem(req, res, next) {
  // try {
  //   const { roomId } = req.params;
  //   const result     = await roomService.receiveInStockroom(roomId, req.body);
  //   res.status(201).json(result);
  // } catch (err) {
  //   next(err);
  // }
  try {
    const result = await roomService.receiveInStockroom(req.params.roomId, req.body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
async function getReceivedItems(req, res, next) {
  const { roomId } = req.params;
  if (!/^\d+$/.test(roomId)) {
    return res.status(400).json({ message: 'Invalid roomId' });
  }
  try {
    const items = await roomService.getReceivedItemsByRoom(roomId);
    res.json({ items });
  } catch (err) {
    next(err);
  }
}
function getReceivedApparel(req, res, next) {
  apparelService.getReceivedApparelHandler()
      .then(apparel => res.json(apparel))
      .catch(next);
}

// Release part

// Other features
async function getInChargeOptions(req, res, next) {
  try {
    const users = await roomService.getUsersForDropdown();
    res.json(users);
  } catch (err) {
    next(err);
  }
  // try {
  //   const accounts = await get('getAll')();
  //   res.json(accounts);
  // } catch (err) { next(err); }
}
async function registerItem(req, res, next) {
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
async function getFilteredRooms(req, res, next) {
  try {
    // read your dropdown filters off query-string
    const {
      type: roomType
    } = req.query;

    const rooms = await roomService.getFilteredRooms({
      roomType,
    });

    res.json(rooms);
  } catch (err) {
    next(err);
  }
}

async function getRoomEnumOptions(req, res, next) {
  try {
    const room = await db.Room.findByPk(req.params.roomId);
    if (!room) return res.status(404).json({ options: {} });

    const modelName = `Receive_${capitalize(room.stockroomType)}`;
    const ReceiveModel = db[modelName];

    if (!ReceiveModel) {
      console.warn(`No model found for name: ${modelName}`);
      return res.json({ options: {} });
    }

    const options = {};
    
    for (const [field, attr] of Object.entries(ReceiveModel.rawAttributes)) {
      if (attr.type instanceof DataTypes.ENUM) {
        options[field] = attr.values;
        console.log(`  • ${field}: [${attr.values.join(', ')}]`);
      }
    }

    return res.json({ options });
  } catch (err) {
    next(err);
  }
}

async function getInventory(req, res, next) {
  try {
    const inventory = await roomService.getInventoryByRoom(req.params.roomId);
    res.json(inventory);
  } catch (err) {
    next(err);
  }
}