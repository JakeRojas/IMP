const express   = require('express');
const router    = express.Router();
const Joi       = require('joi');
const fs        = require('fs');
const path      = require('path');

const roomService       = require('_services/room.service');
const itemService       = require('_services/item.service');
const validateRequest   = require('_middlewares/validate-request');
const authorize         = require('_middlewares/authorize');
const Role              = require('_helpers/role');

// POST -------------------------------------------------------------------------------------
router.post('/create-room',                               authorize(Role.SuperAdmin),             createRoomschema,           createRoom);
router.post('/:roomId/receive/apparel',                   /* authorize(Role.SuperAdmin, Role.Admin), */ receiveApparelSchema,       receiveApparel);
router.post('/:roomId/receive/supply',                    authorize(Role.SuperAdmin, Role.Admin), receiveAdminSupplySchema,   receiveAdminSupply);
router.post('/:roomId/receive/item',                      authorize(Role.SuperAdmin, Role.Admin), receiveGenItemSchema,       receiveGenItem);

router.post('/:roomId/release/apparel',                   authorize(Role.SuperAdmin, Role.Admin), releaseApparel);
router.post('/:roomId/release',                           authorize(Role.SuperAdmin, Role.Admin), releaseInStockroom);

// GET & POST ------------------------------------------------------------------------------
router.get('/:roomId/qr/apparel/batch/:inventoryId',      authorize(Role.SuperAdmin, Role.Admin), getApparelBatchQr);
router.get('/:roomId/qr/admin-supply/batch/:inventoryId', authorize(Role.SuperAdmin, Role.Admin), getAdminSupplyBatchQr);
router.get('/:roomId/qr/general-item/batch/:inventoryId', authorize(Role.SuperAdmin, Role.Admin), getGenItemBatchQr);

router.get('/:roomId/qr/apparel/unit/:unitId',            /* authorize(Role.SuperAdmin, Role.Admin), */ getApparelUnitQr);
router.get('/:roomId/qr/admin-supply/unit/:unitId',       authorize(Role.SuperAdmin, Role.Admin), getAdminSupplyUnitQr);

// GET -------------------------------------------------------------------------------------
router.get('/',                           authorize(Role.SuperAdmin, Role.Admin), getRooms);
router.get('/:roomId',                    authorize(), getRoomById);

// router.get('/:roomId/apparels/units', /* authorize(), */ getApparelUnits);
// router.get('/:roomId/admin-supplies/units', /* authorize(), */ getAdminSupplyUnits);
// router.get('/:roomId/gen-items/units', /* authorize(), */ getGenItemUnits);

router.get('/:roomId/receive-apparels',   /* authorize(Role.SuperAdmin, Role.Admin), */ getReceiveApparels);
router.get('/:roomId/apparels',           /* authorize(Role.SuperAdmin, Role.Admin), */ getApparelUnits);
router.get('/:roomId/apparel-inventory',  authorize(Role.SuperAdmin, Role.Admin), getApparelInventory);

router.get('/:roomId/receive-supply',     authorize(Role.SuperAdmin, Role.Admin), getReceiveAdminSupply);
router.get('/:roomId/supply',             authorize(Role.SuperAdmin, Role.Admin), getAdminSupplyUnits);
router.get('/:roomId/supply-inventory',   authorize(Role.SuperAdmin, Role.Admin), getAdminSupplyInventory);

router.get('/:roomId/receive-items',      authorize(Role.SuperAdmin, Role.Admin), getReceiveGenItem);
router.get('/:roomId/items',              authorize(Role.SuperAdmin, Role.Admin), getGenItemUnits);
router.get('/:roomId/items-inventory',    authorize(Role.SuperAdmin, Role.Admin), getGenItemInventory);

router.get('/:roomId/release-apparels',   authorize(Role.SuperAdmin, Role.Admin), getReleaseApparels);

// PUT -------------------------------------------------------------------------------------
router.put('/:roomId',             authorize(Role.SuperAdmin, Role.Admin),  updateRoomSchema,   updateRoom);
//router.put('/:roomId/item/status', /* authorize(Role.SuperAdmin, Role.Admin), */  updateItemStatus);
router.put('/:roomId/apparels/:apparelId/status', /* authorize(Role.SuperAdmin, Role.Admin), */ updateApparelStatus);
router.put('/:roomId/admin-supplies/:adminSupplyId/status', /* authorize(Role.SuperAdmin, Role.Admin), */ updateAdminSupplyStatus);
router.put('/:roomId/gen-items/:genItemId/status', /* authorize(Role.SuperAdmin, Role.Admin), */ updateGenItemStatus);

function resolveQrFilePath(result) {
  if (!result) return null;
  if (result.absolutePath && fs.existsSync(result.absolutePath)) return path.resolve(result.absolutePath);

  // fallback: try uploads/qrcodes/<filename>
  const projectRoot = path.join(__dirname, '../uploads');
  const try1 = path.join(projectRoot, 'uploads', 'qrcodes', result.filename || '');
  if (fs.existsSync(try1)) return try1;

  // fallback: try uploads/<filename>
  const try2 = path.join(projectRoot, 'uploads', result.filename || '');
  if (fs.existsSync(try2)) return try2;

  return null;
}

