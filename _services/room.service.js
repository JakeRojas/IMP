const db        = require('_helpers/db-handler');
const qrService = require('_services/qr.service');

module.exports = {
  // POST -------------------------------------------------------------------------------------
  createRoomHandler,                  // create new room.
  ensureIsStockroomHandler,           // will check if the type of a room is stockroom or sub stockroom

  receiveInStockroomHandler,          // recieve in stockroom and it will route to the specific recieve functions depends on its payload.
  receiveApparelInRoomHandler,        // receive apparel function with its payload.
  receiveAdminSupplyInRoomHandler,    // receive admin supply function and its payload.
  receiveGenItemInRoomHandler,        // receive general item function and its payload.

  releaseInStockroomHandler,          // release in stockroom and it will route to the specific recieve functions depends on its payload.
  releaseApparelInRoomHandler,        // release apparel function with its payload.
  releaseAdminSupplyInRoomHandler,
  releaseGenItemInRoomHandler,

  // POST & GET --------------------------------------------------------------------------------
  generateApparelBatchForRoom,
  generateAdminSupplyBatchForRoom,
  generateGenItemBatchForRoom,

  generateApparelUnitForRoom,
  generateAdminSupplyUnitForRoom,
  generateGenItemUnitForRoom,

  // GET -------------------------------------------------------------------------------------
  getRoomsHandler,                    // display all rooms.
  getRoomByIdHandler,                 // display a specific room.

  getReceiveApparelsByRoomHandler,
  getReceiveAdminSupplyByRoomHandler,
  getReceiveGenItemByRoomHandler,
  
  getApparelInventoryByRoomHandler,
  getAdminSupplyInventoryByRoomHandler,
  getGenItemInventoryByRoomHandler,
  
  getApparelUnitsByRoomHandler,
  getAdminSupplyUnitsByRoomHandler,
  getGenItemUnitsByRoomHandler,
  
  getReleaseApparelsByRoomHandler,
  getReleasedBatchAdminSupplyByRoomHandler,
  getReleasedGenItemByRoomHandler,

  // PUT -------------------------------------------------------------------------------------
  updateRoomHandler,                  // update a specific room.
};

// Room's CRUD Handler
async function getRoomsHandler() {
  return await db.Room.findAll({
    include: [{
      model: db.Account,
      attributes: ['firstName', 'lastName']
    }]
  });
}
async function createRoomHandler(params) {
  let rooms = await db.Room.findOne({ where: {roomName: params.roomName} });

  if (rooms) {
    return { 
      message: 'Room already exists'
    }
  } else {
    rooms = await db.Room.create({
      roomName: params.roomName,
      roomFloor: params.roomFloor,
      roomType: params.roomType,
      stockroomType: params.stockroomType,
      roomInCharge: params.roomInCharge
    });
    return { 
      message: 'New room created.', 
      rooms 
  };
  }
}
async function getRoomByIdHandler(roomId) {
  const rooms = await db.Room.findByPk(roomId);
  if (!rooms) {
      throw new Error('Invalid room ID');
  }
  return rooms;
}
async function updateRoomHandler(roomId, params) {
  const room = await db.Room.findByPk(roomId);
  if (!room) {
    const err = new Error('Room not found');
    err.status = 404;
    throw err;
  }

  // allowed fields to update
  const allowed = ['roomName', 'roomFloor', 'roomType', 'stockroomType', 'roomInCharge'];
  allowed.forEach(k => { if (params[k] !== undefined) room[k] = params[k]; });

  await room.save();
  return room;
}

// Stockroom/Substockroom identifier
async function ensureIsStockroomHandler(roomId) {
  const room = await db.Room.findByPk(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);

  const rt = (room.roomType).toString().toLowerCase();
  if (rt !== 'stockroom' && rt !== 'substockroom') {
    const err = new Error(`Room ${roomId} is not a stockroom/substockroom`);
    err.status = 400;
    throw err;
  }
  //const srt = (room.stockroomType).toString().toLowerCase();
  if (!room.stockroomType) {
    const err = new Error(`Can't receive these items in this room.`);
    err.status = 400;
    throw err;
  }
  return room;
}

