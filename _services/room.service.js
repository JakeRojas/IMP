const db = require('_helpers/db-handler');
const Role = require('_helpers/role');
const qrService = require('_services/qr.service');
const accountService = require('_services/account.service');

module.exports = {
  // POST -------------------------------------------------------------------------------------
  createRoomHandler,                  // create new room.
  ensureIsStockroomHandler,           // will check if the type of a room is stockroom or sub stockroom
  ensureRoomExistsHandler,

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

  getItemsByRoomHandler,

  listRoomsHandler,
  updateApparelUnitByRoomHandler,
  updateAdminSupplyUnitByRoomHandler,
  updateGenItemUnitByRoomHandler,
  getAllUnitsByRoomHandler
};

// Room's CRUD Handler
function isSuperAdmin(user) {
  if (!user) return false;
  const role = user.role;
  if (!role) return false;
  if (Array.isArray(role)) {
    return role.some(r => String(r).toLowerCase() === 'superadmin');
  }
  return String(role).toLowerCase() === 'superadmin';
}
async function getRoomsHandler(user) {
  if (!user) return [];

  const include = [{
    model: db.Account,
    attributes: ['firstName', 'lastName', 'accountId']
  }];

  if ((user.role || '').toString().toLowerCase() === (Role.SuperAdmin || '').toString().toLowerCase()) {
    return await db.Room.findAll({ include });
  }

  const accountId = Number(user.accountId || user.AccountId || user.id);
  if (!accountId) return [];

  return await db.Room.findAll({
    where: { roomInCharge: accountId },
    include
  });
}
async function createRoomHandler(payload, user, ipAddress, browserInfo) {
  if (!isSuperAdmin(user)) {
    const err = new Error('Forbidden: only Super Admin can create rooms');
    err.status = 403;
    throw err;
  }

  const created = await db.Room.create({
    roomName: payload.roomName,
    roomFloor: payload.roomFloor,
    roomType: payload.roomType,
    stockroomType: payload.stockroomType ?? null, // <- add this line
    roomInCharge: payload.roomInCharge,
    description: payload.description,
  });

  try {
    await accountService.logActivity(user.accountId, 'room_create', ipAddress, browserInfo, `roomId:${created.roomId}`);
  } catch (err) {
    console.error('activity log failed (createRoom)', err);
  }

  return created;
}
async function getRoomByIdHandler(roomId, user) {
  const room = await db.Room.findByPk(roomId, {
    include: [{
      model: db.Account,
      attributes: ['firstName', 'lastName', 'accountId']
    }]
  });

  if (!room) {
    const err = new Error('Room not found');
    err.status = 404;
    throw err;
  }

  if ((user.role || '').toString().toLowerCase() === (Role.SuperAdmin || '').toString().toLowerCase()) {
    return room;
  }

  const accountId = Number(user.accountId || user.AccountId || user.id);
  if (accountId && Number(room.roomInCharge) === accountId) {
    return room;
  }

  const err = new Error('Forbidden: you do not have access to this room');
  err.status = 403;
  throw err;
}
async function updateRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
  if (!isSuperAdmin(user)) {
    const err = new Error('Forbidden: only Super Admin can edit rooms');
    err.status = 403;
    throw err;
  }

  const room = await db.Room.findByPk(roomId);
  if (!room) {
    const err = new Error('Room not found');
    err.status = 404;
    throw err;
  }

  Object.assign(room, {
    roomName: payload.roomName ?? room.roomName,
    roomFloor: payload.roomFloor ?? room.roomFloor,
    roomType: payload.roomType ?? room.roomType,
    stockroomType: (payload.hasOwnProperty('stockroomType') ? payload.stockroomType : room.stockroomType),
    roomInCharge: payload.roomInCharge ?? room.roomInCharge,
    description: payload.description ?? room.description,
  });

  try {
    await accountService.logActivity(user.accountId, 'room_update', ipAddress, browserInfo, `roomId:${roomId}`);
  } catch (err) {
    console.error('activity log failed (roomUpdate)', err);
  }

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
  if (!room.stockroomType) {
    const err = new Error(`Can't receive these items in this room.`);
    err.status = 400;
    throw err;
  }
  return room;
}
async function ensureRoomExistsHandler(roomId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  const room = await db.Room.findByPk(roomId);
  if (!room) throw { status: 404, message: 'Room not found' };
  return room;
}

