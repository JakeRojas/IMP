const db = require('_helpers/db-handler');

module.exports = {
  createItem,
  getItems,
  getItemById,
  assignItem,
  itemActivation,

  scanItem,
  updateItemStatus,
  updateTransaction
};

async function getItems() {
  return await db.Item.findAll({
    where: { 
        activateStatus: 'reactivated' 
    }
});
}
async function createItem(body, file) {
const filename = file?.filename;
const payload = {
  itemName:     body.itemName,
  itemCategory: body.itemCategory,
  itemQrCode:   file
    ? `/uploads/${filename}`
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
  const entry = await db.RoomInventory.create({
    addedAt: params.addedAt,
    roomStatus: params.roomStatus
  });
  return entry;
}
async function itemActivation(id) {
  const item = await getItemById(id);
  if (!item) throw new Error('Item not found');

  if (item.itemStatus === 'reactivated') {
    item.itemStatus = 'deactivated';
  }
  else if (item.itemStatus === 'deactivated') {
    item.itemStatus = 'reactivated';
  }
  else {
    throw new Error(`Unexpected status: ${item.itemStatus}`);
  }

  await item.save();
  return item.itemStatus;
}

async function scanItem(itemQrCode) {
  const record = await db.Item.findOne({
    where: { itemQrCode },
    attributes: ['id','itemName','itemQrCode','itemStatus']
  });

  if (!record) {
    throw new Error(`QR code "${itemQrCode}" not found.`);
  }

  return record;
}
async function updateItemStatus(id, newStatus) {
  const [updated] = await db.Item.update(
    { itemStatus: newStatus },
    { where: { id } }
  );
  if (!updated) throw new Error('Status update failed');
}

// Update the transactionStatus field
async function updateTransaction(id, transactionType) {
  const [updated] = await db.Item.update(
    { transactionStatus: transactionType },
    { where: { id } }
  );
  if (!updated) throw new Error('Transaction update failed');
}