// Receive Handler
async function receiveInStockroomHandler(roomId, payload) {
  // ensure room is stockroom/substockroom
  await ensureIsStockroomHandler(roomId);

  // normalize numeric fields
  if (payload.apparelQuantity != null) payload.apparelQuantity  = parseInt(payload.apparelQuantity, 10);
  if (payload.supplyQuantity  != null) payload.supplyQuantity   = parseInt(payload.supplyQuantity,  10);
  if (payload.genItemQuantity != null) payload.genItemQuantity  = parseInt(payload.genItemQuantity, 10);

  // apparel path
  if (payload.apparelName && Number.isInteger(payload.apparelQuantity) && payload.apparelQuantity > 0) {
    return await receiveApparelInRoomHandler(roomId, payload);
  }

  // admin supply path
  if (payload.supplyName && Number.isInteger(payload.supplyQuantity) && payload.supplyQuantity > 0) {
    return await receiveAdminSupplyInRoomHandler(roomId, payload);
  }

  // general item path
  if (payload.genItemName && Number.isInteger(payload.genItemQuantity) && payload.genItemQuantity > 0) {
    return await receiveGenItemInRoomHandler(roomId, payload);
  }

  const err = new Error('Bad payload: must include either apparelName+apparelQuantity or supplyName+supplyQuantity');
  err.status = 400;
  throw err;
}
async function receiveApparelInRoomHandler(roomId, payload) {
  // ensure room is stockroom (will throw if not)
  await ensureIsStockroomHandler(roomId);

  // 1) create the ReceiveApparel batch row (one row per batch)
  const batch = await db.ReceiveApparel.create({
    roomId,
    receivedFrom:     payload.receivedFrom,
    receivedBy:       payload.receivedBy,
    apparelName:      payload.apparelName,
    apparelLevel:     payload.apparelLevel,
    apparelType:      payload.apparelType,
    apparelFor:       payload.apparelFor,
    apparelSize:      payload.apparelSize,
    apparelQuantity:  payload.apparelQuantity,
    notes:            payload.notes || null
  });

  // 2) create or find the aggregate ApparelInventory BEFORE creating units
  const [inv] = await db.ApparelInventory.findOrCreate({
    where: {
      roomId,
      apparelName:  payload.apparelName,
      apparelLevel: payload.apparelLevel,
      apparelType:  payload.apparelType,
      apparelFor:   payload.apparelFor,
      apparelSize:  payload.apparelSize
    },
    defaults: { totalQuantity: 0 }
  });

  // 3) increment inventory total and save
  inv.totalQuantity = (inv.totalQuantity || 0) + payload.apparelQuantity;
  await inv.save();

  // 4) create per-unit rows and set apparelInventoryId so unit-level QR refers to inventory/batch aggregate
  let createdUnits = [];
  if (db.Apparel) {
    const apparelUnits = Array(payload.apparelQuantity).fill().map(() => ({
      receiveApparelId: batch.receiveApparelId,            // keep batch FK
      apparelInventoryId: inv.apparelInventoryId ?? inv.id, // also point to aggregate inventory row
      roomId: roomId,
      status: 'good'
    }));
    createdUnits = await db.Apparel.bulkCreate(apparelUnits);
  }

  // 7) return the batch (with units if you want)
  return db.ReceiveApparel.findByPk(batch.receiveApparelId, {
    include: [{ model: db.Apparel }]
  });
}
async function receiveAdminSupplyInRoomHandler(roomId, payload) {
  await ensureIsStockroomHandler(roomId);

  const batch = await db.ReceiveAdminSupply.create({
    roomId,
    receivedFrom: payload.receivedFrom,
    receivedBy: payload.receivedBy,
    supplyName: payload.supplyName,
    supplyQuantity: payload.supplyQuantity,
    supplyMeasure: payload.supplyMeasure,
    notes: payload.notes || null
  });

  const [inv] = await db.AdminSupplyInventory.findOrCreate({
    where: {
      roomId,
      supplyName: payload.supplyName,
      supplyMeasure: payload.supplyMeasure
    },
    defaults: { totalQuantity: 0 }
  });

  inv.totalQuantity = (inv.totalQuantity || 0) + payload.supplyQuantity;
  await inv.save();

  // 4) create per-unit rows and set apparelInventoryId so unit-level QR refers to inventory/batch aggregate
  let createdUnits = [];
  if (db.AdminSupply) {
    const adminSupplyUnits = Array(payload.supplyQuantity).fill().map(() => ({
      receiveAdminSupplyId: batch.receiveAdminSupplyId,            // keep batch FK
      adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id, // also point to aggregate inventory row
      roomId: roomId,
      status: 'in_stock'
    }));
    createdUnits = await db.AdminSupply.bulkCreate(adminSupplyUnits);
  }

  return db.ReceiveAdminSupply.findByPk(batch.receiveAdminSupplyId, {
    include: [{ model: db.AdminSupply}]
  });
}
async function receiveGenItemInRoomHandler(roomId, payload) {
  // will throw if not stockroom
  await ensureIsStockroomHandler(roomId);

  // create batch
  const batch = await db.ReceiveGenItem.create({
    roomId,
    receivedFrom:     payload.receivedFrom,
    receivedBy:       payload.receivedBy,
    genItemName:      payload.genItemName,
    genItemSize:      payload.genItemSize || null,
    genItemQuantity:  payload.genItemQuantity,
    genItemType:      payload.genItemType,
    notes:            payload.notes || null
  });

  // create per-unit apparel rows (Apparel table): one row per unit received
  // Only create if you keep per-unit tracking (Apparel model exists)
  if (db.GenItem) {
    const genItemUnits = Array(payload.genItemQuantity).fill().map(() => ({
      receiveGenItemId: batch.receiveGenItemId,
      roomId: roomId,
      status: 'in_stock'
      // optionally add itemId if you create Item rows
    }));
    //await db.Apparel.bulkCreate(apparelUnits);
    const createdUnits = await db.GenItem.bulkCreate(genItemUnits);
  }

  // update/create aggregate inventory (ApparelInventory)
  const [inv] = await db.GenItemInventory.findOrCreate({
    where: {
      roomId,
      genItemName:      payload.genItemName,
      genItemSize:      payload.genItemSize || null,
      genItemType:      payload.genItemType,
    },
    defaults: { totalQuantity: 0 }
  });

  inv.totalQuantity = (inv.totalQuantity || 0) + payload.genItemQuantity;
  await inv.save();

  // return the batch (include apparel units if you like)
  return db.ReceiveGenItem.findByPk(batch.receiveGenItemId, {
    include: [{ model: db.GenItem }]
  });
}

