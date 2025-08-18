const db = require('_helpers/db-handler');
const { Sequelize, Transaction, Op, fn, col } = require('sequelize'); 
const apparelService = require('_services/apparel.service');
const supplyService = require('_services/adminSupply.service');

module.exports = {
  createRoomHandler,                  // create new room.
  receiveInStockroomHandler,          // recieve in stockroom and it will route to the specific recieve functions depends on its payload.
  receiveApparelInRoomHandler,        // receive apparel function with its payload.
  receiveAdminSupplyInRoomHandler,    // receive admin supply function and its payload.
  releaseApparelFromRoomHandler,      // release apparel handler
  //registerItem,
  //releaseApparelFromRoomHandler,
  ensureIsStockroomHandler,           // will check if the type of a room is stockroom or sub stockroom

  getRoomsHandler,                    // display all rooms.
  getRoomByIdHandler,                 // display a specific room.
  getReceiveApparelsByRoomHandler,
  getApparelUnitsByRoomHandler,
  getApparelInventoryByRoomHandler,
  // getUsersForDropdown,
  // getRoomItems,
  // getFilteredRooms,
  //getReceivedItemsByRoom,
  //getInventory,

  updateRoomHandler,                  // update a specific room.
  //updateInventoryStatus,
};

// Room's CRUD Handler
async function getRoomsHandler() {
  return await db.Room.findAll({
    include: [{
      model: db.Account,
      as: 'ownerss',
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

// Receaive Handler
async function ensureIsStockroomHandler(roomId) {
  const room = await db.Room.findByPk(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);
  const rt = (room.roomType || '').toString().toLowerCase();
  if (rt !== 'stockroom' && rt !== 'substockroom') {
    const err = new Error(`Room ${roomId} is not a stockroom/substockroom`);
    err.status = 400;
    throw err;
  }
  return room;
}
async function receiveInStockroomHandler(roomId, payload) {
  // ensure room is stockroom/substockroom
  await ensureIsStockroomHandler(roomId);

  // normalize numeric fields
  if (payload.apparelQuantity != null) payload.apparelQuantity = parseInt(payload.apparelQuantity, 10);
  if (payload.supplyQuantity != null) payload.supplyQuantity = parseInt(payload.supplyQuantity, 10);

  // apparel path
  if (payload.apparelName && Number.isInteger(payload.apparelQuantity) && payload.apparelQuantity > 0) {
    return await receiveApparelInRoomHandler(roomId, payload);
  }

  // admin supply path
  if (payload.supplyName && Number.isInteger(payload.supplyQuantity) && payload.supplyQuantity > 0) {
    return await receiveAdminSupplyInRoomHandler(roomId, payload);
  }

  const err = new Error('Bad payload: must include either apparelName+apparelQuantity or supplyName+supplyQuantity');
  err.status = 400;
  throw err;
}
async function receiveApparelInRoomHandler(roomId, payload) {
  // will throw if not stockroom
  await ensureIsStockroomHandler(roomId);

  // create batch
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

  // create per-unit apparel rows (Apparel table): one row per unit received
  // Only create if you keep per-unit tracking (Apparel model exists)
  if (db.Apparel) {
    const apparelUnits = Array(payload.apparelQuantity).fill().map(() => ({
      receiveApparelId: batch.receiveApparelId,
      roomId: roomId,
      status: 'in_stock'
      // optionally add itemId if you create Item rows
    }));
    await db.Apparel.bulkCreate(apparelUnits);
  }

  // update/create aggregate inventory (ApparelInventory)
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

  // return the batch (include apparel units if you like)
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

  if (db.AdminSupply) {
    const supplyUnits = Array(payload.supplyQuantity).fill().map(() => ({
      receiveAdminSupplyId: batch.receiveAdminSupplyId,
      status: 'in_stock'
      // optionally add itemId if you create Item rows
    }));
    await db.AdminSupply.bulkCreate(supplyUnits);
  }

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

  return db.ReceiveAdminSupply.findByPk(batch.id, {
    include: [{ model: db.AdminSupply, as: 'supply'}]
  });
}

// Release Handler
async function releaseApparelFromRoomHandler(roomId, payload) {
  // validate basic inputs
  if (!Number.isInteger(roomId)) throw new Error('Invalid room id');

  const { apparelInventoryId, releasedBy, claimedBy, releaseQuantity } = payload || {};

  if (!Number.isInteger(apparelInventoryId) || !releasedBy || !claimedBy || !Number.isInteger(releaseQuantity) || releaseQuantity <= 0) {
    const err = new Error('Invalid parameters. Required: apparelInventoryId (int), releasedBy (string), claimedBy (string), releaseQuantity (int > 0)');
    err.status = 400;
    throw err;
  }

  // ensure room is stockroom/substockroom
  await ensureIsStockroomHandler(roomId);

  // find aggregate inventory row
  const inv = await db.ApparelInventory.findByPk(apparelInventoryId);
  if (!inv) throw new Error(`ApparelInventory id=${apparelInventoryId} not found`);

  if (inv.roomId !== roomId) throw new Error(`ApparelInventory id=${apparelInventoryId} does not belong to room id=${roomId}`);

  // check enough quantity
  if ((inv.totalQuantity || 0) < releaseQuantity) {
    const err = new Error('Insufficient quantity in inventory');
    err.status = 400;
    throw err;
  }

  // create release record
  const release = await db.ReleaseApparel.create({
    apparelInventoryId,
    releasedBy,
    claimedBy,
    releaseQuantity
  });

  // decrement aggregate total
  inv.totalQuantity = inv.totalQuantity - releaseQuantity;
  await inv.save();

  // best-effort: update per-unit Apparel rows (mark status='released') up to releaseQuantity
  try {
    // find matching receive batches for this inventory (identify by apparel fields on inventory)
    const batches = await db.ReceiveApparel.findAll({
      where: {
        roomId: inv.roomId,
        apparelName: inv.apparelName,
        apparelLevel: inv.apparelLevel,
        apparelType: inv.apparelType,
        apparelFor: inv.apparelFor,
        apparelSize: inv.apparelSize
      },
      attributes: ['id'],
      order: [['receivedAt', 'ASC']] // oldest-first
    });

    const batchIds = batches.map(b => b.id);
    if (batchIds.length > 0) {
      const apparelUnits = await db.Apparel.findAll({
        where: {
          receiveApparelId: batchIds,
          status: 'in_stock'
        },
        limit: releaseQuantity
      });

      await Promise.all(apparelUnits.map(u => {
        u.status = 'released';
        return u.save();
      }));
    }
  } catch (err) {
    console.warn('Warning: per-unit apparel update during release failed:', err);
    // do not block the release itself
  }

  return db.ReleaseApparel.findByPk(release.id, {
    include: [{ model: db.ApparelInventory, as: 'inventory' }]
  });
}

// Get Apparels Handler
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







// Release & Receive Handler
// async function receiveInStockroomHandler(roomId, payload) {
//   // Always merge roomId so downstream handlers can consume it
//   payload.roomId = roomId;
//   if (payload.apparelQuantity != null) {
//     payload.apparelQuantity = parseInt(payload.apparelQuantity, 10);
//   }
//   if (payload.adminQuantity != null) {
//     payload.adminQuantity = parseInt(payload.adminQuantity, 10);
//   }

//   // Now detect by existence only
//   const isApparel = payload.apparelName  && payload.apparelQuantity  > 0;
//   const isSupply = payload.supplyName   && payload.adminQuantity    > 0;

//   if (!isApparel && !isSupply) {
//     const err = new Error(
//       'Bad payload: must include EITHER { apparelName (string), apparelQuantity (>0), … } ' +
//       'OR { supplyName (string), adminQuantity (>0), … }'
//     );
//     err.status = 400;
//     throw err;
//   }

//   // 1) Branch based on what you're receiving
//   // if (payload.stockroomType === 'apparel') {
//     if (payload.apparelName && Number.isInteger(payload.apparelQuantity)) {
//     // 1a) Create the receive-apparel batch (audit log)
//     const batch = await db.Receive_Apparel.create({
//       receivedFrom:  payload.receivedFrom,
//       receivedBy:    payload.receivedBy,
//       apparelName:   payload.apparelName,
//       apparelLevel:  payload.apparelLevel,
//       apparelType:   payload.apparelType,
//       apparelFor:    payload.apparelFor,
//       apparelSize:   payload.apparelSize,
//       apparelQuantity: payload.apparelQuantity,
//       // …any other fields you have…
//     });

//     // 1b) (Optional) If you have per-unit Item rows, create them here
//     // const items = await db.Item.bulkCreate(
//     //   Array(payload.apparelQuantity).fill({ /* ... */ }),
//     //   { returning: true }
//     // );
//     // await db.Apparel.bulkCreate( items.map(i => ({ receiveApparelId: batch.id, itemId: i.id })) );

//     // 2) Update (or create) the running total in ApparelInventory
//     const [inv] = await db.ApparelInventory.findOrCreate({
//       where: {
//         roomId:       payload.roomId,
//         apparelName:  payload.apparelName,
//         apparelLevel: payload.apparelLevel,
//         apparelType:  payload.apparelType,
//         apparelFor:   payload.apparelFor,
//         apparelSize:  payload.apparelSize,
//       },
//       defaults: { totalQuantity: 0 }
//     });
//     inv.totalQuantity += payload.apparelQuantity;
//     await inv.save();

//     // 3) Return whatever the controller expects (the new batch + details)
//     return db.Receive_Apparel.findByPk(batch.id, {
//       include: { model: db.Apparel, as: 'apparel', include: { model: db.Item, as: 'generalItem' } }
//     });
//   }


//   // if (payload.stockroomType === 'adminSupply') {
//     if (payload.supplyName && Number.isInteger(payload.adminQuantity)) {
//     // 1a) Create the receive-admin-supply batch
//     const batch = await db.Receive_Admin_Supply.create({
//       roomId:       payload.roomId,
//       supplyName:   payload.supplyName,
//       supplyMeasure:payload.supplyMeasure,
//       adminQuantity:payload.adminQuantity,
//       // …any other fields…
//     });

//     // 2) Update the running total in AdminInventory
//     const [inv] = await db.AdminInventory.findOrCreate({
//       where: {
//         roomId:       payload.roomId,
//         supplyName:   payload.supplyName,
//         supplyMeasure:payload.supplyMeasure,
//       },
//       defaults: { totalQuantity: 0 }
//     });
//     inv.totalQuantity += payload.adminQuantity;
//     await inv.save();

//     // 3) Return the created batch (or with includes, if you need)
//     return batch;
//   }

//   // 4) If neither, it’s an error
//   // throw new Error(`Unknown category "${payload.stockroomType}" in receiveInStockroomHandler`);
//   throw new Error(
//     `receiveInStockroomHandler: payload must include either:
//      • apparelName & apparelQuantity
//      • supplyName & adminQuantity`
//   );
// }
// async function releaseApparelFromRoomHandler(roomId, payload) {
//   // validate basic inputs
//   if (!Number.isInteger(roomId)) throw new Error('Invalid room id');
//   const { apparelInventoryId, releasedBy, claimedBy, releaseQuantity } = payload || {};

//   if (!Number.isInteger(apparelInventoryId) || !releasedBy || !claimedBy || !Number.isInteger(releaseQuantity) || releaseQuantity <= 0) {
//     throw new Error('Invalid parameters. Required: apparelInventoryId (int), releasedBy (string), claimedBy (string), releaseQuantity (int > 0)');
//   }

//   // 1) find the inventory record
//   const inv = await db.ApparelInventory.findByPk(apparelInventoryId);
//   if (!inv) throw new Error(`ApparelInventory id=${apparelInventoryId} not found`);

//   // 2) ensure the inventory belongs to the requested room
//   if (inv.roomId !== roomId) {
//     throw new Error(`ApparelInventory id=${apparelInventoryId} does not belong to room id=${roomId}`);
//   }

//   // 3) delegate the release logic to apparel service (keeps single place for release business logic)
//   //    Note: apparelService.releaseApparelHandler should perform stock checks, create ReleaseApparel row,
//   //    decrement ApparelInventory.totalQuantity, and best-effort update per-unit rows.
//   const releaseRecord = await apparelService.releaseApparelHandler({
//     apparelInventoryId,
//     releasedBy,
//     claimedBy,
//     releaseQuantity
//   });

//   // 4) return the created release record back to controller
//   return releaseRecord;
// }
// async function getReceivedItemsByRoom(roomId) {
//   const apparels = await db.Apparel.findAll({
//     include: [
//       {
//         model: db.Receive_Apparel,
//         as: 'batch',
//         where: { roomId },
//         attributes: []
//       },
//       {
//         model: db.Item,
//         as: 'generalItem',
//         attributes: ['id', 'receiveApparelId']
//       }
//     ],
//     order: [['createdAt', 'ASC']]
//   });

//   // Map into the shape your front-end expects
//   return apparels.map(a => ({
//     id:         a.generalItem.id,
//     name:       a.generalItem.receiveApparelId,
//     quantity:   1,
//     receivedAt: a.createdAt
//   }));
// }

// Inventory Handler
// async function getInventory(roomId) {
//   const apparelField = db.Receive_Apparel.rawAttributes.id.field; 
//   // ensure room exists
//   const room = await db.Room.findByPk(roomId);
//   if (!room) throw new Error(`Room ${roomId} not found`);

//   let rows;
//   switch (room.stockroomType) {
//     case 'apparel':
//       rows = await db.Receive_Apparel.findAll({
//         where: { roomId },
//         attributes: [
//           apparelField,
//           [fn('COUNT', col(apparelField)), 'apparelQuantity']
//         ],
//         group: [apparelField]
//       });
//       return rows.map(r => ({
//         itemId:   r.apparelField,
//         quantity: parseInt(r.get('apparelField'), 10)
//       }));

//     case 'admin_supply':
//       rows = await db.Receive_Admin_Supply.findAll({
//         where: { roomId },
//         attributes: [
//           'supplyId',
//           [fn('COUNT', col('supplyId')), 'quantity']
//         ],
//         group: ['supplyId']
//       });
//       return rows.map(r => ({
//         itemId:   r.supplyId,
//         quantity: parseInt(r.get('quantity'), 10)
//       }));

//     // add other stockroomType cases here…

//     default:
//       throw new Error(`Inventory not supported for stockroomType="${room.stockroomType}"`);
//   }
// }

// // Other Handler
// async function getUsersForDropdown() {
//   return db.Account.findAll({
//     attributes: ['id', 'firstName', 'lastName']
//   });
// }
// async function registerItem(roomId, itemId) {
//   const room = await db.Room.findByPk(roomId);
//   const item = await db.Item.findByPk(itemId);
//   if (!room || !item) throw 'Invalid room or item';
//   return db.RoomInventory.create({ roomId, itemId });
// }
// async function getRoomItems(roomId, params) {
//   const inventories = await db.RoomInventory.findAll({
//     where: { roomId },
//     include: [{ model: db.Item, as: 'Item', attributes: ['id', 'itemName', 'itemQrCode']}]
//   });
//   return inventories.map(inv => inv.Item);
// }
// async function updateInventoryStatus(roomId, itemQrCode, newStatus) {
//   const entry = await db.RoomInventory.findOne({
//     where: { roomId },
//     include: [{
//       model: db.Item,
//       as: 'Item',
//       where: { itemQrCode }
//     }]
//   });

//   if (!entry) {
//     throw new Error(`Item with QR "${itemQrCode}" not found in room ${roomId}`);
//   }

//   entry.newStatus = newStatus;
//   await entry.save();

//   return db.RoomInventory.findByPk(entry.id, {
//     include: [{ model: db.Item, as: 'Item' }]
//   });
// }
// async function getFilteredRooms({ params }) {
//   const where = {};
//   if (params.roomType) where.roomType = params.roomType;

//   return await db.Room.findAll({ where });
// }

