const db                = require('_helpers/db-handler');
const { register }      = require('_helpers/registry');

module.exports = {
  receiveApparelHandler,

  getReceivedApparelHandler,
  getReceivedApparelByIdHandler,

  updateReceivedApparelHandler
};

// Receive Apparel Handler
async function receiveApparelHandler(params) {
  // 1) Create the batch record
  const batch = await db.ReceiveApparel.create(params);

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

  // 2) Update aggregate inventory
  const [inv] = await db.ApparelInventory.findOrCreate({
    where: {
      roomId:      params.roomId,
      apparelName: params.apparelName,
      apparelLevel: params.apparelLevel,
      apparelType:  params.apparelType,
      apparelFor:   params.apparelFor,
      apparelSize:  params.apparelSize
    },
    defaults: {
      totalQuantity: 0
    }
  });
  // increment
  inv.totalQuantity += params.apparelQuantity;
  await inv.save();

  // 4) Return the batch, now including the per‐unit apparel details
  return db.ReceiveApparel.findByPk(batch.id, {
    include: { 
      model: db.Apparel, 
      as: 'apparel',
      include: { model: db.Item, as: 'generalItem' }
    }
  });
} register('apparel', receiveApparelHandler);

async function getReceivedApparelHandler() {
  return apparel = await db.ReceiveApparel.findAll();
}
async function getReceivedApparelByIdHandler(id) {
  const apparel = await db.ReceiveApparel.findByPk(id)

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