// Get Received Handler
async function getReceiveApparelsByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  const batches = await db.ReceiveApparel.findAll({
    where: { roomId: roomId },
    include: [
      { model: db.Account, attributes: ['accountId','firstName','lastName'], required: false },
      { model: db.Apparel, required: false }
    ],
    order: [['receivedAt', 'DESC']]
  });

  return batches;
}
async function getApparelUnitsByRoomHandler(roomId) {

  await ensureIsStockroomHandler(roomId);

  const units = await db.Apparel.findAll({
    where: { roomId: roomId },
    order: [['apparelId', 'ASC']]
  });

  return units;
}
async function getApparelInventoryByRoomHandler(roomId) {

  await ensureIsStockroomHandler(roomId);

  const inventory = await db.ApparelInventory.findAll({
    where: { roomId: roomId },
    order: [['apparelName', 'ASC'], ['apparelLevel', 'ASC']]
  });

  return inventory;
}

async function getReceiveAdminSupplyByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  const batches = await db.ReceiveAdminSupply.findAll({
    where: { roomId: roomId },
    include: [
      { model: db.Account, attributes: ['accountId','firstName','lastName'], required: false },
      { model: db.AdminSupply, required: false }
    ],
    order: [['receivedAt', 'DESC']]
  });

  return batches;
}
async function getAdminSupplyUnitsByRoomHandler(roomId) {

  await ensureIsStockroomHandler(roomId);

  const units = await db.AdminSupply.findAll({
    where: { roomId: roomId },
    order: [['adminSupplyId', 'ASC']]
  });

  return units;
}
async function getAdminSupplyInventoryByRoomHandler(roomId) {

  await ensureIsStockroomHandler(roomId);

  const inventory = await db.AdminSupplyInventory.findAll({
    where: { roomId: roomId },
    order: [['supplyName', 'ASC'], ['supplyMeasure', 'ASC']]
  });

  return inventory;
}

