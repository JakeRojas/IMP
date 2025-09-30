// _services/itemRequest.service.js
const db = require('_helpers/db-handler');
const apparelService = require('_services/apparel.service');
const adminSupplyService = require('_services/adminSupply.service');
const Role = require('_helpers/role');

module.exports = {
  createItemRequest,
  listItemRequests,
  getItemRequestById,
  acceptItemRequest,
  declineItemRequest,
  releaseItemRequest,
  fulfillItemRequest
};

async function createItemRequest({ accountId, requesterRoomId = null, itemId = null, itemType = 'apparel', quantity = 1, note = null }) {
  if (!accountId) throw { status: 400, message: 'accountId required' };
  if (!['apparel','supply','genItem'].includes(itemType)) throw { status: 400, message: 'invalid itemType' };
  if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be positive' };

  const req = await db.ItemRequest.create({
    accountId, requesterRoomId, itemId, itemType, quantity, note, status: 'pending'
  });

  return req;
}

async function listItemRequests({ where = {}, limit = 100, offset = 0 } = {}) {
  return await db.ItemRequest.findAll({ where, order: [['itemRequestId','DESC']], limit, offset });
}

async function getItemRequestById(id) {
  const r = await db.ItemRequest.findByPk(id);
  if (!r) throw { status: 404, message: 'ItemRequest not found' };
  return r;
}

// stockroom accepts the request
// async function acceptItemRequest(id, acceptorAccountId) {
//   const req = await getItemRequestById(id);
//   if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be accepted' };
//   req.status = 'accepted';
//   req.acceptedBy = acceptorAccountId || null;
//   req.acceptedAt = new Date();
//   await req.save();
//   return req;
// }
async function acceptItemRequest(id, acceptorAccountId) {
  const req = await getItemRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be accepted' };

  req.status = 'accepted';
  req.acceptedBy = acceptorAccountId || null;
  req.acceptedAt = new Date();
  await req.save();
  return req;
}

// stockroom declines (optionally because out of stock)
async function declineItemRequest(id, declinerAccountId, reason = null) {
  const req = await getItemRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be declined' };
  req.status = 'declined';
  if (reason) req.note = (req.note ? req.note + ' | ' : '') + `Declined: ${reason}`;
  await req.save();
  return req;
}

async function releaseItemRequest(id, releaserAccountId) {
  const req = await getItemRequestById(id);
  if (req.status !== 'accepted') throw { status: 400, message: 'Only accepted requests can be released' };

  const qty = parseInt(req.quantity || 0, 10);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid quantity' };

  const sequelize = db.sequelize || null;
  const t = sequelize ? await sequelize.transaction() : null;

  try {
    // resolve inventory aggregate (or unit -> inventory)
    const inv = await resolveInventory(req, { transaction: t });
    if (!inv) {
      // mark out_of_stock and commit so caller sees state change
      req.status = 'out_of_stock';
      await req.save({ transaction: t });
      if (t) await t.commit();
      throw { status: 404, message: 'Inventory item not found; request marked out_of_stock' };
    }

    const available = inv.totalQuantity || 0;
    if (available < qty) {
      req.status = 'out_of_stock';
      await req.save({ transaction: t });
      if (t) await t.commit();
      throw { status: 400, message: `Not enough stock to release (${available} available); request marked out_of_stock` };
    }

    // fetch requester name for claimedBy
    const requester = await db.Account.findByPk(req.accountId || req.acccountId, { transaction: t });
    const requesterName = requester ? `${requester.firstName || ''} ${requester.lastName || ''}`.trim() : String(req.accountId || req.acccountId);

    // create release record (type-specific) and update inventory + units
    const releaseBatch = await createReleaseForType(req, inv, qty, requesterName, releaserAccountId, { transaction: t });

    // mark request released
    req.status = 'released';
    req.releasedBy = releaserAccountId || null;
    req.releasedAt = new Date();
    await req.save({ transaction: t });

    if (t) await t.commit();
    return { request: req, releaseBatch };
  } catch (err) {
    if (t) {
      try { await t.rollback(); } catch (e) { /* ignore rollback error */ }
    }
    // best-effort: if request still accepted, mark out_of_stock to avoid dangling accepted requests
    try {
      const fresh = await db.ItemRequest.findByPk(id);
      if (fresh && fresh.status === 'accepted') {
        fresh.status = 'out_of_stock';
        await fresh.save();
      }
    } catch (e) { /* ignore */ }
    throw err;
  }
}

/* ---------------- Helpers ---------------- */

