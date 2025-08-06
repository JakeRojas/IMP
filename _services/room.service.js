const db = require('_helpers/db-handler');
const { receiveApparelHandler } = require('_services/apparel.service');
const { receiveAdminSupplyHandler, } = require('_services/adminSupply.service');

module.exports = {
  receiveInStockroom,
  createRoom,
  getRooms,
  getRoomById,
  getUsersForDropdown,
  registerItem,
  getRoomItems,
  updateInventoryStatus,
  getFilteredRooms,
  getReceivedItemsByRoom
};



//Map each room.stockroomType to its handler function
const handlerMap = {
  apparel:     receiveApparelHandler,
  supply:      receiveAdminSupplyHandler,
};

async function receiveInStockroom(roomId, params) {
  // 1) Load the room so we know its stockroomType
  const room = await getRoomById(roomId);
  if (!room) throw new Error(`Room ${roomId} not found`);

  // 2) Pick the handler from our map
  const handler = handlerMap[room.stockroomType];
  if (!handler) {
    throw new Error(`No receive-handler for stockroomType="${room.stockroomType}"`);
  }

  // 3) Run the handler to create your batchResult
  const batchResult = await handler(params);
  console.log('🔍 batchResult:', batchResult);

  // 4) Figure out which property holds the created units
  const keyMap = {
    apparel:     'apparel',
    supply:      'supplies',
    it:          'its',
    maintenance: 'maintenances',
  };
  const prop  = keyMap[room.stockroomType] || '';
  const units = Array.isArray(batchResult[prop]) ? batchResult[prop] : [];
  console.log(`🔍 units for "${room.stockroomType}":`, units);

  return batchResult;
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