async function getReceiveGenItemByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  const batches = await db.ReceiveGenItem.findAll({
    where: { roomId: roomId },
    include: [
      { model: db.Account, attributes: ['accountId','firstName','lastName'], required: false },
      { model: db.GenItem, required: false }
    ],
    order: [['receivedAt', 'DESC'], ['genItemType', 'DESC']]
  });

  return batches;
}
async function getGenItemUnitsByRoomHandler(roomId) {

  await ensureIsStockroomHandler(roomId);

  const units = await db.GenItem.findAll({
    where: { roomId: roomId },
    order: [['genItemId', 'ASC']]
  });

  return units;
}
async function getGenItemInventoryByRoomHandler(roomId) {

  await ensureIsStockroomHandler(roomId);

  const inventory = await db.GenItemInventory.findAll({
    where: { roomId: roomId },
    order: [['genItemName', 'ASC'], ['genItemType', 'ASC']]
  });

  return inventory;
}

// Release Handler
async function releaseInStockroomHandler(roomId, payload) {
  // ensure room is stockroom/substockroom
  await ensureIsStockroomHandler(roomId);

  // normalize numeric fields
  if (payload.releaseApparelQuantity != null) payload.releaseApparelQuantity = parseInt(payload.releaseApparelQuantity, 10);
  //if (payload.supplyQuantity != null) payload.supplyQuantity = parseInt(payload.supplyQuantity, 10);

  // apparel path
  if (payload.apparelInventoryId && Number.isInteger(payload.releaseApparelQuantity) && payload.releaseApparelQuantity > 0) {
    return await releaseApparelInRoomHandler(roomId, payload);
  }

  // admin supply path
  if (payload.adminSupplyInventoryId && Number.isInteger(payload.releaseAdminSupplyQuantity) && payload.releaseAdminSupplyQuantity > 0) {
    return await releaseAdminSupplyInRoomHandler(roomId, payload);
  }

  // general item path
  if (payload.genItemInventoryId && Number.isInteger(payload.releaseItemQuantity) && payload.releaseItemQuantity > 0) {
    return await releaseGenItemInRoomHandler(roomId, payload);
  }

  const err = new Error('Bad payload: must include either name or quantity');
  err.status = 400;
  throw err;
}
async function releaseApparelInRoomHandler(roomId, payload) {
  await ensureIsStockroomHandler(roomId);

  // require numeric quantity
  const qty = Number(payload.releaseApparelQuantity || 0);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid release quantity' };

  const sequelize = db.sequelize || null;
  const t = sequelize ? await sequelize.transaction() : null;

  try {
    // find or create the aggregate inventory within transaction
    const [inv] = await db.ApparelInventory.findOrCreate({
      where: {
        roomId,
        apparelInventoryId: payload.apparelInventoryId,
      },
      defaults: { totalQuantity: 0, status: 'out_of_stock' },
      transaction: t
    });

    const available = inv.totalQuantity || 0;
    if (available < qty) {
      // not enough stock -> do not create release, signal error
      if (t) await t.rollback();
      throw { status: 400, message: `Not enough stock to release (${available} available)` };
    }

    // create batch
    const batch = await db.ReleaseApparel.create({
      roomId,
      apparelInventoryId: payload.apparelInventoryId,
      releasedBy: payload.releasedBy,
      claimedBy: payload.claimedBy,
      releaseApparelQuantity: qty,
      notes: payload.notes || null
    }, { transaction: t });

    // deduct and update status using helper
    await updateInventory(inv, -qty, { transaction: t });

    if (t) await t.commit();

    return db.ReleaseApparel.findByPk(batch.releaseApparelId);
  } catch (e) {
    if (t) await t.rollback();
    throw e;
  }
}
async function releaseAdminSupplyInRoomHandler(roomId, payload) {
  await ensureIsStockroomHandler(roomId);

  const qty = Number(payload.releaseAdminSupplyQuantity || 0);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid release quantity' };

  const sequelize = db.sequelize || null;
  const t = sequelize ? await sequelize.transaction() : null;

  try {
    const [inv] = await db.AdminSupplyInventory.findOrCreate({
      where: {
        roomId,
        adminSupplyInventoryId: payload.adminSupplyInventoryId,
      },
      defaults: { totalQuantity: 0, status: 'out_of_stock' },
      transaction: t
    });

    const available = inv.totalQuantity || 0;
    if (available < qty) {
      if (t) await t.rollback();
      throw { status: 400, message: `Not enough stock to release (${available} available)` };
    }

    const batch = await db.ReleaseAdminSupply.create({
      roomId,
      adminSupplyInventoryId: payload.adminSupplyInventoryId,
      releasedBy: payload.releasedBy,
      claimedBy: payload.claimedBy,
      releaseAdminSupplyQuantity: qty,
      notes: payload.notes || null
    }, { transaction: t });

    await updateInventory(inv, -qty, { transaction: t });

    if (t) await t.commit();
    return db.ReleaseAdminSupply.findByPk(batch.releaseAdminSupplyId);
  } catch (e) {
    if (t) await t.rollback();
    throw e;
  }
}
async function releaseGenItemInRoomHandler(roomId, payload) {
  await ensureIsStockroomHandler(roomId);

  const qty = Number(payload.releaseItemQuantity || 0);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid release quantity' };

  const sequelize = db.sequelize || null;
  const t = sequelize ? await sequelize.transaction() : null;

  try {
    const [inv] = await db.GenItemInventory.findOrCreate({
      where: {
        roomId,
        genItemInventoryId: payload.genItemInventoryId,
      },
      defaults: { totalQuantity: 0, status: 'out_of_stock' },
      transaction: t
    });

    const available = inv.totalQuantity || 0;
    if (available < qty) {
      if (t) await t.rollback();
      throw { status: 400, message: `Not enough stock to release (${available} available)` };
    }

    const batch = await db.ReleaseGenItem.create({
      roomId,
      genItemInventoryId: payload.genItemInventoryId,
      releasedBy: payload.releasedBy,
      claimedBy: payload.claimedBy,
      releaseItemQuantity: qty,
      genItemType: payload.genItemType,
      notes: payload.notes || null
    }, { transaction: t });

    await updateInventory(inv, -qty, { transaction: t });

    if (t) await t.commit();
    return db.ReleaseGenItem.findByPk(batch.releaseGenItemId);
  } catch (e) {
    if (t) await t.rollback();
    throw e;
  }
}