module.exports = router;

// Schema's part
function createRoomschema(req, res, next) {
  const schema = Joi.object({
      roomName: Joi.string().required().min(1).max(30),
      roomFloor: Joi.string().required().min(1).max(5),
      roomType: Joi.string().lowercase().valid('stockroom','subStockroom','office','classroom','comfortroom','openarea','unknownroom').required(),
      stockroomType: Joi.string().valid('apparel','supply','it','maintenance','unknownType').optional(),
      roomInCharge: Joi.number().integer().min(0)
  });
  validateRequest(req, next, schema);
}
function updateRoomSchema(req, res, next) {
  const schema = Joi.object({
    roomName: Joi.string().min(1).max(30).optional(),
    roomFloor: Joi.string().min(1).max(5).optional(),
    roomType: Joi.string().lowercase().valid('stockroom','subStockroom','office','classroom','comfortroom','openarea','unknownroom').optional(),
    stockroomType: Joi.string().valid('apparel','supply','it','maintenance','unknownType').optional(),
    roomInCharge: Joi.number().integer().min(0).optional()
  });
  validateRequest(req, next, schema);
}
function receiveApparelSchema(req, res, next) {
  const paramsSchema = Joi.object({
    roomId: Joi.number().integer().min(1).required()
  });

  const bodySchema = Joi.object({
    apparelName:      Joi.string().trim().min(1).max(200).required(),
    apparelLevel:     Joi.string().trim().max(50).allow('', null).optional(),
    apparelType:      Joi.string().trim().max(50).allow('', null).optional(),
    apparelFor:       Joi.string().trim().max(50).allow('', null).optional(),
    apparelSize:      Joi.string().trim().max(50).allow('', null).optional(),
    apparelQuantity:  Joi.number().integer().min(1).required(),

    receivedFrom:     Joi.string().trim().min(1).max(200).required(),
    receivedBy:       Joi.number().integer().min(1).required(),
    
    notes:            Joi.string().trim().allow('', null).optional()
  });

  // validate params first
  const { error: paramsErr } = paramsSchema.validate(req.params);
  if (paramsErr) return next(paramsErr);

  // validate body
  validateRequest(req, next, bodySchema);
}
function receiveAdminSupplySchema(req, res, next) {
  const paramsSchema = Joi.object({
    roomId: Joi.number().integer().min(1).required()
  });

  const bodySchema = Joi.object({
    supplyName:     Joi.string().trim().min(1).max(200).required(),
    supplyQuantity: Joi.number().integer().min(1).required(),
    supplyMeasure:  Joi.string().trim().max(50).required(),

    receivedFrom:   Joi.string().trim().min(1).max(200).required(),
    receivedBy:     Joi.number().integer().min(1).required(),

    notes:          Joi.string().trim().allow('', null).optional()
  });

  const { error: paramsErr } = paramsSchema.validate(req.params);
  if (paramsErr) return next(paramsErr);

  validateRequest(req, next, bodySchema);
}
function receiveGenItemSchema(req, res, next) {
  const paramsSchema = Joi.object({
    roomId: Joi.number().integer().min(1).required()
  });

  const bodySchema = Joi.object({
    genItemName:      Joi.string().trim().min(1).max(200).required(),
    genItemSize:      Joi.string().trim().max(50).allow('', null).optional(),
    genItemQuantity:  Joi.number().integer().min(1).required(),
    genItemType:      Joi.string().lowercase().valid('it','maintenance','unknownType').required(),

    receivedFrom:     Joi.string().trim().min(1).max(200).required(),
    receivedBy:       Joi.number().integer().min(1).required(),
    
    notes:            Joi.string().trim().allow('', null).optional()
  });

  // validate params first
  const { error: paramsErr } = paramsSchema.validate(req.params);
  if (paramsErr) return next(paramsErr);

  // validate body
  validateRequest(req, next, bodySchema);
}

