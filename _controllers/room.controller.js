const express = require('express');
const router = express.Router();
const Joi = require('joi');
const fs = require('fs');
const path = require('path');

const roomService = require('_services/room.service');
const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

// POST -------------------------------------------------------------------------------------
router.post('/create-room', authorize(Role.SuperAdmin), createRoomschema, createRoom);
router.post('/create-array', authorize(Role.SuperAdmin), createAsArraySchema, createAsArray);
router.post('/:roomId/receive/apparel', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), receiveApparelSchema, receiveApparel);
router.post('/:roomId/receive/supply', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), receiveAdminSupplySchema, receiveAdminSupply);
router.post('/:roomId/receive/item', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), receiveGenItemSchema, receiveGenItem);

router.post('/:roomId/release/apparel', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), releaseApparel);
router.post('/:roomId/release/supply', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), releaseAdminSupply);
router.post('/:roomId/release/item', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), releaseGenItem);
router.post('/:roomId/release', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), releaseInStockroom);

// GET & POST ------------------------------------------------------------------------------
router.get('/:roomId/qr/apparel/batch/:inventoryId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getApparelBatchQr);
router.get('/:roomId/qr/admin-supply/batch/:inventoryId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getAdminSupplyBatchQr);
router.get('/:roomId/qr/general-item/batch/:inventoryId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getGenItemBatchQr);

router.get('/:roomId/qr/apparel/unit/:unitId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getApparelUnitQr);
router.get('/:roomId/qr/admin-supply/unit/:unitId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getAdminSupplyUnitQr);

// GET -------------------------------------------------------------------------------------
router.get('/', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), getRooms);
router.get('/list', listRooms);
// router.get('/:roomId/all-units', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), getAllUnits);
router.get('/:roomId/all-units',
  authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]),
  getAllUnits);
router.get('/:roomId/room-items',
  authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]),
  getItemsByRoom
);
router.get('/:roomId', authorize(), getRoomById);
// Apparel
router.get('/:roomId/receive-apparels', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getReceiveApparels);
router.get('/:roomId/apparels', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), getApparelUnits);
router.get('/:roomId/apparel-inventory', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getApparelInventory);
router.get('/:roomId/release-apparels', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getReleaseApparels);
// Admin Supply
router.get('/:roomId/receive-supply', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getReceiveAdminSupply);
router.get('/:roomId/supply', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), getAdminSupplyUnits);
router.get('/:roomId/supply-inventory', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getAdminSupplyInventory);
router.get('/:roomId/release-supply', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getReleasedBatchAdminSupply);
// General Items
router.get('/:roomId/receive-items', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getReceiveGenItem);
router.get('/:roomId/items', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), getGenItemUnits);
router.get('/:roomId/items-inventory', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getGenItemInventory);
router.get('/:roomId/release-items', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), getReleasedGenItems);

// PUT -------------------------------------------------------------------------------------
router.put('/:roomId', authorize(Role.SuperAdmin), updateRoomSchema, updateRoom);
router.put('/:roomId/apparel/unit/:unitId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), updateApparelUnit);
router.put('/:roomId/supply/unit/:unitId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), updateAdminSupplyUnit);
router.put('/:roomId/genitem/unit/:unitId', authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin, Role.Teacher, Role.User]), updateGenItemUnit);

