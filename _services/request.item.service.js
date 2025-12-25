const db = require('_helpers/db-handler');
const Role = require('_helpers/role');
const accountService = require('_services/account.service');

module.exports = {
  createItemRequest,
  listItemRequests,
  getItemRequestById,
  acceptItemRequest,
  declineItemRequest,
  releaseItemRequest,
  fulfillItemRequest
};

async function createItemRequest({ accountId, requesterRoomId, requestToRoomId, itemId, quantity = 1, note = null, ipAddress, browserInfo }) {
  if (!accountId) throw { status: 401, message: 'Unauthenticated' };
  if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be positive integer' };

  // Defensive: ensure requestToRoom exists and is stockroom/substockroom (in case service is called directly)
  const requestToRoom = await db.Room.findByPk(requestToRoomId);
  if (!requestToRoom) throw { status: 400, message: 'Invalid requestToRoomId' };
  const rt = String(requestToRoom.roomType || '').toLowerCase();
  if (!['stockroom', 'substockroom'].includes(rt)) {
    throw { status: 403, message: 'Can only request from rooms of type stockroom or substockroom' };
  }

  // first, ensure the itemId exists and belongs to the requestToRoomId
  let resolvedType = null;
  let itemRow = null;

  async function tryInventory(modelName) {
    const M = db[modelName];
    if (!M) return null;
    const candidate = await M.findByPk(itemId);
    if (!candidate) return null;
    const roomFields = ['roomId','locationRoomId','storedRoomId','room_id','stockRoomId'];
    for (const f of roomFields) {
      if (typeof candidate[f] !== 'undefined' && String(candidate[f]) === String(requestToRoomId)) {
        return candidate;
      }
    }
    return null;
  }

  if (db.ApparelInventory) {
    const r = await tryInventory('ApparelInventory');
    if (r) { resolvedType = 'apparel'; itemRow = r; }
  }
  if (!resolvedType && db.AdminSupplyInventory) {
    const r = await tryInventory('AdminSupplyInventory');
    if (r) { resolvedType = 'supply'; itemRow = r; }
  }
  if (!resolvedType && db.GenItemInventory) {
    const r = await tryInventory('GenItemInventory');
    if (r) { resolvedType = 'genItem'; itemRow = r; }
  }

  if (!resolvedType) {
    const unitCandidates = [
      { model: 'Apparel', type: 'apparel' },
      { model: 'AdminSupply', type: 'supply' },
      { model: 'GenItem', type: 'genItem' }
    ];
    for (const cand of unitCandidates) {
      const M = db[cand.model];
      if (!M) continue;
      const u = await M.findByPk(itemId);
      if (!u) continue;
      const roomFields = ['roomId','locationRoomId','storedRoomId','room_id','stockRoomId'];
      for (const f of roomFields) {
        if (typeof u[f] !== 'undefined' && String(u[f]) === String(requestToRoomId)) {
          resolvedType = cand.type; itemRow = u; break;
        }
      }
      if (resolvedType) break;
    }
  }

  if (!resolvedType) {
    throw { status: 400, message: `Item ${itemId} was not found in the inventory (or does not belong to room ${requestToRoomId})` };
  }

  // Create the ItemRequest record (store itemType for downstream compatibility)
  const created = await db.ItemRequest.create({
    accountId,
    requesterRoomId,
    requestToRoomId,
    itemType: resolvedType,
    itemId,
    quantity,
    note,
    status: 'pending'
    , ipAddress, browserInfo
  });

  try {
    await accountService.logActivity(
      String(accountId),
      'item_request_create',
      created.ipAddress,
      created.browserInfo,
      `requestId:${created.itemRequestId}`
    );
  } catch (e) { console.error('activity log failed (createItemRequest)', e); }

  return created;
}