// Get Released Apparels Handler
async function getReleaseApparelsByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  const batches = await db.ReleaseApparel.findAll({
    where: { roomId: roomId },
    include: [
      { model: db.Account, attributes: ['accountId','firstName','lastName'], required: false },
    ],
    order: [['releasedAt', 'DESC']]
  });

  return batches;
}
async function getReleasedBatchAdminSupplyByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  if (db.ReleaseAdminSupply) {
    return await db.ReleaseAdminSupply.findAll({
      where: { roomId },
      order: [['releasedAt', 'DESC']]
    });
  }

  // fallback: return empty array
  return [];
}
async function getReleasedGenItemByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  if (db.ReleaseGenItem) {
    return await db.ReleaseGenItem.findAll({
      where: { roomId },
      order: [['releasedAt', 'DESC']]
    });
  }
  return [];
}

// Generate QR Code Handler
async function generateApparelBatchForRoom(roomId, inventoryId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!inventoryId) throw { status: 400, message: 'inventoryId required' };

  // ensure room is stockroom/substockroom (will throw if not)
  await ensureIsStockroomHandler(roomId);

  const inv = await db.ApparelInventory.findByPk(inventoryId);
  if (!inv) throw { status: 404, message: 'ApparelInventory not found' };
  if (String(inv.roomId) !== String(roomId)) throw { status: 403, message: 'Inventory does not belong to this room' };

  // Use apparel as stockroomType
  const result = await qrService.generateBatchQR({ stockroomType: 'apparel', inventoryId });
  return { inventoryId, ...result };
}
async function generateAdminSupplyBatchForRoom(roomId, inventoryId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!inventoryId) throw { status: 400, message: 'inventoryId required' };

  // ensure room is stockroom/substockroom (will throw if not)
  await ensureIsStockroomHandler(roomId);

  const inv = await db.AdminSupplyInventory.findByPk(inventoryId);
  if (!inv) throw { status: 404, message: 'AdminSupplyInventory not found' };
  if (String(inv.roomId) !== String(roomId)) throw { status: 403, message: 'Inventory does not belong to this room' };

  // Use apparel as stockroomType
  const result = await qrService.generateBatchQR({ stockroomType: 'supply', inventoryId });
  return { inventoryId, ...result };
}
async function generateGenItemBatchForRoom(roomId, inventoryId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!inventoryId) throw { status: 400, message: 'inventoryId required' };

  // ensure room is stockroom/substockroom (will throw if not)
  await ensureIsStockroomHandler(roomId);

  const inv = await db.GenItemInventory.findByPk(inventoryId);
  if (!inv) throw { status: 404, message: 'GenItemInventory not found' };
  if (String(inv.roomId) !== String(roomId)) throw { status: 403, message: 'Inventory does not belong to this room' };

  // Use apparel as stockroomType
  const result = await qrService.generateBatchQR({ stockroomType: 'it' || 'maintenance', inventoryId });
  return { inventoryId, ...result };
}