// Receive Handler
async function receiveInStockroomHandler(roomId, payload) {
  await ensureIsStockroomHandler(roomId);

  // normalize numeric fields
  if (payload.apparelQuantity != null) payload.apparelQuantity = parseInt(payload.apparelQuantity, 10);
  if (payload.supplyQuantity != null) payload.supplyQuantity = parseInt(payload.supplyQuantity, 10);
  if (payload.genItemQuantity != null) payload.genItemQuantity = parseInt(payload.genItemQuantity, 10);

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

  try {
    await accountService.logActivity(user.accountId, 'room_create', ipAddress, browserInfo, `borrowId:${created.roomId}`);
  } catch (err) {
    console.error('activity log failed (createBorrow)', err);
  }

  const err = new Error('Bad payload: must include either apparelName+apparelQuantity or supplyName+supplyQuantity');
  err.status = 400;
  throw err;
}
async function receiveApparelInRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
  await ensureIsStockroomHandler(roomId);

  const batch = await db.ReceiveApparel.create({
    roomId,
    receivedFrom: payload.receivedFrom,
    receivedBy: payload.receivedBy,
    apparelName: payload.apparelName,
    apparelLevel: payload.apparelLevel,
    apparelType: payload.apparelType,
    apparelFor: payload.apparelFor,
    apparelSize: payload.apparelSize,
    apparelQuantity: payload.apparelQuantity,
    notes: payload.notes || null
  });

  const [inv] = await db.ApparelInventory.findOrCreate({
    where: {
      roomId,
      apparelName: payload.apparelName,
      apparelLevel: payload.apparelLevel,
      apparelType: payload.apparelType,
      apparelFor: payload.apparelFor,
      apparelSize: payload.apparelSize
    },
    defaults: { totalQuantity: 0 }
  });

  inv.totalQuantity = (inv.totalQuantity || 0) + payload.apparelQuantity;
  await inv.save();

  let createdUnits = [];
  if (db.Apparel) {
    const apparelUnits = Array(payload.apparelQuantity).fill().map(() => ({
      receiveApparelId: batch.receiveApparelId,
      apparelInventoryId: inv.apparelInventoryId ?? inv.id,
      roomId: roomId,
      status: 'good'
    }));
    createdUnits = await db.Apparel.bulkCreate(apparelUnits);
  }

  const res = db.ReceiveApparel.findByPk(batch.receiveApparelId, {
    include: [{ model: db.Apparel }]
  });

  try {
    await accountService.logActivity(user.accountId, 'receive_apparel', ipAddress, browserInfo, `roomId:${roomId}`);
  } catch (err) {
    console.error('activity log failed (receiveApparel)', err);
  }

  return res;
}
async function receiveAdminSupplyInRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
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

  let createdUnits = [];
  if (db.AdminSupply) {
    const adminSupplyUnits = Array(payload.supplyQuantity).fill().map(() => ({
      receiveAdminSupplyId: batch.receiveAdminSupplyId,
      adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id,
      roomId: roomId,
      status: 'good'
    }));
    createdUnits = await db.AdminSupply.bulkCreate(adminSupplyUnits);
  }

  const res = db.ReceiveAdminSupply.findByPk(batch.receiveAdminSupplyId, {
    include: [{ model: db.AdminSupply }]
  });

  try {
    await accountService.logActivity(user.accountId, 'receive_admin-supply', ipAddress, browserInfo, `roomId:${roomId}`);
  } catch (err) {
    console.error('activity log failed (receiveAdminSupply)', err);
  }

  return res;
}
async function receiveGenItemInRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
  await ensureIsStockroomHandler(roomId);

  const batch = await db.ReceiveGenItem.create({
    roomId,
    receivedFrom: payload.receivedFrom,
    receivedBy: payload.receivedBy,
    genItemName: payload.genItemName,
    genItemSize: payload.genItemSize || null,
    genItemQuantity: payload.genItemQuantity,
    genItemType: payload.genItemType,
    notes: payload.notes || null
  });

  // FIND or CREATE inventory first (moved up)
  const [inv] = await db.GenItemInventory.findOrCreate({
    where: {
      roomId,
      genItemName: payload.genItemName,
      genItemSize: payload.genItemSize || null,
      genItemType: payload.genItemType,
    },
    defaults: { totalQuantity: 0 }
  });

  // Update inventory total and save
  inv.totalQuantity = (inv.totalQuantity || 0) + payload.genItemQuantity;
  await inv.save();

  // Then create unit rows (and include genItemInventoryId)
  let createdUnits = [];
  if (db.GenItem) {
    const genItemUnits = Array(payload.genItemQuantity).fill().map(() => ({
      receiveGenItemId: batch.receiveGenItemId,
      genItemInventoryId: inv.genItemInventoryId ?? inv.id, // <-- important
      roomId: roomId,
      status: 'good'
    }));
    createdUnits = await db.GenItem.bulkCreate(genItemUnits);
  }

  // return the batch (including generated units, same as before)
  const res = db.ReceiveGenItem.findByPk(batch.receiveGenItemId, {
    include: [{ model: db.GenItem }]
  });

  try {
    await accountService.logActivity(user.accountId, 'receive_general-items', ipAddress, browserInfo, `roomId:${roomId}`);
  } catch (err) {
    console.error('activity log failed (receiveGenItems)', err);
  }

  return res;
}

