const db = require('_helpers/db-handler');
const { Sequelize, Transaction, Op, fn, col } = require('sequelize'); 
const { receiveApparelHandler, releaseApparelHandler } = require('_services/apparel.service');
const { receiveAdminSupplyHandler, } = require('_services/adminSupply.service');

module.exports = {
  receiveInStockroom,
  createRoom,
  registerItem,

  getRooms,
  getRoomById,
  getUsersForDropdown,
  getRoomItems,
  getFilteredRooms,
  getReceivedItemsByRoom,
  getInventory,

  updateInventoryStatus,
};



//Map each room.stockroomType to its handler function
const handlerMap = {
  apparel:     receiveApparelHandler,
  supply:      receiveAdminSupplyHandler,
};

async function receiveInStockroom(roomId, payload) {
  // Always merge roomId so downstream handlers can consume it
  payload.roomId = roomId;
  if (payload.apparelQuantity != null) {
    payload.apparelQuantity = parseInt(payload.apparelQuantity, 10);
  }
  if (payload.adminQuantity != null) {
    payload.adminQuantity = parseInt(payload.adminQuantity, 10);
  }

  // Now detect by existence only
  const isApparel = payload.apparelName  && payload.apparelQuantity  > 0;
  const isSupply = payload.supplyName   && payload.adminQuantity    > 0;

  if (!isApparel && !isSupply) {
    const err = new Error(
      'Bad payload: must include EITHER { apparelName (string), apparelQuantity (>0), … } ' +
      'OR { supplyName (string), adminQuantity (>0), … }'
    );
    err.status = 400;
    throw err;
  }

  // 1) Branch based on what you're receiving
  // if (payload.stockroomType === 'apparel') {
    if (payload.apparelName && Number.isInteger(payload.apparelQuantity)) {
    // 1a) Create the receive-apparel batch (audit log)
    const batch = await db.Receive_Apparel.create({
      receivedFrom:  payload.receivedFrom,
      receivedBy:    payload.receivedBy,
      apparelName:   payload.apparelName,
      apparelLevel:  payload.apparelLevel,
      apparelType:   payload.apparelType,
      apparelFor:    payload.apparelFor,
      apparelSize:   payload.apparelSize,
      apparelQuantity: payload.apparelQuantity,
      // …any other fields you have…
    });

    // 1b) (Optional) If you have per-unit Item rows, create them here
    // const items = await db.Item.bulkCreate(
    //   Array(payload.apparelQuantity).fill({ /* ... */ }),
    //   { returning: true }
    // );
    // await db.Apparel.bulkCreate( items.map(i => ({ receiveApparelId: batch.id, itemId: i.id })) );

    // 2) Update (or create) the running total in ApparelInventory
    const [inv] = await db.ApparelInventory.findOrCreate({
      where: {
        roomId:       payload.roomId,
        apparelName:  payload.apparelName,
        apparelLevel: payload.apparelLevel,
        apparelType:  payload.apparelType,
        apparelFor:   payload.apparelFor,
        apparelSize:  payload.apparelSize,
      },
      defaults: { totalQuantity: 0 }
    });
    inv.totalQuantity += payload.apparelQuantity;
    await inv.save();

    // 3) Return whatever the controller expects (the new batch + details)
    return db.Receive_Apparel.findByPk(batch.id, {
      include: { model: db.Apparel, as: 'apparel', include: { model: db.Item, as: 'generalItem' } }
    });
  }


  // if (payload.stockroomType === 'adminSupply') {
    if (payload.supplyName && Number.isInteger(payload.adminQuantity)) {
    // 1a) Create the receive-admin-supply batch
    const batch = await db.Receive_Admin_Supply.create({
      roomId:       payload.roomId,
      supplyName:   payload.supplyName,
      supplyMeasure:payload.supplyMeasure,
      adminQuantity:payload.adminQuantity,
      // …any other fields…
    });

    // 2) Update the running total in AdminInventory
    const [inv] = await db.AdminInventory.findOrCreate({
      where: {
        roomId:       payload.roomId,
        supplyName:   payload.supplyName,
        supplyMeasure:payload.supplyMeasure,
      },
      defaults: { totalQuantity: 0 }
    });
    inv.totalQuantity += payload.adminQuantity;
    await inv.save();

    // 3) Return the created batch (or with includes, if you need)
    return batch;
  }

  // 4) If neither, it’s an error
  // throw new Error(`Unknown category "${payload.stockroomType}" in receiveInStockroom`);
  throw new Error(
    `receiveInStockroom: payload must include either:
     • apparelName & apparelQuantity
     • supplyName & adminQuantity`
  );
}

