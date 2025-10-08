// _services/transfer.service.js
const db = require('_helpers/db-handler');
const { Transaction }     = require('sequelize');

module.exports = {
  createTransfer,
  acceptTransfer,
  returnTransfer,
  acceptReturned,
  getById,
  listTransfers
};

async function createTransfer({ fromRoomId, toRoomId, createdBy, itemType, itemId = null, quantity = 1, note = null }) {
  if (!fromRoomId || !toRoomId || !createdBy) throw { status: 400, message: 'Missing required fields' };
  if (!['apparel','supply','genItem'].includes(itemType)) throw { status: 400, message: 'invalid itemType' };
  quantity = parseInt(quantity, 10);
  if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be positive' };

  const transfer = await db.Transfer.create({
    fromRoomId, toRoomId, createdBy, itemType, itemId, quantity, note, status: 'in_transfer'
  });

  return transfer;
}
async function acceptTransfer(transferId, accepterId) {
  const transfer = await db.Transfer.findByPk(transferId);
  await transfer.update({ status: 'transfer_accepted', acceptedBy: accepterId });

  return transfer;
}
async function returnTransfer(transferId, returnerAccountId) {
  const tr = await db.Transfer.findByPk(transferId);
  if (!tr) throw { status: 404, message: 'Transfer not found' };
  if (tr.status !== 'transfer_accepted') throw { status: 400, message: 'Only accepted transfers can be returned' };

  tr.status = 'returning';
  tr.returningBy = returnerAccountId || null;
  tr.returnedAt = null;
  await tr.save();
  return tr;
}
async function acceptReturned(transferId, accepterId) {
  const transfer = await db.Transfer.findByPk(transferId);
  await transfer.update({ status: 'return_accepted', acceptedBy: accepterId });

  return transfer;
}
function inventoryModelFor(itemType) {
  if (itemType === 'apparel') return db.ApparelInventory;
  if (itemType === 'supply') return db.AdminSupplyInventory;
  if (itemType === 'genItem') return db.GenItemInventory;
  return null;
}
async function findOrCreateMatchingInventory(model, exampleInv, roomId, opts = {}) {
  const transaction = opts.transaction;
  // apparel
  if (model === db.ApparelInventory) {
    const where = {
      roomId,
      apparelName: exampleInv.apparelName,
      apparelLevel: exampleInv.apparelLevel,
      apparelType: exampleInv.apparelType,
      apparelFor: exampleInv.apparelFor,
      apparelSize: exampleInv.apparelSize
    };
    const [inv] = await db.ApparelInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction });
    return inv;
  }
  // admin supply
  if (model === db.AdminSupplyInventory) {
    const where = { roomId, supplyName: exampleInv.supplyName, supplyMeasure: exampleInv.supplyMeasure };
    const [inv] = await db.AdminSupplyInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction });
    return inv;
  }
  // gen item
  if (model === db.GenItemInventory) {
    const where = { roomId, genItemName: exampleInv.genItemName, genItemType: exampleInv.genItemType, genItemSize: exampleInv.genItemSize };
    const [inv] = await db.GenItemInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction });
    return inv;
  }

  // fallback: try primary key copy
  const [fallback] = await model.findOrCreate({ where: { roomId }, defaults: { totalQuantity: 0, roomId }, transaction });
  return fallback;
}

/* small helpers to fetch transfers */
async function getById(id) {
  return db.Transfer.findByPk(id);
}
async function listTransfers({ where = {}, limit = 200, offset = 0 } = {}) {
  return db.Transfer.findAll({ where, order: [['transferId','DESC']], limit, offset });
}
