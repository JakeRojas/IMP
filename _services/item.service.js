const db        = require('_helpers/db-handler');
const fs        = require('fs');
const path      = require('path');
const QRCode    = require('qrcode');

module.exports = {
  createItem,
  getItems,
  getItemById,
  assignItem,
  itemActivation,

  scanItem,
  updateItemStatus,
  updateTransaction,
  generateAndStoreQRCode,
  getFilteredItems
};

// Management Handler
async function createItem(body/* , file */) {
  const payload = {
    itemName:     body.itemName,
    itemCategory: body.itemCategory,
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
async function getItems() {
  return await db.Item.findAll({
    where: { 
        activateStatus: 'reactivated' 
    }
});
}
async function getItemById(id) {
  const items = await db.Apparel.findByPk(id);
  if (!items) {
      throw new Error('Invalid item ID');
  }
  return items;
}

// Status Handler
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
async function updateItemStatus(id, newStatus) {
  const [updated] = await db.Item.update(
    { itemStatus: newStatus },
    { where: { id } }
  );
  if (!updated) throw new Error('Status update failed');
}
async function updateTransaction(id, transactionType) {
  const [updated] = await db.Item.update(
    { transactionStatus: transactionType },
    { where: { id } }
  );
  if (!updated) throw new Error('Transaction update failed');
}

// Scan and Generate QR Handler
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
async function generateAndStoreQRCode(params) {
  const item = await db.Apparel.findByPk(params.id, {
    include: {
      model: db.Receive_Apparel,
      as: 'batch',
      attributes: [
        'id', 'apparelName', 
        'apparelSize', 'apparelLevel', 
        'apparelFor'
      ]
    }
  });

  if (!item || !item.batch) {
    throw new Error('Could not load associated Receive_Apparel');
  }
  const qrText = [
    item.id,
    item.receiveApparelId,
    item.batch.apparelName,
    item.batch.apparelSize,
    item.batch.apparelLevel,
    item.batch.apparelFor
  ].join('|');

  const pngBuffer = await QRCode.toBuffer(qrText, {
    errorCorrectionLevel: 'H',
    margin: 1,
    scale: 4
  });

  const safe = str => str.toString().replace(/[^a-z0-9]/gi, '_').toLowerCase();
  const filename = [
    'qr',
    `item${item.id}`,
    `batch${item.receiveApparelId}`,
    safe(item.batch.apparelName),
    safe(item.batch.apparelSize),
    safe(item.batch.apparelLevel),
    safe(item.batch.apparelFor)
  ].join('-') + '.png';

  const uploadsDir = path.resolve(__dirname, '../uploads/qrcodes');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const filePath = path.join(uploadsDir, filename);

  await fs.promises.writeFile(filePath, pngBuffer);

  await item.update({ qrCodePath: filename });

  return { pngBuffer, filename };
} 

// Other Handler
async function getFilteredItems({ itemCategory, itemStatus, activateStatus, transactionStatus }) {
  // build where-clause dynamically
  const where = {};
  if (itemCategory) where.itemCategory = itemCategory;
  if (itemStatus) where.itemStatus = itemStatus;
  if (typeof activateStatus !== 'undefined') {
    // query params are strings, so we convert 'true'/'false' → boolean
    where.activateStatus = activateStatus === 'true';
  }
  if (transactionStatus) where.transactionStatus = transactionStatus;

  // fetch from DB
  return await db.Item.findAll({ where });
}
async function assignItem({ params, itemId, roomId }) {
  const entry = await db.RoomInventory.create({
    addedAt: params.addedAt,
    roomStatus: params.roomStatus
  });
  return entry;
}