const db = require('_helpers/db-handler');

module.exports = {
  createItem,
  getItems,
  getItemById,
  assignItem
};

async function getItems() {
  return await db.Item.findAll()
}
async function createItem(body, file) {
const payload = {
  itemName:     body.itemName,
  itemCategory: body.itemCategory,
  itemQrCode:   file 
    ? `/uploads/${file.filename}`
    : body.itemQrCode,
};
const item = await db.Item.create(payload);
if (body.roomId) {
  await db.RoomInventory.create({
    roomId: parseInt(body.roomId, 10),
    itemId: item.id
  });
}
return item;
}
async function getItemById(id) {
  const items = await db.Item.findByPk(id);
  if (!items) {
      throw new Error('Invalid item ID');
  }
  return items;
}
async function assignItem({ params, itemId, roomId }) {
  // create link table entry; assume model RoomInventory
  const entry = await db.RoomInventory.create({
    // itemId,
    // roomId,
    addedAt: /* new Date(),  */params.addedAt,
    roomStatus: params.roomStatus
  });
  return entry;
}