// Get Received Handler
async function getReceiveApparelsByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  const batches = await db.ReceiveApparel.findAll({
    where: { roomId: roomId },
    include: [
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'], required: false },
      { model: db.Apparel, required: false }
    ],
    order: [['receivedAt', 'DESC']]
  });

  return batches;
}
// async function getApparelUnitsByRoomHandler(roomId) {

//   // await ensureIsStockroomHandler(roomId);
//   await ensureRoomExistsHandler(roomId);

//   const units = await db.Apparel.findAll({
//     where: { roomId: roomId },
//     order: [['apparelId', 'ASC']]
//   });

//   return units;
// }
async function getApparelUnitsByRoomHandler(roomId) {
  // Return apparel unit rows for any room (don't require stockroom check)
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
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'], required: false },
      { model: db.AdminSupply, required: false }
    ],
    order: [['receivedAt', 'DESC']]
  });

  return batches;
}
// async function getAdminSupplyUnitsByRoomHandler(roomId) {

//   await ensureIsStockroomHandler(roomId);

//   const units = await db.AdminSupply.findAll({
//     where: { roomId: roomId },
//     order: [['adminSupplyId', 'ASC']]
//   });

//   return units;
// }
async function getAdminSupplyUnitsByRoomHandler(roomId) {
  // Return admin supply units for any room (don't require stockroom check)
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
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'], required: false },
      { model: db.GenItem, required: false }
    ],
    order: [['receivedAt', 'DESC'], ['genItemType', 'DESC']]
  });

  return batches;
}
// async function getGenItemUnitsByRoomHandler(roomId) {

//   // await ensureIsStockroomHandler(roomId);

//   const units = await db.GenItem.findAll({
//     where: { roomId: roomId },
//     order: [['genItemId', 'ASC']]
//   });

