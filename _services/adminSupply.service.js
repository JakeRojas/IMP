const db  = require('_helpers/db-handler');

module.exports = {
    receiveAdminSupplyHandler,
    releaseSupplyHandler,

    getReceivedSupplyHandler,
    getReleasedSupplyHandler,
    getReceivedSupplyByIdHandler,

    updateReceivedSupplyHandler
};

// Receive Admin Supply Handler
async function receiveAdminSupplyHandler(params) {
    const batch = await db.Receive_Admin_Supply.create(params);

    const units = Array(params.supplyQuantity)
    .fill(null)
    .map(() => ({
      receiveAdminSupplyId: batch.id
    }))

    await db.Admin_Supply.bulkCreate(units);

    return db.Receive_Admin_Supply.findByPk(batch.id, {
      include: { 
        model: db.Admin_Supply, 
        as: 'supplies'
      }
    });
}
async function getReceivedSupplyHandler() {
  return supplies = await db.Receive_Admin_Supply.findAll();
}
async function getReceivedSupplyByIdHandler(id) {
  const supplies = await db.Receive_Admin_Supply.findByPk(id)

  if (!supplies) {
    throw new Error('Invalid supplies ID');
  }

  return supplies;
}
async function updateReceivedSupplyHandler(id, params) {
  const supplies = await getReceivedSupplyByIdHandler(id);
  if (!supplies) 
    throw 'Product not found';
  
  Object.assign(supplies, params);
  return await supplies.save();
}

// Release Admin Supply Handler
async function releaseSupplyHandler(params) {
  const supplies = await new db.Receive_Admin_Supply(params);

  await supplies.save();
  
  return supplies;
}
async function getReleasedSupplyHandler() {
  const release = await db.Receive_Admin_Supply.findAll();

  return release;
}