function resolveQrFilePath(result) {
  if (!result) return null;
  if (result.absolutePath && fs.existsSync(result.absolutePath)) return path.resolve(result.absolutePath);

  const projectRoot = path.join(__dirname, '../uploads');
  const try1 = path.join(projectRoot, 'uploads', 'qrcodes', result.filename || '');
  if (fs.existsSync(try1)) return try1;

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
    roomType: Joi.string().valid('stockroom', 'subStockroom', 'office', 'classroom', 'openarea').required(),
    stockroomType: Joi.string().valid('apparel', 'supply', 'general').allow(null).optional(),
    roomInCharge: Joi.number().integer().min(0)
  });
  validateRequest(req, next, schema);
}
function updateRoomSchema(req, res, next) {
  const schema = Joi.object({
    roomName: Joi.string().min(1).max(30).empty(),
    roomFloor: Joi.string().min(1).max(5).empty(),
    roomType: Joi.string().valid('stockroom', 'subStockroom', 'office', 'classroom', 'openarea').empty(''),
    stockroomType: Joi.string().valid('apparel', 'supply', 'general').allow(null).empty(),
    roomInCharge: Joi.number().integer().min(0).empty()
  });
  validateRequest(req, next, schema);
}
function receiveApparelSchema(req, res, next) {
  const paramsSchema = Joi.object({
    roomId: Joi.number().integer().min(1).required()
  });

  const bodySchema = Joi.object({
    apparelName: Joi.string().trim().min(1).max(200).required(),
    apparelLevel: Joi.string().trim().max(50).allow('pre', 'elem', '7', '8', '9', '10', 'sh', 'it', 'hs', 'educ', 'teachers').required(),
    apparelType: Joi.string().trim().max(50).allow('uniform', 'pe').required(),
    apparelFor: Joi.string().trim().max(50).allow('boys', 'girls').required(),
    apparelSize: Joi.string().trim().max(50).allow(
      '2', '4', '6', '8', '10',
      '12', '14', '16', '18', '20',
      'xs', 's', 'm', 'l', 'xl',
      '2xl', '3xl').required(),
    apparelQuantity: Joi.number().integer().min(1).required(),

    receivedFrom: Joi.string().trim().min(1).max(200).required(),
    receivedBy: Joi.number().integer().min(1).required(),

    notes: Joi.string().trim().allow('', null).optional()
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
    supplyName: Joi.string().trim().min(1).max(200).required(),
    supplyQuantity: Joi.number().integer().min(1).required(),
    supplyMeasure: Joi.string().trim().max(50).allow(
      'pc', 'box', 'bottle', 'pack', 'ream',
      'meter', 'roll', 'gallon', 'unit', 'educ',
      'teachers').required(),
    receivedFrom: Joi.string().trim().min(1).max(200).required(),
    receivedBy: Joi.number().integer().min(1).required(),

    notes: Joi.string().trim().allow('', null).optional()
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
    genItemName: Joi.string().trim().min(1).max(200).required(),
    genItemSize: Joi.string().trim().max(50).allow('', null).optional(),
    genItemQuantity: Joi.number().integer().min(1).required(),
    genItemType: Joi.string().lowercase().valid('it', 'maintenance', 'unknownType').required(),

    receivedFrom: Joi.string().trim().min(1).max(200).required(),
    receivedBy: Joi.number().integer().min(1).required(),

    notes: Joi.string().trim().allow('', null).optional()
  });

  const { error: paramsErr } = paramsSchema.validate(req.params);
  if (paramsErr) return next(paramsErr);

  validateRequest(req, next, bodySchema);
}

// Management part
function createRoom(req, res, next) {
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const browserInfo = req.headers['user-agent'] || '';

  roomService.createRoomHandler(req.body, req.user, ipAddress, browserInfo)
    .then(created => res.status(201).json(created))
    .catch(next);
}
function updateRoom(req, res, next) {
  const roomId = Number(req.params.roomId);
  const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
  const browserInfo = req.headers['user-agent'] || '';

  roomService.updateRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo)
    .then(updated => res.json(updated))
    .catch(next);
}
function getRooms(req, res, next) {
  roomService.getRoomsHandler(req.user)
    .then(rooms => res.json(rooms))
    .catch(next);
}
function getRoomById(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getRoomByIdHandler(roomId, req.user)
    .then(room => res.json(room))
    .catch(next);
}

// Receive part
async function receiveApparel(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const result = await roomService.receiveApparelInRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function receiveAdminSupply(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const result = await roomService.receiveAdminSupplyInRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function receiveGenItem(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    const result = await roomService.receiveGenItemInRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo);
    res.status(201).json(result);
  } catch (err) { next(err); }
}