//   return units;
// }
async function getGenItemUnitsByRoomHandler(roomId) {
  // Return general-item units for any room (don't require stockroom check)
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
  await ensureIsStockroomHandler(roomId);

  if (payload.releaseApparelQuantity != null) payload.releaseApparelQuantity = parseInt(payload.releaseApparelQuantity, 10);

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
async function releaseApparelInRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
  await ensureIsStockroomHandler(roomId);

  const qty = Number(payload.releaseApparelQuantity || 0);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid release quantity' };

  const sequelize = db.sequelize || null;
  const t = sequelize ? await sequelize.transaction() : null;

  try {
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
      if (t) await t.rollback();
      throw { status: 400, message: `Not enough stock to release (${available} available)` };
    }

    const batch = await db.ReleaseApparel.create({
      roomId,
      apparelInventoryId: payload.apparelInventoryId,
      releasedBy: payload.releasedBy,
      claimedBy: payload.claimedBy,
      releaseApparelQuantity: qty,
      notes: payload.notes || null
    }, { transaction: t });

    await updateInventory(inv, -qty, { transaction: t });

    if (t) await t.commit();

    const res = db.ReleaseApparel.findByPk(batch.releaseApparelId);

    try {
      await accountService.logActivity(user.accountId, 'release_apparel', ipAddress, browserInfo, `roomId:${roomId}`);
    } catch (err) {
      console.error('activity log failed (releaseApparel)', err);
    }

    return res;
  } catch (e) {
    if (t) await t.rollback();
    throw e;
  }
}
async function releaseAdminSupplyInRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
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
    const res = db.ReleaseAdminSupply.findByPk(batch.releaseAdminSupplyId);

    try {
      await accountService.logActivity(user.accountId, 'release_admin-supply', ipAddress, browserInfo, `roomId:${roomId}`);
    } catch (err) {
      console.error('activity log failed (releaseAdminSupply)', err);
    }

    return res;
  } catch (e) {
    if (t) await t.rollback();
    throw e;
  }
}
async function releaseGenItemInRoomHandler(roomId, payload, user, ipAddress, browserInfo) {
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
    const res = db.ReleaseGenItem.findByPk(batch.releaseGenItemId);

    try {
      await accountService.logActivity(user.accountId, 'release_general-tems', ipAddress, browserInfo, `roomId:${roomId}`);
    } catch (err) {
      console.error('activity log failed (releaseGenItem)', err);
    }

    return res;
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
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'], required: false },
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

  await ensureRoomExistsHandler(roomId);

  const inv = await db.ApparelInventory.findByPk(inventoryId);
  if (!inv) throw { status: 404, message: 'ApparelInventory not found' };
  if (String(inv.roomId) !== String(roomId)) throw { status: 403, message: 'Inventory does not belong to this room' };

  const result = await qrService.generateBatchQR({ stockroomType: 'apparel', inventoryId });

  return { inventoryId, result };
}
async function generateAdminSupplyBatchForRoom(roomId, inventoryId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!inventoryId) throw { status: 400, message: 'inventoryId required' };

  await ensureRoomExistsHandler(roomId);

  const inv = await db.AdminSupplyInventory.findByPk(inventoryId);
  if (!inv) throw { status: 404, message: 'AdminSupplyInventory not found' };
  if (String(inv.roomId) !== String(roomId)) throw { status: 403, message: 'Inventory does not belong to this room' };

  const result = await qrService.generateBatchQR({ stockroomType: 'supply', inventoryId });



  return { inventoryId, ...result };
}
async function generateGenItemBatchForRoom(roomId, inventoryId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!inventoryId) throw { status: 400, message: 'inventoryId required' };

  await ensureRoomExistsHandler(roomId);

  const inv = await db.GenItemInventory.findByPk(inventoryId);
  if (!inv) throw { status: 404, message: 'GenItemInventory not found' };
  if (String(inv.roomId) !== String(roomId)) throw { status: 403, message: 'Inventory does not belong to this room' };

  const result = await qrService.generateBatchQR({ stockroomType: 'genitem', inventoryId });
  return { inventoryId, ...result };
}