async function resolveInventory(req, opts = {}) {
  // Prefer inventory aggregates; otherwise attempt unit -> inventory.
  const txOpt = opts.transaction ? { transaction: opts.transaction } : {};
  if (req.itemType === 'apparel') {
    let inv = await db.ApparelInventory.findByPk(req.itemId, txOpt);
    if (inv) return inv;
    const unit = await db.Apparel.findByPk(req.itemId, txOpt);
    if (unit?.apparelInventoryId) return await db.ApparelInventory.findByPk(unit.apparelInventoryId, txOpt);
    return null;
  }

  if (req.itemType === 'supply') {
    let inv = await db.AdminSupplyInventory.findByPk(req.itemId, txOpt);
    if (inv) return inv;
    const unit = await db.AdminSupply.findByPk(req.itemId, txOpt);
    if (unit?.adminSupplyInventoryId) return await db.AdminSupplyInventory.findByPk(unit.adminSupplyInventoryId, txOpt);
    return null;
  }

  if (req.itemType === 'genItem') {
    let inv = await db.GenItemInventory.findByPk(req.itemId, txOpt);
    if (inv) return inv;
    const unit = await db.GenItem.findByPk(req.itemId, txOpt);
    if (unit?.genItemInventoryId) return await db.GenItemInventory.findByPk(unit.genItemInventoryId, txOpt);
    return null;
  }

  return null;
}

async function createReleaseForType(req, inv, qty, requesterName, releaserAccountId, opts = {}) {
  // opts can contain { transaction }
  const tx = opts.transaction ? { transaction: opts.transaction } : {};
  const releaserLabel = releaserAccountId ? String(releaserAccountId) : 'Stockroom';

  if (req.itemType === 'apparel') {
    const release = await db.ReleaseApparel.create({
      roomId:                 inv.roomId,
      apparelInventoryId:     inv.apparelInventoryId ?? inv.id,
      releasedBy:             releaserLabel,
      claimedBy:              requesterName,
      releaseApparelQuantity: qty
    }, tx);

    // deduct inventory aggregate
    inv.totalQuantity = (inv.totalQuantity || 0) - qty;
    await inv.save(tx);

    // mark per-unit Apparel rows as released (best-effort)
    if (db.Apparel && qty > 0) {
      const units = await db.Apparel.findAll({
        where: { apparelInventoryId: inv.apparelInventoryId ?? inv.id, status: 'good' }, // 'good' is your in-stock apparel enum
        limit: qty,
        order: [['apparelId', 'ASC']],
        ...tx
      });
      await Promise.all(units.map(u => { u.status = 'released'; return u.save(tx); }));
    }

    return release;
  }

  if (req.itemType === 'supply') {
    let release = null;
    if (db.ReleaseAdminSupply) {
      release = await db.ReleaseAdminSupply.create({
        roomId:                     inv.roomId,
        adminSupplyInventoryId:     inv.adminSupplyInventoryId ?? inv.id,
        releasedBy:                 releaserLabel,
        claimedBy:                  requesterName,
        releaseAdminSupplyQuantity: qty
      }, tx);
    } else {
      release = { note: 'AdminSupply released (no ReleaseAdminSupply model)', inventoryId: inv.adminSupplyInventoryId ?? inv.id, qty };
    }

    inv.totalQuantity = (inv.totalQuantity || 0) - qty;
    await inv.save(tx);

    if (db.AdminSupply && qty > 0) {
      const units = await db.AdminSupply.findAll({
        where: { adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id, status: 'in_stock' },
        limit: qty,
        order: [['adminSupplyId', 'ASC']],
        ...tx
      });
      await Promise.all(units.map(u => { u.status = 'released'; return u.save(tx); }));
    }

    return release;
  }

  if (req.itemType === 'genItem') {
    const release = await db.ReleaseGenItem.create({
      roomId:                inv.roomId,
      genItemInventoryId:    inv.genItemInventoryId ?? inv.id,
      releasedBy:            releaserLabel,
      claimedBy:             requesterName,
      releaseItemQuantity:   qty,
      genItemType:           inv.genItemType
    }, tx);

    inv.totalQuantity = (inv.totalQuantity || 0) - qty;
    await inv.save(tx);

    if (db.GenItem && qty > 0) {
      const units = await db.GenItem.findAll({
        where: { genItemInventoryId: inv.genItemInventoryId ?? inv.id, status: 'in_stock' },
        limit: qty,
        order: [['genItemId', 'ASC']],
        ...tx
      });
      await Promise.all(units.map(u => { u.status = 'released'; return u.save(tx); }));
    }

    return release;
  }

  throw { status: 500, message: 'Unsupported itemType for release' };
}

// teacher (requester) fulfills an accepted request: decrement inventory & create Release rows
// async function fulfillItemRequest(id, fulfillerAccountId) {
//   const req = await getItemRequestById(id);
//   if (req.status !== 'accepted') throw { status: 400, message: 'Only accepted requests can be fulfilled' };

//   const qty = parseInt(req.quantity || 0, 10);
//   if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid quantity' };

//   // find the inventory aggregate row (prefer inventory tables)
//   let inv = null;
//   if (req.itemType === 'apparel') {
//     inv = await db.ApparelInventory.findByPk(req.itemId);
//   } else if (req.itemType === 'supply') {
//     inv = await db.AdminSupplyInventory.findByPk(req.itemId);
//   } else if (req.itemType === 'genItem') {
//     inv = await db.GenItemInventory.findByPk(req.itemId);
//   }

