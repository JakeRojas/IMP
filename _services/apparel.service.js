// const db  = require('_helpers/db-handler');

// module.exports = {
//   receiveApparelHandler,
//   releaseApparelHandler,

//   updateApparelUnitStatusHandler,

//   releaseUnitById
//   };

// async function receiveApparelHandler(payload) {
//   // payload must include roomId, apparelName, apparelQuantity, apparelLevel, apparelType, apparelFor, apparelSize, receivedFrom, receivedBy
//   const batch = await db.ReceiveApparel.create({
//     roomId: payload.roomId,
//     receivedFrom: payload.receivedFrom,
//     receivedBy: payload.receivedBy,
//     apparelName: payload.apparelName,
//     apparelLevel: payload.apparelLevel,
//     apparelType: payload.apparelType,
//     apparelFor: payload.apparelFor,
//     apparelSize: payload.apparelSize,
//     apparelQuantity: payload.apparelQuantity
//   });

//   // create per-unit Apparel rows
//   if (db.Apparel) {
//     const units = Array(payload.apparelQuantity).fill().map(() => ({
//       receiveApparelId: batch.id,
//       status: 'in_stock'
//     }));
//     await db.Apparel.bulkCreate(units);
//   }

//   // update aggregate inventory
//   const [inv] = await db.ApparelInventory.findOrCreate({
//     where: {
//       roomId: payload.roomId,
//       apparelName: payload.apparelName,
//       apparelLevel: payload.apparelLevel,
//       apparelType: payload.apparelType,
//       apparelFor: payload.apparelFor,
//       apparelSize: payload.apparelSize
//     },
//     defaults: { totalQuantity: 0 }
//   });

//   inv.totalQuantity = (inv.totalQuantity || 0) + payload.apparelQuantity;
//   await inv.save();

//   return batch;
// }
// async function releaseApparelHandler({ apparelInventoryId, releaseQuantity, releasedBy, claimedBy }) {
//   const inv = await db.ApparelInventory.findByPk(apparelInventoryId);
//   if (!inv) throw new Error('ApparelInventory not found');

//   if ((inv.totalQuantity || 0) < releaseQuantity) {
//     const err = new Error('Insufficient quantity');
//     err.status = 400;
//     throw err;
//   }

//   const release = await db.ReleaseApparel.create({
//     apparelInventoryId,
//     releasedBy,
//     claimedBy,
//     releaseQuantity
//   });

//   inv.totalQuantity = inv.totalQuantity - releaseQuantity;
//   await inv.save();

//   // best-effort mark Apparel units as released
//   try {
//     const batches = await db.ReceiveApparel.findAll({
//       where: {
//         roomId: inv.roomId,
//         apparelName: inv.apparelName,
//         apparelLevel: inv.apparelLevel,
//         apparelType: inv.apparelType,
//         apparelFor: inv.apparelFor,
//         apparelSize: inv.apparelSize
//       },
//       attributes: ['id'],
//       order: [['receivedAt', 'ASC']]
//     });

//     const batchIds = batches.map(b => b.id);
//     const units = await db.Apparel.findAll({
//       where: { receiveApparelId: batchIds, status: 'in_stock' },
//       limit: releaseQuantity
//     });

//     await Promise.all(units.map(u => { u.status = 'released'; return u.save(); }));
//   } catch (err) {
//     console.warn('Warning: per-unit update failed', err);
//   }

//   return release;
// }

// async function releaseUnitById(unitId, { actorId } = {}) {
//   const db = require('_helpers/db-handler');

//   const unit = await db.Apparel.findByPk(unitId);
//   if (!unit) {
//     const err = new Error('Unit not found');
//     err.status = 404;
//     throw err;
//   }

//   if (unit.status !== 'in_stock') {
//     const err = new Error('Unit is not in stock or already released');
//     err.status = 400;
//     throw err;
//   }

//   // find matching inventory row for this unit (aggregate)
//   const inv = await db.ApparelInventory.findOne({
//     where: {
//       roomId: unit.roomId,
//       apparelName: unit.apparelName,
//       apparelLevel: unit.apparelLevel,
//       apparelType: unit.apparelType,
//       apparelFor: unit.apparelFor,
//       apparelSize: unit.apparelSize
//     }
//   });

//   // decrement aggregate if found
//   if (inv) {
//     if ((inv.totalQuantity || 0) < 1) {
//       const err = new Error('Insufficient quantity in inventory');
//       err.status = 400;
//       throw err;
//     }
//     inv.totalQuantity = (inv.totalQuantity || 0) - 1;
//     await inv.save();

//     // create a ReleaseApparel row (optional but consistent with batch flow)
//     await db.ReleaseApparel.create({
//       roomId: unit.roomId,
//       apparelInventoryId: inv.apparelInventoryId || inv.id,
//       releasedBy: actorId ? String(actorId) : 'QR-Release',
//       claimedBy: '', // can be empty for QR unit release
//       releaseApparelQuantity: 1,
//       notes: `Released via unit QR (unitId=${unitId})`
//     });
//   }

//   // mark unit
//   unit.status = 'released';
//   await unit.save();

//   return { ok: true, unitId, inventoryUpdated: !!inv };
// }

// async function updateApparelUnitStatusHandler(apparelId, apparelStatus) {
//   const unit = await db.Apparel.findByPk(apparelId);
//   if (!unit) throw { status: 404, message: `Apparel unit ${apparelId} not found` };

//   unit.status = apparelStatus;
//   await unit.save();

//   // Optionally eager-load related batch or inventory:
//   return unit;
// }