async function generateApparelUnitForRoom(roomId, unitId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!unitId) throw { status: 400, message: 'unitId required' };

  await ensureRoomExistsHandler(roomId);

  const unit = await db.Apparel.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'Apparel unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const result = await qrService.generateUnitQR({ stockroomType: 'apparel', unitId });
  return { unitId, ...result };
}
async function generateAdminSupplyUnitForRoom(roomId, unitId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!unitId) throw { status: 400, message: 'unitId required' };

  await ensureRoomExistsHandler(roomId);

  const unit = await db.AdminSupply.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'AdminSupply unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const result = await qrService.generateUnitQR({ stockroomType: 'supply', unitId });
  return { unitId, ...result };
}
async function generateGenItemUnitForRoom(roomId, unitId) {
  if (!roomId) throw { status: 400, message: 'roomId required' };
  if (!unitId) throw { status: 400, message: 'unitId required' };

  await ensureRoomExistsHandler(roomId);

  const unit = await db.GenItem.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'GenItem unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const result = await qrService.generateUnitQR({ stockroomType: 'genitem', unitId });
  return { unitId, ...result };
}

function computeInventoryStatus(remaining) {
  if (remaining <= 1) return 'out_of_stock';
  if (remaining < 10) return 'low_stock';
  return 'high_stock';
}
async function updateInventory(inv, qtyChange, opts = {}) {
  if (!inv) return;

  if (!Number.isFinite(Number(qtyChange))) {
    throw { status: 500, message: 'Invalid qtyChange to updateInventory' };
  }

  const delta = Number(qtyChange);
  const transaction = opts.transaction;

  if (typeof inv.totalQuantity !== 'undefined') {
    inv.totalQuantity = Math.max(0, (inv.totalQuantity || 0) + delta);

    if (typeof inv.status !== 'undefined') {
      inv.status = computeInventoryStatus(inv.totalQuantity);
    }

    await inv.save({ transaction });
    return;
  }

  if (typeof inv.quantity !== 'undefined') {
    inv.quantity = Math.max(0, (inv.quantity || 0) + delta);

    if (typeof inv.status !== 'undefined') {
      inv.status = computeInventoryStatus(inv.quantity);
    }

    await inv.save({ transaction });
    return;
  }

  try {
    const current = Number(inv.getDataValue('quantity') || 0);
    inv.setDataValue('quantity', Math.max(0, current + delta));
    await inv.save({ transaction });
  } catch (err) {
    throw { status: 500, message: 'Unable to update inventory quantity', detail: err.message || err };
  }
}

// original method
async function getItemsByRoomHandler(roomId) {
  await ensureIsStockroomHandler(roomId);

  // load per-type inventory lists in parallel (fall back to empty array)
  const [apparelInv, supplyInv, genInv] = await Promise.all([
    getApparelInventoryByRoomHandler(roomId).catch(() => []),
    getAdminSupplyInventoryByRoomHandler(roomId).catch(() => []),
    getGenItemInventoryByRoomHandler(roomId).catch(() => [])
  ]);

  const merged = [];

  (apparelInv || []).forEach(inv => {
    merged.push({
      itemType: 'apparel',
      inventoryId: inv.apparelInventoryId ?? inv.id ?? null,
      name: inv.apparelName ?? inv.name ?? `Apparel #${inv.apparelInventoryId || inv.id || ''}`,
      totalQuantity: Number(inv.totalQuantity || inv.apparelQuantity || 0),
      raw: inv
    });
  });

  (supplyInv || []).forEach(inv => {
    merged.push({
      itemType: 'supply',
      inventoryId: inv.adminSupplyInventoryId ?? inv.id ?? null,
      name: inv.supplyName ?? inv.name ?? `Supply #${inv.adminSupplyInventoryId || inv.id || ''}`,
      totalQuantity: Number(inv.totalQuantity || inv.supplyQuantity || 0),
      raw: inv
    });
  });

  (genInv || []).forEach(inv => {
    merged.push({
      itemType: 'genItem',
      inventoryId: inv.genItemInventoryId ?? inv.id ?? null,
      name: inv.genItemName ?? inv.name ?? `Item #${inv.genItemInventoryId || inv.id || ''}`,
      totalQuantity: Number(inv.totalQuantity || inv.genItemQuantity || 0),
      raw: inv
    });
  });

  // stable sort by name for consistent UI
  merged.sort((a, b) => (a.name || '').toString().localeCompare((b.name || '').toString()));

  return merged;
}