//   if (!inv) {
//     // try unit lookup fallback (if itemId referenced a unit)
//     if (req.itemType === 'apparel') {
//       const unit = await db.Apparel.findByPk(req.itemId);
//       if (unit) inv = await db.ApparelInventory.findByPk(unit.apparelInventoryId);
//     } else if (req.itemType === 'supply') {
//       const unit = await db.AdminSupply.findByPk(req.itemId);
//       if (unit) inv = await db.AdminSupplyInventory.findByPk(unit.adminSupplyInventoryId);
//     } else if (req.itemType === 'genItem') {
//       const unit = await db.GenItem.findByPk(req.itemId);
//       if (unit) inv = await db.GenItemInventory.findByPk(unit.genItemInventoryId);
//     }
//   }

//   if (!inv) {
//     req.status = 'out_of_stock';
//     await req.save();
//     throw { status: 404, message: 'Inventory item not found; request marked out_of_stock' };
//   }

//   const available = inv.totalQuantity || 0;
//   if (available < qty) {
//     req.status = 'out_of_stock';
//     await req.save();
//     throw { status: 400, message: `Not enough stock to fulfill (${available} available); request marked out_of_stock` };
//   }

//   // decrement inventory
//   inv.totalQuantity = (inv.totalQuantity || 0) - qty;
//   await inv.save();

//   // get requester name for claimedBy / logging
//   const requester = await db.Account.findByPk(req.accountId);
//   const requesterName = requester ? `${requester.firstName || ''} ${requester.lastName || ''}`.trim() : String(req.accountId);

//   // create release batch using existing service patterns
//   let releaseBatch = null;
//   if (req.itemType === 'apparel') {
//     // // call apparel service release handler
//     // // releaseApparelHandler expects { apparelInventoryId, releaseQuantity, releasedBy, claimedBy }
//     // releaseBatch = await apparelService.releaseApparelHandler({
//     //   apparelInventoryId: inv.apparelInventoryId ?? inv.id,
//     //   releaseQuantity: qty,
//     //   releasedBy: 'Stockroom',            // or the stockroom name; could be req.acceptedBy or fetched account
//     //   claimedBy: requesterName
//     // });
//     try {
//       const batches = await db.ReceiveApparel.findAll({
//         where: {
//           roomId: inv.roomId,
//           apparelName: inv.apparelName,
//           apparelLevel: inv.apparelLevel,
//           apparelType: inv.apparelType,
//           apparelFor: inv.apparelFor,
//           apparelSize: inv.apparelSize
//         },
//         attributes: ['id'],
//         order: [['receivedAt', 'ASC']]
//       });
//       const batchIds = batches.map(b => b.id);
//       const units = await db.Apparel.findAll({
//         where: { receiveApparelId: batchIds, status: 'in_stock' }, // change if you used a different in-stock token
//         limit: qty
//       });
//       await Promise.all(units.map(u => { u.status = 'released'; return u.save(); }));
//     } catch (err) {
//       console.warn('Warning: per-unit update failed', err);
//     }
//   } else if (req.itemType === 'supply') {
//     // best-effort: try to call adminSupply service release method if it exists
//     if (adminSupplyService && typeof adminSupplyService.releaseSupplyHandler === 'function') {
//       releaseBatch = await adminSupplyService.releaseSupplyHandler({
//         roomId: inv.roomId,
//         adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id,
//         releasedBy: 'Stockroom',
//         claimedBy: requesterName,
//         releaseQuantity: qty
//       });
//     } else {
//       // fallback: create a simple Release record or mark success
//       // (Your repo doesn't include ReleaseAdminSupply model — adapt if you have a model)
//       releaseBatch = { note: 'AdminSupply release performed (no dedicated Release model in repo).', inventoryId: inv.adminSupplyInventoryId ?? inv.id };
//     }
//   } else if (req.itemType === 'genItem') {
//     // create ReleaseGenItem row directly (model exists)
//     releaseBatch = await db.ReleaseGenItem.create({
//       roomId: inv.roomId,
//       genItemInventoryId: inv.genItemInventoryId ?? inv.id,
//       releasedBy: 'Stockroom',
//       claimedBy: requesterName,
//       releaseItemQuantity: qty,
//       genItemType: inv.genItemType
//     });
//   }

//   // finalize request
//   req.status = 'fulfilled';
//   req.fulfilledBy = fulfillerAccountId || null;
//   req.fulfilledAt = new Date();
//   await req.save();

//   return { request: req, releaseBatch };
// }
async function fulfillItemRequest(id, fulfillerAccountId) {
  const req = await getItemRequestById(id);
  // only allow fulfill when previously released by stockroom
  if (req.status !== 'released') throw { status: 400, message: 'Only released requests can be fulfilled by the requester' };

  req.status = 'fulfilled';
  req.fulfilledBy = fulfillerAccountId || null;
  req.fulfilledAt = new Date();
  await req.save();
  return req;
}