// Release part
async function releaseInStockroom(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    if (req.body.releaseQuantity != null && req.body.releaseApparelQuantity == null) {
      req.body.releaseApparelQuantity = req.body.releaseQuantity;
    }
    if (req.body.claimedBy == null) {
      req.body.claimedBy = req.user?.id ? String(req.user.id) : '';
    }
    const result = await roomService.releaseInStockroomHandler(roomId, req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
}
async function releaseApparel(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    if (req.body.releaseQuantity != null && req.body.releaseApparelQuantity == null) {
      req.body.releaseApparelQuantity = req.body.releaseQuantity;
    }

    if (req.body.claimedBy == null) {
      req.body.claimedBy = req.user?.id ? String(req.user.id) : '';
    }
    if (req.body.releasedBy == null) {
      req.body.releasedBy = req.user?.id ? String(req.user.id) : '';
    }

    const result = await roomService.releaseApparelInRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
async function releaseAdminSupply(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    if (req.body.releaseQuantity != null && req.body.releaseAdminSupplyQuantity == null) {
      req.body.releaseAdminSupplyQuantity = req.body.releaseQuantity;
    }

    if (req.body.claimedBy == null) {
      req.body.claimedBy = req.user?.id ? String(req.user.id) : '';
    }
    if (req.body.releasedBy == null) {
      req.body.releasedBy = req.user?.id ? String(req.user.id) : '';
    }

    const result = await roomService.releaseAdminSupplyInRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}
async function releaseGenItem(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const ipAddress = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const browserInfo = req.headers['user-agent'] || '';

    if (req.body.releaseQuantity != null && req.body.releaseItemQuantity == null) {
      req.body.releaseItemQuantity = req.body.releaseQuantity;
    }

    if (req.body.claimedBy == null) {
      req.body.claimedBy = req.user?.id ? String(req.user.id) : '';
    }
    if (req.body.releasedBy == null) {
      req.body.releasedBy = req.user?.id ? String(req.user.id) : '';
    }

    const result = await roomService.releaseGenItemInRoomHandler(roomId, req.body, req.user, ipAddress, browserInfo);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
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
function getReleasedBatchAdminSupply(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getReleasedBatchAdminSupplyByRoomHandler(roomId)
    .then(batches => res.json(batches))
    .catch(next);
}
function getReleasedGenItems(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getReleasedGenItemByRoomHandler(roomId)
    .then(batches => res.json(batches))
    .catch(next);
}

// Generate and Get QR Code part
async function getApparelBatchQr(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const inventoryId = req.params.inventoryId;

    const result = await roomService.generateApparelBatchForRoom(roomId, inventoryId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

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

    const result = await roomService.generateAdminSupplyBatchForRoom(roomId, inventoryId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

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

    const result = await roomService.generateGenItemBatchForRoom(roomId, inventoryId);

    const absolute = resolveQrFilePath(result);
    if (!absolute) return res.status(404).json({ message: 'QR file not found' });

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

//===================Lazy Style Methods=======================================
function createAsArraySchema(req, res, next) {
  const roomSchema = Joi.object({
    roomName: Joi.string().required().min(1).max(30),
    roomFloor: Joi.string().required().min(1).max(5),
    roomType: Joi.string()
      .valid('stockroom', 'subStockroom', 'office', 'classroom', 'openarea')
      .required(),
    stockroomType: Joi.string()
      .valid('apparel', 'supply', 'general')
      .allow(null)
      .optional(),
    roomInCharge: Joi.number().integer().min(0),
    description: Joi.string().allow('', null)
  });

  const schema = Joi.alternatives().try(
    roomSchema,
    Joi.array().items(roomSchema)
  );

  validateRequest(req, next, schema);
}
async function createAsArray(req, res, next) {
  try {
    if (Array.isArray(req.body)) {
      const createdRooms = await Promise.all(
        req.body.map(room => roomService.createRoomHandler(room, req.user))
      );
      return res.status(201).json(createdRooms);
    }

    const created = await roomService.createRoomHandler(req.body, req.user);
    res.status(201).json(created);
  } catch (err) {
    next(err);
  }
}

function listRooms(req, res, next) {
  roomService.listRoomsHandler()
    .then(rooms => res.json(rooms))
    .catch(next);
}
function getItemsByRoom(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getItemsByRoomHandler(roomId)
    .then(rows => res.json(rows))
    .catch(next);
}


async function updateApparelUnit(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const unitId = parseInt(req.params.unitId, 10);
    const { description, status } = req.body;

    if (!Number.isFinite(roomId) || !Number.isFinite(unitId)) {
      return res.status(400).json({ message: 'Invalid params' });
    }

    // delegate to service (keeps controller thin)
    const updated = await roomService.updateApparelUnitByRoomHandler(roomId, unitId, { description, status }, req.user);
    return res.json({ success: true, data: updated });
  } catch (err) {
    next(err);
  }
}

async function updateAdminSupplyUnit(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const unitId = parseInt(req.params.unitId, 10);
    const { description, status } = req.body;
    if (!Number.isFinite(roomId) || !Number.isFinite(unitId)) return res.status(400).json({ message: 'Invalid params' });

    const updated = await roomService.updateAdminSupplyUnitByRoomHandler(roomId, unitId, { description, status }, req.user);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

async function updateGenItemUnit(req, res, next) {
  try {
    const roomId = parseInt(req.params.roomId, 10);
    const unitId = parseInt(req.params.unitId, 10);
    const { description, status } = req.body;
    if (!Number.isFinite(roomId) || !Number.isFinite(unitId)) return res.status(400).json({ message: 'Invalid params' });

    const updated = await roomService.updateGenItemUnitByRoomHandler(roomId, unitId, { description, status }, req.user);
    return res.json({ success: true, data: updated });
  } catch (err) { next(err); }
}

function getAllUnits(req, res, next) {
  const roomId = parseInt(req.params.roomId, 10);
  roomService.getAllUnitsByRoomHandler(roomId)
    .then(units => res.json(units))
    .catch(next);
}