async function listItemRequests({ where = {}, limit = 100, offset = 0 } = {}) {
  return await db.ItemRequest.findAll({
    where,
    order: [['itemRequestId','DESC']],
    limit,
    offset,
    include: [
      { model: db.Room, attributes: ['roomId','roomName'] },
      { model: db.Account, attributes: ['accountId','firstName','lastName'] }
    ]
  });
}
async function getItemRequestById(id) {
  const r = await db.ItemRequest.findByPk(id, {
    include: [{
      model: db.Account,
      attributes: ['accountId', 'firstName', 'lastName']
    }]
  });
  if (!r) throw { status: 404, message: 'ItemRequest not found' };
  return r;
}
async function acceptItemRequest(id, acceptorAccountId, ipAddress, browserInfo) {
  const req = await getItemRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be accepted' };

  req.status = 'accepted';
  req.acceptedBy = acceptorAccountId || null;
  req.acceptedAt = new Date();
  await req.save();

  try {
    await accountService.logActivity(
      String(acceptorAccountId),
      'item_request_accept',
      ipAddress,
      browserInfo,
      `requestId:${req.itemRequestId}`
    );
  } catch (e) { console.error('activity log failed (acceptItemRequest)', e); }

  return req;
}
async function declineItemRequest(id, declinerAccountId, reason = null, ipAddress, browserInfo) {
  const req = await getItemRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be declined' };
  req.status = 'declined';
  if (reason) req.note = (req.note ? req.note + ' | ' : '') + `Declined: ${reason}`;
  await req.save();

  try {
    await accountService.logActivity(
      String(declinerAccountId),
      'item_request_decline',
      ipAddress,
      browserInfo,
      `requestId:${req.itemRequestId}${reason ? `, reason:${reason}` : ''}`
    );
  } catch (e) { console.error('activity log failed (declineItemRequest)', e); }

  return req;
}
// async function releaseItemRequest(id, releaserAccountId, ipAddress, browserInfo) {
//   const req = await getItemRequestById(id);
//   if (req.status !== 'accepted') throw { status: 400, message: 'Only accepted requests can be released' };

//   const qty = parseInt(req.quantity || 0, 10);
//   if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid quantity' };

//   const sequelize = db.sequelize || null;
//   const t = sequelize ? await sequelize.transaction() : null;

//   try {
//     const inv = await resolveInventory(req, { transaction: t });
//     if (!inv) {
//       req.status = 'out_of_stock';
//       await req.save({ transaction: t });
//       if (t) await t.commit();
//       throw { status: 404, message: 'Inventory item not found; request marked out_of_stock' };
//     }

//     const available = inv.totalQuantity || 0;
//     if (available < qty) {
//       req.status = 'out_of_stock';
//       await req.save({ transaction: t });
//       if (t) await t.commit();
//       throw { status: 400, message: `Not enough stock to release (${available} available); request marked out_of_stock` };
//     }

//     const requester = await db.Account.findByPk(req.accountId || req.acccountId, { transaction: t });
//     const requesterName = requester ? `${requester.firstName || ''} ${requester.lastName || ''}`.trim() : String(req.accountId || req.acccountId);

//     const releaseBatch = await createReleaseForType(req, inv, qty, requesterName, releaserAccountId, { transaction: t });

//     req.status = 'released';
//     req.releasedBy = releaserAccountId || null;
//     req.releasedAt = new Date();
//     await req.save({ transaction: t });

//     try {
//       await accountService.logActivity(
//         String(releaserAccountId),
//         'item_request_release',
//         ipAddress,
//         browserInfo,
//         `requestId:${req.itemRequestId}, qty:${qty}`
//       );
//     } catch (e) { console.error('activity log failed (releaseItemRequest)', e); }

//     if (t) await t.commit();
//     return { request: req, releaseBatch };
//   } catch (err) {
//     if (t) {
//       try { await t.rollback(); } catch (e) {}
//     }
//     try {
//       const fresh = await db.ItemRequest.findByPk(id);
//       if (fresh && fresh.status === 'accepted') {
//         fresh.status = 'out_of_stock';
//         await fresh.save();
//       }
//     } catch (e) {}
//     throw err;
//   }
// }
// async function fulfillItemRequest(id, fulfillerAccountId, ipAddress, browserInfo) {
//   const req = await getItemRequestById(id);
//   if (req.status !== 'released') throw { status: 400, message: 'Only released requests can be fulfilled by the requester' };

//   req.status = 'fulfilled';
//   req.fulfilledBy = fulfillerAccountId || null;
//   req.fulfilledAt = new Date();
//   await req.save();

//   try {
//     await accountService.logActivity(
//       String(fulfillerAccountId),
//       'item_request_fulfill',
//       ipAddress,
//       browserInfo,
//       `requestId:${req.itemRequestId}`
//     );
//   } catch (e) { console.error('activity log failed (fulfillItemRequest)', e); }

//   return req;
// }