async function generateApparelUnitForRoom(roomId, unitId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!unitId) throw { status: 400, message: 'unitId required' };

  await ensureIsStockroomHandler(roomId);

  const unit = await db.Apparel.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'Apparel unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const result = await qrService.generateUnitQR({ stockroomType: 'apparel', unitId });
  return { unitId, ...result };
}
async function generateAdminSupplyUnitForRoom(roomId, unitId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!unitId) throw { status: 400, message: 'unitId required' };

  await ensureIsStockroomHandler(roomId);

  const unit = await db.AdminSupply.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'AdminSupply unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const result = await qrService.generateUnitQR({ stockroomType: 'supply', unitId });
  return { unitId, ...result };
}
async function generateGenItemUnitForRoom(roomId, unitId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!unitId) throw { status: 400, message: 'unitId required' };

  await ensureIsStockroomHandler(roomId);

  const unit = await db.GenItem.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'GenItem unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const result = await qrService.generateUnitQR({ stockroomType: 'it' || 'maintenance', unitId });
  return { unitId, ...result };
}

function computeInventoryStatus(remaining) {
  if (remaining <= 1) return 'out_of_stock';
  if (remaining < 10) return 'low_stock';
  return 'high_stock';
}
async function updateInventory(inv, qtyChang, opts = {}) {
  if (!inv) return;
  const transaction = opts.transaction;

  // support different quantity column names across your models
  if (typeof inv.totalQuantity !== 'undefined') {
    inv.totalQuantity = (inv.totalQuantity || 0) + qtyChange;
    // ensure not negative
    if (inv.totalQuantity < 0) inv.totalQuantity = 0;
    // set status if model has the column
    if (typeof inv.status !== 'undefined') {
      inv.status = computeInventoryStatus(inv.totalQuantity);
    }
    await inv.save({ transaction });
    return;
  }

  // fallbacks if you used different names (supplyQuantity / quantity)
  if (typeof inv.supplyQuantity !== 'undefined') {
    inv.supplyQuantity = (inv.supplyQuantity || 0) + qtyChange;
    if (inv.supplyQuantity < 0) inv.supplyQuantity = 0;
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.supplyQuantity);
    await inv.save({ transaction });
    return;
  }
  if (typeof inv.quantity !== 'undefined') {
    inv.quantity = (inv.quantity || 0) + qtyChange;
    if (inv.quantity < 0) inv.quantity = 0;
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.quantity);
    await inv.save({ transaction });
    return;
  }

  throw { status: 500, message: 'Inventory does not have known quantity field' };
}