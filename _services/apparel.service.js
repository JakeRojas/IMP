const db                = require('_helpers/db-handler');
const { register }      = require('_helpers/registry');

module.exports = {
  receiveApparelHandler,
  releaseApparelHandler,

  getReceivedApparelHandler,
  getReleasedApparelHandler,
  getReceivedApparelByIdHandler,

  updateReceivedApparelHandler
};

// Receive Apparel Handler
async function receiveApparelHandler(params) {
  // 1) Create the batch record
  const batch = await db.Receive_Apparel.create(params);

  // 2) For each quantity, create an Item row
  const itemRows = Array.from({ length: params.apparelQuantity }, () => ({
    receiveApparelId: batch.id
  }));
  const items = await db.Item.bulkCreate(itemRows, { returning: true });

  // 3) For each Item, create an Apparel row pointing back to that Item
  const apparelRows = items.map(item => ({
    receiveApparelId: batch.id,
    itemId: item.id
  }));
  await db.Apparel.bulkCreate(apparelRows);

  // 4) Return the batch, now including the per‐unit apparel details
  return db.Receive_Apparel.findByPk(batch.id, {
    include: { 
      model: db.Apparel, 
      as: 'apparel',
      include: { model: db.Item, as: 'generalItem' }
    }
  });
} register('apparel', receiveApparelHandler);
async function getReceivedApparelHandler() {
  return apparel = await db.Receive_Apparel.findAll();
}
async function getReceivedApparelByIdHandler(id) {
  const apparel = await db.Receive_Apparel.findByPk(id)

  if (!apparel) {
    throw new Error('Invalid apparel ID');
  }

  return apparel;
}
async function updateReceivedApparelHandler(id, params) {
  const apparel = await getReceivedApparelByIdHandler(id);
  if (!apparel) 
    throw 'Product not found';
  
  Object.assign(apparel, params);
  return await apparel.save();
}

// Release Apparel Handler
async function releaseApparelHandler(params) {
  const apparel = await new db.Release_Apparel(params);

  await apparel.save();
  
  return apparel;
}
async function getReleasedApparelHandler() {
  const release = await db.Release_Apparel.findAll({
    include: {
      model: db.Recieve_Apparel,
      attributes: ['apparelType']
    }
  });

  return release;
}