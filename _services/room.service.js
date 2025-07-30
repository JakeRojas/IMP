const db = require('_helpers/db-handler');

module.exports = {
  receiveInStockroom,
  createRoom,
  getRooms,
  getRoomById,
  getUsersForDropdown,
  registerItem,
  getRoomItems,
  updateInventoryStatus,
  getFilteredRooms
};

async function receiveInStockroom(roomId, params) {
  const room = await getRoomById(roomId);
  // assume room.type holds the key you passed to register(), e.g. "apparel"
  const handler = getHandler(room.stockroomType);
  if (!handler) {
    throw new Error(`No receive-handler for stockroom type "${room.stockroomType}"`);
  }
  // delegate to the proper service
  return handler(params);
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