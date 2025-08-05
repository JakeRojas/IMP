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
    const batch = await db.Receive_Apparel.create(params);

    const units = Array(params.apparelQuantity)
    .fill(null)
    .map(() => ({
      receiveApparelId: batch.id
    }))

    await db.Apparel.bulkCreate(units);
    await db.Item.bulkCreate(units);

    return db.Receive_Apparel.findByPk(batch.id, {
      include: { 
        model: db.Apparel, 
        as: 'apparel',
        model: db.Item, 
        as: 'generalItem',
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