// Management part
function createRoom(req, res, next) {
  roomService.createRoomHandler(req.body)
      .then(() => res.json({ message: 'Room created' }))
      .catch(next);
}
function getRooms(req, res, next) {
  roomService.getRoomsHandler()
      .then(room => res.json(room))
      .catch(next);
}
function getRoomById(req, res, next) {
  roomService.getRoomByIdHandler(req.params.roomId)
      .then(rooms => res.json(rooms))
      .catch(next);
}
async function updateRoom(req, res, next) {
  try {
    const updated = await roomService.updateRoomHandler(req.params.id, req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// Receive part
async function receiveApparel(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const result = await roomService.receiveApparelInRoomHandler(roomId, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function receiveAdminSupply(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const result = await roomService.receiveAdminSupplyInRoomHandler(roomId, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function receiveGenItem(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const result = await roomService.receiveGenItemInRoomHandler(roomId, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// Release part
async function releaseApparel(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const result = await roomService.releaseApparelInRoomHandler(roomId, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function releaseInStockroom(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    // normalize fields so room.service gets the expected names
    if (req.body.releaseQuantity != null && req.body.releaseApparelQuantity == null) {
      req.body.releaseApparelQuantity = req.body.releaseQuantity;
    }
    if (req.body.claimedBy == null) {
      req.body.claimedBy = req.user?.id ? String(req.user.id) : '';
    }
    // support both claimedBy / releasedBy fields already present in your release schema
    const result = await roomService.releaseInStockroomHandler(roomId, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// Get Received part
function getReceiveApparels(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getReceiveApparelsByRoomHandler(roomId)
    .then(batches => res.json(batches))
    .catch(next);
}
function getApparelUnits(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getApparelUnitsByRoomHandler(roomId)
    .then(units => res.json(units))
    .catch(next);
}
function getApparelInventory(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getApparelInventoryByRoomHandler(roomId)
    .then(inventory => res.json(inventory))
    .catch(next);
}

function getReceiveAdminSupply(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getReceiveAdminSupplyByRoomHandler(roomId)
    .then(batches => res.json(batches))
    .catch(next);
}
function getAdminSupplyUnits(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getAdminSupplyUnitsByRoomHandler(roomId)
    .then(units => res.json(units))
    .catch(next);
}
function getAdminSupplyInventory(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getAdminSupplyInventoryByRoomHandler(roomId)
    .then(inventory => res.json(inventory))
    .catch(next);
}

function getReceiveGenItem(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getReceiveGenItemByRoomHandler(roomId)
    .then(batches => res.json(batches))
    .catch(next);
}
function getGenItemUnits(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getGenItemUnitsByRoomHandler(roomId)
    .then(units => res.json(units))
    .catch(next);
}
function getGenItemInventory(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getGenItemInventoryByRoomHandler(roomId)
    .then(inventory => res.json(inventory))
    .catch(next);
}

// Get Relesed Apparels part
function getReleaseApparels(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getReleaseApparelsByRoomHandler(roomId)
    .then(batches => res.json(batches))
    .catch(next);
}

// Generate and Get QR Code part
async function getApparelBatchQr(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const inventoryId = req.params.inventoryId;

    // service will generate if missing (idempotent)
    const result = await roomService.generateApparelBatchForRoom(roomId, inventoryId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

    // Always return the PNG image
    return res.type('png').sendFile(absolute);
  } catch (err) {
    if (err && err.status && err.message)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
async function getAdminSupplyBatchQr(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const inventoryId = req.params.inventoryId;

    // service will generate if missing (idempotent)
    const result = await roomService.generateAdminSupplyBatchForRoom(roomId, inventoryId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

    // Always return the PNG image
    return res.type('png').sendFile(absolute);
  } catch (err) {
    if (err && err.status && err.message)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
async function getGenItemBatchQr(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const inventoryId = req.params.inventoryId;

    // service will generate if missing (idempotent)
    const result = await roomService.generateGenItemBatchForRoom(roomId, inventoryId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

    // Always return the PNG image
    return res.type('png').sendFile(absolute);
  } catch (err) {
    if (err && err.status && err.message)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
}

async function getApparelUnitQr(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const unitId = req.params.unitId;

    const result = await roomService.generateApparelUnitForRoom(roomId, unitId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

    return res.type('png').sendFile(absolute);
  } catch (err) {
    if (err && err.status && err.message)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
}
async function getAdminSupplyUnitQr(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const unitId = req.params.unitId;

    const result = await roomService.generateAdminSupplyUnitForRoom(roomId, unitId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

    return res.type('png').sendFile(absolute);
  } catch (err) {
    if (err && err.status && err.message)
      return res.status(err.status).json({ message: err.message });
    next(err);
  }
}


async function updateApparelStatus(req, res, next) {
  try {
    const updated = await itemService.updateApparelStatus({
      roomId: req.params.roomId,
      apparelId: req.params.apparelId,
      status: req.body.status,
      //userId: req.user.accountId
    });
    res.json(updated);
  } catch (err) { next(err); }
}

async function updateAdminSupplyStatus(req, res, next) {
  try {
    const updated = await itemService.updateAdminSupplyStatus({
      roomId: req.params.roomId,
      adminSupplyId: req.params.adminSupplyId,
      status: req.body.status,
      userId: req.user.accountId
    });
    res.json(updated);
  } catch (err) { next(err); }
}

async function updateGenItemStatus(req, res, next) {
  try {
    const updated = await itemService.updateGenItemStatus({
      roomId: req.params.roomId,
      genItemId: req.params.genItemId,
      status: req.body.status,
      userId: req.user.accountId
    });
    res.json(updated);
  } catch (err) { next(err); }
}