// ---------------------------added methods---------------------------
async function listRoomsHandler() {
  const include = [{
    model: db.Account,
    attributes: ['firstName', 'lastName', 'accountId']
  }];

  return await db.Room.findAll({ include });
}



async function updateApparelUnitByRoomHandler(roomId, unitId, payload = {}, user = null) {
  if (!Number.isFinite(roomId) || !Number.isFinite(unitId)) {
    throw { status: 400, message: 'Invalid params' };
  }
  await ensureRoomExistsHandler(roomId);
  const unit = await db.Apparel.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'Apparel unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const updates = {};
  if (typeof payload.description !== 'undefined') updates.description = payload.description;
  if (typeof payload.status !== 'undefined') updates.status = payload.status;
  if (Object.keys(updates).length === 0) throw { status: 400, message: 'Nothing to update' };

  await unit.update(updates);
  return unit;
}

async function updateAdminSupplyUnitByRoomHandler(roomId, unitId, payload = {}, user = null) {
  if (!Number.isFinite(roomId) || !Number.isFinite(unitId)) {
    throw { status: 400, message: 'Invalid params' };
  }
  await ensureRoomExistsHandler(roomId);
  const unit = await db.AdminSupply.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'Admin Supply unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const updates = {};
  if (typeof payload.description !== 'undefined') updates.description = payload.description;
  if (typeof payload.status !== 'undefined') updates.status = payload.status;
  if (Object.keys(updates).length === 0) throw { status: 400, message: 'Nothing to update' };

  await unit.update(updates);
  return unit;
}

async function updateGenItemUnitByRoomHandler(roomId, unitId, payload = {}, user = null) {
  if (!Number.isFinite(roomId) || !Number.isFinite(unitId)) {
    throw { status: 400, message: 'Invalid params' };
  }
  await ensureRoomExistsHandler(roomId);
  const unit = await db.GenItem.findByPk(unitId);
  if (!unit) throw { status: 404, message: 'General Item unit not found' };
  if (String(unit.roomId) !== String(roomId)) throw { status: 403, message: 'Unit does not belong to this room' };

  const updates = {};
  if (typeof payload.description !== 'undefined') updates.description = payload.description;
  if (typeof payload.status !== 'undefined') updates.status = payload.status;
  if (Object.keys(updates).length === 0) throw { status: 400, message: 'Nothing to update' };

  await unit.update(updates);
  return unit;
}

async function getAllUnitsByRoomHandler(roomId) {
  await ensureRoomExistsHandler(roomId);

  const [apparelUnits, supplyUnits, genUnits] = await Promise.all([
    getApparelUnitsByRoomHandler(roomId).catch(() => []),
    getAdminSupplyUnitsByRoomHandler(roomId).catch(() => []),
    getGenItemUnitsByRoomHandler(roomId).catch(() => []),
  ]);

  const normalized = [];

  (apparelUnits || []).forEach(u => {
    const row = (typeof u.get === 'function') ? u.get() : u;
    normalized.push(Object.assign({ unitType: 'apparel', id: row.apparelId }, row));
  });

  (supplyUnits || []).forEach(u => {
    const row = (typeof u.get === 'function') ? u.get() : u;
    normalized.push(Object.assign({ unitType: 'supply', id: row.adminSupplyId }, row));
  });

  (genUnits || []).forEach(u => {
    const row = (typeof u.get === 'function') ? u.get() : u;
    normalized.push(Object.assign({ unitType: 'genitem', id: row.genItemId }, row));
  });

  return normalized;
}