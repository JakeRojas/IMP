const db                = require('_helpers/db-handler');
const { register }      = require('_helpers/registry');

module.exports = {
  receiveApparelHandler,
  releaseApparelHandler,

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
} /* register('apparel', receiveApparelHandler); */
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
async function releaseApparelHandler(params) {
  // defensive input check
  const {
    apparelInventoryId,
    releasedBy,
    claimedBy,
    releaseQuantity
  } = params || {};

  if (!Number.isInteger(apparelInventoryId) || !releasedBy || !claimedBy || !Number.isInteger(releaseQuantity) || releaseQuantity <= 0) {
    throw new Error('Invalid parameters. Required: apparelInventoryId (int), releasedBy (string), claimedBy (string), releaseQuantity (int > 0)');
  }

  // 1) find the aggregate inventory row
  const inv = await db.ApparelInventory.findByPk(apparelInventoryId);
  if (!inv) throw new Error(`ApparelInventory id=${apparelInventoryId} not found`);

  // 2) check stock levels
  if (inv.totalQuantity < releaseQuantity) {
    throw new Error(`Insufficient quantity. Current totalQuantity=${inv.totalQuantity}`);
  }

  // 3) create release audit record
  const release = await db.ReleaseApparel.create({
    apparelInventoryId,
    releasedBy,
    claimedBy,
    releaseQuantity
  });

  // 4) decrement aggregate inventory
  inv.totalQuantity = inv.totalQuantity - releaseQuantity;
  await inv.save();

  // 5) Best-effort: update per-unit Apparel rows to reflect release
  // Approach:
  //  - find ReceiveApparel batches that belong to the same room and match the apparel attributes from inventory
  //  - find Apparel units belonging to those batches with status 'in_stock'
  //  - update up to `releaseQuantity` units to status 'released'
  try {
    // find matching receive batches (same room + identifying apparel fields)
    const batches = await db.ReceiveApparel.findAll({
      where: {
        roomId: inv.roomId,
        apparelName: inv.apparelName,
        apparelLevel: inv.apparelLevel,
        apparelType: inv.apparelType,
        apparelFor: inv.apparelFor,
        apparelSize: inv.apparelSize
      },
      attributes: ['id']
    });

    const batchIds = batches.map(b => b.id);
    if (batchIds.length > 0) {
      // pick per-unit apparel rows to mark as released
      const apparelUnits = await db.Apparel.findAll({
        where: {
          receiveApparelId: batchIds,
          status: 'in_stock'   // only release ones that are currently in stock
        },
        limit: releaseQuantity
      });

      // update their status
      await Promise.all(apparelUnits.map(u => {
        u.status = 'released';
        return u.save();
      }));
    }
  } catch (err) {
    // don't block the release record if the per-unit update fails,
    // but surface a console warning so you can investigate
    console.warn('Warning: per-unit apparel update during release failed:', err);
  }

  // 6) return the created release (include inventory info)
  return db.ReleaseApparel.findByPk(release.id, {
    include: [{ model: db.ApparelInventory, as: 'inventory' }]
  });
}