async function releaseItemRequest(requestId, user, ipAddress = '', browserInfo = '') {
  const rid = Number(requestId);
  if (!Number.isFinite(rid) || rid <= 0) throw { status: 400, message: 'Invalid request id' };

  const result = await db.sequelize.transaction(async (t) => {
    const reqRow = await db.ItemRequest.findByPk(rid, { transaction: t, lock: t.LOCK.UPDATE });
    if (!reqRow) throw { status: 404, message: 'Item request not found' };

    // must be in accepted state to release (adjust to your actual statuses)
    if (reqRow.status !== 'accepted') throw { status: 400, message: `Cannot release request in status '${reqRow.status}'` };

    // ensure itemId exists (common cause of "not found")
    const itemId = reqRow.itemId;
    if (!itemId) {
      // more helpful error so you can debug acceptance flow
      throw { status: 400, message: 'ItemRequest.itemId is null or missing. Ensure accept flow sets the inventory itemId before release.' };
    }

    // find inventory row (search across inventory tables)
    const invInfo = await getInventoryModelForItemId(itemId, t);
    if (!invInfo) {
      // mark request out_of_stock (your existing logic did this)
      reqRow.status = 'out_of_stock';
      reqRow.outOfStockAt = new Date();
      await reqRow.save({ transaction: t });
      throw { status: 400, message: 'Inventory item not found; request marked out_of_stock' };
    }

    const inv = invInfo.row;
    const qty = Number(reqRow.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) throw { status: 400, message: 'Invalid request quantity' };

    const available = Number(inv.totalQuantity || 0);
    if (available < qty) {
      // not enough stock -> mark out_of_stock and return
      reqRow.status = 'out_of_stock';
      reqRow.outOfStockAt = new Date();
      await reqRow.save({ transaction: t });
      throw { status: 400, message: `Insufficient stock (have ${available}, need ${qty}). Request marked out_of_stock.` };
    }

    // decrease inventory
    inv.totalQuantity = Math.max(0, available - qty);
    await inv.save({ transaction: t });

    // mark request released
    reqRow.status = 'released';
    reqRow.releasedBy = String(user?.accountId ?? user?.id ?? user?.userId ?? '');
    reqRow.releasedAt = new Date();
    await reqRow.save({ transaction: t });

    return { reqRow, invInfo };
  });

  // activity log (best-effort) — include ip/browser if provided
  try {
    await accountService.logActivity(
      String(user?.accountId ?? user?.id ?? user?.userId ?? ''),
      'itemrequest_release',
      ipAddress || '',
      browserInfo || '',
      `requestId:${result.reqRow.requestId}`
    );
  } catch (err) {
    console.error('activity log failed (releaseItemRequest)', err);
  }

  return result.reqRow;
}

// /**
//  * fulfillItemRequest
//  * - After release, mark request fulfilled/closed; adjust other flags as needed.
//  */
// async function fulfillItemRequest(requestId, user, ipAddress = '', browserInfo = '') {
//   const rid = Number(requestId);
//   if (!Number.isFinite(rid) || rid <= 0) throw { status: 400, message: 'Invalid request id' };

//   const result = await db.sequelize.transaction(async (t) => {
//     const reqRow = await db.ItemRequest.findByPk(rid, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!reqRow) throw { status: 404, message: 'Item request not found' };

//     // require released -> fulfill. If your flow uses a different status, adapt this.
//     if (reqRow.status !== 'released') throw { status: 400, message: `Only released requests can be fulfilled. Current status: '${reqRow.status}'` };

//     reqRow.status = 'fulfilled';
//     reqRow.fulfilledBy = String(user?.accountId ?? user?.id ?? user?.userId ?? '');
//     reqRow.fulfilledAt = new Date();
//     await reqRow.save({ transaction: t });

//     return reqRow;
//   });

//   // activity log
//   try {
//     await accountService.logActivity(
//       String(user?.accountId ?? user?.id ?? user?.userId ?? ''),
//       'itemrequest_fulfill',
//       ipAddress || '',
//       browserInfo || '',
//       `requestId:${result.requestId}`
//     );
//   } catch (err) {
//     console.error('activity log failed (fulfillItemRequest)', err);
//   }