// --- NEW ---
async function getInventory(roomId) {
  const apparelField = db.Receive_Apparel.rawAttributes.id.field; 
  // ensure room exists
  const room = await db.Room.findByPk(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);

  let rows;
  switch (room.stockroomType) {
    case 'apparel':
      rows = await db.Receive_Apparel.findAll({
        where: { roomId },
        attributes: [
          apparelField,
          [fn('COUNT', col(apparelField)), 'apparelQuantity']
        ],
        group: [apparelField]
      });
      return rows.map(r => ({
        itemId:   r.apparelField,
        quantity: parseInt(r.get('apparelField'), 10)
      }));

    case 'admin_supply':
      rows = await db.Receive_Admin_Supply.findAll({
        where: { roomId },
        attributes: [
          'supplyId',
          [fn('COUNT', col('supplyId')), 'quantity']
        ],
        group: ['supplyId']
      });
      return rows.map(r => ({
        itemId:   r.supplyId,
        quantity: parseInt(r.get('quantity'), 10)
      }));

    // add other stockroomType cases here…

    default:
      throw new Error(`Inventory not supported for stockroomType="${room.stockroomType}"`);
  }
}
async function getReceivedItemsByRoom(roomId) {
  const apparels = await db.Apparel.findAll({
    include: [
      {
        model: db.Receive_Apparel,
        as: 'batch',
        where: { roomId },
        attributes: []
      },
      {
        model: db.Item,
        as: 'generalItem',
        attributes: ['id', 'receiveApparelId']
      }
    ],
    order: [['createdAt', 'ASC']]
  });

  // Map into the shape your front-end expects
  return apparels.map(a => ({
    id:         a.generalItem.id,
    name:       a.generalItem.receiveApparelId,
    quantity:   1,
    receivedAt: a.createdAt
  }));
}

async function getRooms() {
  return await db.Room.findAll({
    include: [{
      model: db.Account,
      as: 'ownerss',
      attributes: ['firstName', 'lastName']
    }]
  });
}
async function createRoom(params) {
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
async function getRoomById(id) {
  const rooms = await db.Room.findByPk(id);
  if (!rooms) {
      throw new Error('Invalid room ID');
  }
  return rooms;
}

// Other Handler
async function getUsersForDropdown() {
  return db.Account.findAll({
    attributes: ['id', 'firstName', 'lastName']
  });
}
async function registerItem(roomId, itemId) {
  const room = await db.Room.findByPk(roomId);
  const item = await db.Item.findByPk(itemId);
  if (!room || !item) throw 'Invalid room or item';
  return db.RoomInventory.create({ roomId, itemId });
}
async function getRoomItems(roomId, params) {
  const inventories = await db.RoomInventory.findAll({
    where: { roomId },
    include: [{ model: db.Item, as: 'Item', attributes: ['id', 'itemName', 'itemQrCode']}]
  });
  return inventories.map(inv => inv.Item);
}
async function updateInventoryStatus(roomId, itemQrCode, newStatus) {
  const entry = await db.RoomInventory.findOne({
    where: { roomId },
    include: [{
      model: db.Item,
      as: 'Item',
      where: { itemQrCode }
    }]
  });

  if (!entry) {
    throw new Error(`Item with QR "${itemQrCode}" not found in room ${roomId}`);
  }

  entry.newStatus = newStatus;
  await entry.save();

  return db.RoomInventory.findByPk(entry.id, {
    include: [{ model: db.Item, as: 'Item' }]
  });
}
async function getFilteredRooms({ params }) {
  const where = {};
  if (params.roomType) where.roomType = params.roomType;

  return await db.Room.findAll({ where });
}