//   return result;
// }
async function findInventoryAndType(itemId, itemType, options = {}) {
  const id = Number(itemId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const tOpt = options.transaction ? { transaction: options.transaction } : {};

  // apparel: try inventory first, then unit
  if (String(itemType).toLowerCase().includes('apparel')) {
    const inv = await db.ApparelInventory.findByPk(id, tOpt);
    if (inv) return { inv, type: 'apparel' };
    const unit = await db.Apparel.findByPk(id, tOpt);
    if (unit) return { unit, type: 'apparel' };
    return null;
  }

  // admin supplies / supplies
  if (String(itemType).toLowerCase().includes('supply') || String(itemType).toLowerCase() === 'admin-supply') {
    const inv = await db.AdminSupplyInventory.findByPk(id, tOpt);
    if (inv) return { inv, type: 'supply' };
    const unit = await db.AdminSupply.findByPk(id, tOpt);
    if (unit) return { unit, type: 'supply' };
    return null;
  }

  // gen items / IT / maintenance / general items
  if (['genitem', 'gen-item', 'gen_item', 'gen item', 'it', 'maintenance'].includes(String(itemType).toLowerCase())) {
    const inv = await db.GenItemInventory.findByPk(id, tOpt);
    if (inv) return { inv, type: 'genitem' };
    const unit = await db.GenItem.findByPk(id, tOpt);
    if (unit) return { unit, type: 'genitem' };
    return null;
  }

  // fallback: try to find by unit or inventory generically
  // try apparel unit/inv as default
  const inv = await db.ApparelInventory.findByPk(id, tOpt);
  if (inv) return { inv, type: 'apparel' };
  const unit = await db.Apparel.findByPk(id, tOpt);
  if (unit) return { unit, type: 'apparel' };

  return null;
}
async function fulfillItemRequest(requestId, user, ipAddress = '', browserInfo = '') {
  const rid = Number(requestId);
  if (!Number.isFinite(rid) || rid <= 0) throw { status: 400, message: 'Invalid request id' };

  const result = await db.sequelize.transaction(async (t) => {
    const reqRow = await db.ItemRequest.findByPk(rid, { transaction: t, lock: t.LOCK.UPDATE });
    if (!reqRow) throw { status: 404, message: 'Item request not found' };

    // require released -> fulfill
    if (String(reqRow.status) !== 'released') throw { status: 400, message: `Only released requests can be fulfilled. Current status: '${reqRow.status}'` };

    // find the inventory/unit that was released (helper already in file)
    const found = await findInventoryAndType(reqRow.itemId, reqRow.itemType);
    if (!found || (!found.inv && !found.unit)) {
      // mark failed and save
      reqRow.status = 'failed_request';
      await reqRow.save({ transaction: t });
      throw { status: 404, message: 'Could not locate inventory item to fulfill request; request marked failed' };
    }

    const qty = Number(reqRow.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) {
      throw { status: 400, message: 'Invalid request quantity' };
    }

    // Use requesterRoomId as destination room
    const destRoomId = Number(reqRow.requesterRoomId);
    if (!Number.isFinite(destRoomId) || destRoomId <= 0) {
      throw { status: 400, message: 'Invalid requesterRoomId on request' };
    }

    // get an example inventory record for metadata (name/size/etc.)
    const exampleInv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!exampleInv) {
      reqRow.status = 'failed_request';
      await reqRow.save({ transaction: t });
      throw { status: 404, message: 'Could not resolve inventory metadata for fulfillment' };
    }

    // small helper for unit status
    function getUnitStatusForType(type) {
      if (String(type) === 'apparel') return 'good';
      return 'in_stock';
    }

    // create/update destination inventory and create receive batch + units (transactional)
    let createdBatch = null;

    if (String(found.type) === 'apparel') {
      const where = {
        roomId: destRoomId,
        apparelName: exampleInv.apparelName,
        apparelLevel: exampleInv.apparelLevel,
        apparelType: exampleInv.apparelType,
        apparelFor: exampleInv.apparelFor,
        apparelSize: exampleInv.apparelSize
      };
      const [destInv] = await db.ApparelInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction: t });
      destInv.totalQuantity = (destInv.totalQuantity || 0) + qty;
      await destInv.save({ transaction: t });

      createdBatch = await db.ReceiveApparel.create({
        roomId: destRoomId,
        receivedFrom: `ItemRequest #${reqRow.itemRequestId}`,
        receivedBy: String(user?.accountId ?? user?.id ?? null),
        apparelName: destInv.apparelName,
        apparelLevel: destInv.apparelLevel,
        apparelType: destInv.apparelType,
        apparelFor: destInv.apparelFor,
        apparelSize: destInv.apparelSize,
        apparelQuantity: qty
      }, { transaction: t });

      if (db.Apparel && qty > 0) {
        const apparelUnits = Array(qty).fill().map(() => ({
          receiveApparelId: createdBatch.receiveApparelId,
          apparelInventoryId: destInv.apparelInventoryId ?? destInv.id,
          roomId: destRoomId,
          status: getUnitStatusForType(found.type)
        }));
        await db.Apparel.bulkCreate(apparelUnits, { transaction: t });
      }
    }
    else if (String(found.type) === 'supply' || String(found.type) === 'admin-supply') {
      const where = {
        roomId: destRoomId,
        supplyName: exampleInv.supplyName,
        supplyMeasure: exampleInv.supplyMeasure
      };
      const [destInv] = await db.AdminSupplyInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction: t });
      destInv.totalQuantity = (destInv.totalQuantity || 0) + qty;
      await destInv.save({ transaction: t });

      createdBatch = await db.ReceiveAdminSupply.create({
        roomId: destRoomId,
        receivedFrom: `ItemRequest #${reqRow.itemRequestId}`,
        receivedBy: String(user?.accountId ?? user?.id ?? null),
        supplyName: destInv.supplyName,
        supplyQuantity: qty,
        supplyMeasure: destInv.supplyMeasure
      }, { transaction: t });

      if (db.AdminSupply && qty > 0) {
        const units = Array(qty).fill().map(() => ({
          receiveAdminSupplyId: createdBatch.receiveAdminSupplyId,
          adminSupplyInventoryId: destInv.adminSupplyInventoryId ?? destInv.id,
          roomId: destRoomId,
          status: 'in_stock'
        }));
        await db.AdminSupply.bulkCreate(units, { transaction: t });
      }
    }
    else if (String(found.type) === 'genitem' || String(found.type) === 'it' || String(found.type) === 'maintenance') {
      const where = {
        roomId: destRoomId,
        genItemName: exampleInv.genItemName,
        genItemSize: exampleInv.genItemSize ?? null,
        genItemType: exampleInv.genItemType
      };
      const [destInv] = await db.GenItemInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction: t });
      destInv.totalQuantity = (destInv.totalQuantity || 0) + qty;
      await destInv.save({ transaction: t });

      createdBatch = await db.ReceiveGenItem.create({
        roomId: destRoomId,
        receivedFrom: `ItemRequest #${reqRow.itemRequestId}`,
        receivedBy: String(user?.accountId ?? user?.id ?? null),
        genItemName: destInv.genItemName,
        genItemSize: destInv.genItemSize ?? null,
        genItemQuantity: qty,
        genItemType: destInv.genItemType
      }, { transaction: t });

      if (db.GenItem && qty > 0) {
        const units = Array(qty).fill().map(() => ({
          receiveGenItemId: createdBatch.receiveGenItemId,
          genItemInventoryId: destInv.genItemInventoryId ?? destInv.id,
          roomId: destRoomId,
          status: 'in_stock'
        }));
        await db.GenItem.bulkCreate(units, { transaction: t });
      }
    } else {
      // unsupported type — mark failed
      reqRow.status = 'failed_request';
      await reqRow.save({ transaction: t });
      throw { status: 400, message: `Unsupported item type for fulfillment: ${found.type}` };
    }

    // finally mark request fulfilled
    reqRow.status = 'fulfilled';
    reqRow.fulfilledBy = String(user?.accountId ?? user?.id ?? '');
    reqRow.fulfilledAt = new Date();
    await reqRow.save({ transaction: t });

    return { request: reqRow, createdBatch };
  });

  // activity log (best-effort)
  try {
    await accountService.logActivity(
      String(user?.accountId ?? user?.id ?? ''),
      'itemrequest_fulfill',
      ipAddress || '',
      browserInfo || '',
      `requestId:${result.request.itemRequestId || result.request.id}`
    );
  } catch (err) {
    console.error('activity log failed (fulfillItemRequest log)', err);
  }

  return result;
}






/* ---------------- Helpers ---------------- */

async function resolveInventory(req, opts = {}) {
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
async function getInventoryModelForItemId(id, transaction) {
  if (!id) return null;
  const candidates = [
    { key: 'apparel', model: db.ApparelInventory },
    { key: 'supply',  model: db.AdminSupplyInventory },
    { key: 'genitem', model: db.GenItemInventory }
  ];

  for (const c of candidates) {
    if (!c.model) continue;
    const opts = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
    const r = await c.model.findByPk(id, opts);
    if (r) return { key: c.key, model: c.model, row: r };
  }
  return null;
}