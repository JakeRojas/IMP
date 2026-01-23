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

async function createItemRequest({ accountId, requesterRoomId, requestToRoomId, items = [], note = null, ipAddress, browserInfo }) {
  if (!accountId) throw { status: 401, message: 'Unauthenticated' };
  if (!items || !items.length) throw { status: 400, message: 'Must provide at least one item' };

  // Defensive: ensure rooms exist
  const requestToRoom = await db.Room.findByPk(requestToRoomId);
  if (!requestToRoom) throw { status: 400, message: 'Invalid requestToRoomId' };

  const resolvedItems = [];
  for (const it of items) {
    let resolvedType = it.itemType || null;
    let itemId = it.itemId ? Number(it.itemId) : null;
    let quantity = Number(it.quantity || 1);
    if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be positive integer' };

    if (itemId) {
      // Validate item exists (reusing logic if needed, but for bulk we might skip extensive room validation if trust is high)
      // For now, assume front-end filtered correctly and we just need the type if missing.
      if (!resolvedType) {
        const inv = await getInventoryModelForItemId(itemId);
        if (inv) resolvedType = inv.key;
      }
    } else if (!it.otherItemName) {
      throw { status: 400, message: 'Each item must have itemId or otherItemName' };
    }

    resolvedItems.push({
      itemId,
      itemType: resolvedType,
      otherItemName: it.otherItemName || null,
      quantity,
      note: it.note || null,
      status: 'pending'
    });
  }

  // Create Header (Legacy fields take the first item if exists)
  const first = resolvedItems[0];
  const created = await db.ItemRequest.create({
    accountId,
    requesterRoomId,
    requestToRoomId,
    itemType: first.itemType,
    itemId: first.itemId,
    otherItemName: first.otherItemName,
    quantity: items.length === 1 ? first.quantity : resolvedItems.reduce((acc, curr) => acc + curr.quantity, 0),
    note,
    status: 'pending',
    ipAddress,
    browserInfo
  });

  // Create Details
  await Promise.all(resolvedItems.map(ri => {
    ri.itemRequestId = created.itemRequestId;
    return db.ItemRequestDetail.create(ri);
  }));

  try {
    await accountService.logActivity(
      String(accountId),
      'item_request_create',
      ipAddress,
      browserInfo,
      `requestId:${created.itemRequestId}, itemsCount:${resolvedItems.length}`
    );
  } catch (e) { console.error('activity log failed (createItemRequest)', e); }

  return created;
}

async function listItemRequests({ query = {}, limit = 100, offset = 0 } = {}) {
  const { Op } = require('sequelize');
  const where = {};

  if (query.status) where.status = query.status;
  if (query.accountId) where.accountId = query.accountId;
  if (query.itemType) where.itemType = query.itemType;

  // Search filter
  if (query.search) {
    where[Op.or] = [
      { itemRequestId: { [Op.like]: `%${query.search}%` } },
      { '$Room.roomName$': { [Op.like]: `%${query.search}%` } },
      { '$Account.firstName$': { [Op.like]: `%${query.search}%` } },
      { '$Account.lastName$': { [Op.like]: `%${query.search}%` } },
      { itemType: { [Op.like]: `%${query.search}%` } },
      { otherItemName: { [Op.like]: `%${query.search}%` } },
    ];
  }

  // Date Filter
  if (query.startDate && query.endDate) {
    const start = new Date(query.startDate);
    const end = new Date(query.endDate);
    end.setHours(23, 59, 59, 999);
    where.createdAt = { [Op.between]: [start, end] };
  } else if (query.startDate) {
    where.createdAt = { [Op.gte]: new Date(query.startDate) };
  } else if (query.endDate) {
    const end = new Date(query.endDate);
    end.setHours(23, 59, 59, 999);
    where.createdAt = { [Op.lte]: end };
  }

  const { count, rows } = await db.ItemRequest.findAndCountAll({
    where,
    order: [['itemRequestId', 'DESC']],
    limit,
    offset,
    include: [
      { model: db.Room, as: 'Room', attributes: ['roomId', 'roomName'] },
      { model: db.Room, as: 'requestToRoom', attributes: ['roomId', 'roomName'] },
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'] }
    ]
  });
  return { rows, count };
}

async function getItemRequestById(id) {
  const r = await db.ItemRequest.findByPk(id, {
    include: [
      { model: db.Room, as: 'Room', attributes: ['roomId', 'roomName'] },
      { model: db.Room, as: 'requestToRoom', attributes: ['roomId', 'roomName'] },
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'] },
      { model: db.ItemRequestDetail, as: 'items' }
    ]
  });
  if (!r) throw { status: 404, message: 'ItemRequest not found' };

  // Load requested items for header and details to resolve names
  const loadTasks = [];
  loadTasks.push((async () => {
    try {
      const ri = await _loadRequestedItem(r.itemId, r.itemType);
      if (ri) r.setDataValue('requestedItem', ri);
    } catch (e) { }
  })());

  if (r.items) {
    for (const item of r.items) {
      loadTasks.push((async () => {
        try {
          const ri = await _loadRequestedItem(item.itemId, item.itemType);
          if (ri) item.setDataValue('requestedItem', ri);
        } catch (e) { }
      })());
    }
  }
  await Promise.all(loadTasks);

  return r;
}
async function acceptItemRequest(id, acceptorAccountId, ipAddress, browserInfo, updateData = {}) {
  const req = await getItemRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be accepted' };

  const decisions = updateData.decisions || []; // Array of { id, status, reason }

  if (decisions.length > 0) {
    // Granular acceptance
    for (const d of decisions) {
      await db.ItemRequestDetail.update(
        { status: d.status, note: d.reason || null },
        { where: { itemRequestDetailId: d.id, itemRequestId: id } }
      );
    }

    // Check if at least one is accepted to determine header status
    const acceptedCount = await db.ItemRequestDetail.count({ where: { itemRequestId: id, status: 'accepted' } });
    const pendingCount = await db.ItemRequestDetail.count({ where: { itemRequestId: id, status: 'pending' } });

    if (acceptedCount > 0) {
      req.status = 'accepted';
    } else if (pendingCount === 0) {
      req.status = 'declined';
    }
  } else {
    // Default: Accept everything
    req.status = 'accepted';
    if (updateData.quantity) {
      const q = Number(updateData.quantity);
      if (Number.isFinite(q) && q > 0) req.quantity = q;
    }
    if (db.ItemRequestDetail) {
      await db.ItemRequestDetail.update(
        { status: 'accepted' },
        { where: { itemRequestId: id, status: 'pending' } }
      );
    }
  }

  req.acceptedBy = acceptorAccountId || null;
  req.acceptedAt = new Date();
  await req.save();

  try {
    await accountService.logActivity(
      String(acceptorAccountId),
      'item_request_accept',
      ipAddress,
      browserInfo,
      `requestId:${req.itemRequestId}, granular:${decisions.length > 0}`
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
    const reqRow = await db.ItemRequest.findByPk(rid, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [{ model: db.ItemRequestDetail, as: 'items' }]
    });
    if (!reqRow) throw { status: 404, message: 'Item request not found' };

    if (reqRow.status !== 'accepted') throw { status: 400, message: `Cannot release request in status '${reqRow.status}'` };

    const items = reqRow.items || [];
    if (items.length === 0) {
      // Support legacy single-item requests if no details found
      items.push({
        itemId: reqRow.itemId,
        quantity: reqRow.quantity,
        itemType: reqRow.itemType,
        otherItemName: reqRow.otherItemName
      });
    }

    const releasedItemsInfo = [];
    for (const item of items) {
      if (item.itemId) {
        const invInfo = await getInventoryModelForItemId(item.itemId, t);
        if (!invInfo) {
          throw { status: 400, message: `Inventory item ${item.itemId} not found for item ${item.otherItemName || ''}` };
        }
        const inv = invInfo.row;
        const qty = Number(item.quantity || 0);
        const available = Number(inv.totalQuantity || 0);

        if (available < qty) {
          throw { status: 400, message: `Insufficient stock for item ${item.otherItemName || item.itemId} (have ${available}, need ${qty})` };
        }

        // decrease inventory
        inv.totalQuantity = Math.max(0, available - qty);
        await inv.save({ transaction: t });
        releasedItemsInfo.push({ itemId: item.itemId, type: invInfo.key, qty });
      }

      if (item.id) { // if it's a detail record
        item.status = 'released';
        await item.save({ transaction: t });
      }
    }

    // mark header released
    reqRow.status = 'released';
    reqRow.releasedBy = String(user?.accountId ?? user?.id ?? '');
    reqRow.releasedAt = new Date();
    await reqRow.save({ transaction: t });

    return { reqRow, releasedItemsInfo };
  });

  try {
    await accountService.logActivity(
      String(user?.accountId ?? user?.id ?? ''),
      'item_request_release',
      ipAddress,
      browserInfo,
      `requestId:${result.reqRow.itemRequestId}, itemsRel:${result.releasedItemsInfo.length}`
    );
  } catch (err) { console.error('activity log failed (releaseItemRequest)', err); }

  return result.reqRow;
}
// function ends here correctly


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
    const reqRow = await db.ItemRequest.findByPk(rid, {
      transaction: t,
      lock: t.LOCK.UPDATE,
      include: [{ model: db.ItemRequestDetail, as: 'items' }]
    });
    if (!reqRow) throw { status: 404, message: 'Item request not found' };

    if (String(reqRow.status) !== 'released') {
      throw { status: 400, message: `Only released requests can be fulfilled. Current status: '${reqRow.status}'` };
    }

    const destRoomId = Number(reqRow.requesterRoomId);
    if (!Number.isFinite(destRoomId) || destRoomId <= 0) throw { status: 400, message: 'Invalid requesterRoomId' };

    const items = reqRow.items || [];
    // Fallback for legacy single-item requests
    if (items.length === 0 && reqRow.itemId) {
      items.push({
        itemId: reqRow.itemId,
        quantity: reqRow.quantity,
        itemType: reqRow.itemType,
        otherItemName: reqRow.otherItemName
      });
    }

    for (const item of items) {
      if (!item.itemId) continue; // Skip 'other' items as they aren't in inventory

      const invInfo = await getInventoryModelForItemId(item.itemId, t);
      if (!invInfo) continue; // Should we throw? For now skip to be safe.

      const inv = invInfo.row;
      const qty = Number(item.quantity || 0);
      if (qty <= 0) continue;

      let createdBatch = null;

      // Handle specific inventory types
      if (invInfo.key === 'apparel') {
        const where = {
          roomId: destRoomId,
          apparelName: inv.apparelName,
          apparelLevel: inv.apparelLevel,
          apparelType: inv.apparelType,
          apparelFor: inv.apparelFor,
          apparelSize: inv.apparelSize
        };
        const [destInv] = await db.ApparelInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction: t });
        destInv.totalQuantity = (destInv.totalQuantity || 0) + qty;
        await destInv.save({ transaction: t });

        createdBatch = await db.ReceiveApparel.create({
          roomId: destRoomId,
          receivedFrom: `ItemRequest #${reqRow.itemRequestId}`,
          receivedBy: String(user?.accountId ?? user?.id ?? ''),
          apparelName: destInv.apparelName,
          apparelLevel: destInv.apparelLevel,
          apparelType: destInv.apparelType,
          apparelFor: destInv.apparelFor,
          apparelSize: destInv.apparelSize,
          apparelQuantity: qty
        }, { transaction: t });

        if (db.Apparel) {
          const units = Array(qty).fill().map(() => ({
            receiveApparelId: createdBatch.receiveApparelId,
            apparelInventoryId: destInv.apparelInventoryId || destInv.id,
            roomId: destRoomId,
            status: 'good'
          }));
          await db.Apparel.bulkCreate(units, { transaction: t });
        }
      }
      else if (invInfo.key === 'supply') {
        const where = {
          roomId: destRoomId,
          supplyName: inv.supplyName,
          supplyMeasure: inv.supplyMeasure
        };
        const [destInv] = await db.AdminSupplyInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction: t });
        destInv.totalQuantity = (destInv.totalQuantity || 0) + qty;
        await destInv.save({ transaction: t });

        createdBatch = await db.ReceiveAdminSupply.create({
          roomId: destRoomId,
          receivedFrom: `ItemRequest #${reqRow.itemRequestId}`,
          receivedBy: String(user?.accountId ?? user?.id ?? ''),
          supplyName: destInv.supplyName,
          supplyQuantity: qty,
          supplyMeasure: destInv.supplyMeasure
        }, { transaction: t });

        if (db.AdminSupply) {
          const units = Array(qty).fill().map(() => ({
            receiveAdminSupplyId: createdBatch.receiveAdminSupplyId,
            adminSupplyInventoryId: destInv.adminSupplyInventoryId || destInv.id,
            roomId: destRoomId,
            status: 'good'
          }));
          await db.AdminSupply.bulkCreate(units, { transaction: t });
        }
      }
      else if (invInfo.key === 'genitem') {
        const where = {
          roomId: destRoomId,
          genItemName: inv.genItemName,
          genItemSize: inv.genItemSize ?? null,
          genItemType: inv.genItemType
        };
        const [destInv] = await db.GenItemInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction: t });
        destInv.totalQuantity = (destInv.totalQuantity || 0) + qty;
        await destInv.save({ transaction: t });

        const rb = await db.ReceiveGenItem.create({
          roomId: destRoomId,
          receivedFrom: `ItemRequest #${reqRow.itemRequestId}`,
          receivedBy: String(user?.accountId ?? user?.id ?? ''),
          genItemName: destInv.genItemName,
          genItemSize: destInv.genItemSize ?? null,
          genItemQuantity: qty,
          genItemType: destInv.genItemType
        }, { transaction: t });

        if (db.GenItem) {
          const units = Array(qty).fill().map(() => ({
            receiveGenItemId: rb.receiveGenItemId,
            genItemInventoryId: destInv.genItemInventoryId || destInv.id,
            roomId: destRoomId,
            status: 'good'
          }));
          await db.GenItem.bulkCreate(units, { transaction: t });
        }
      }

      if (item.id) {
        item.status = 'fulfilled';
        await item.save({ transaction: t });
      }
    }

    // finally mark request fulfilled
    reqRow.status = 'fulfilled';
    reqRow.fulfilledBy = String(user?.accountId ?? user?.id ?? '');
    reqRow.fulfilledAt = new Date();
    await reqRow.save({ transaction: t });

    return reqRow;
  });

  try {
    await accountService.logActivity(
      String(user?.accountId ?? user?.id ?? ''),
      'item_request_fulfill',
      ipAddress,
      browserInfo,
      `requestId:${result.itemRequestId}`
    );
  } catch (err) { console.error('activity log failed (fulfillItemRequest)', err); }

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
      roomId: inv.roomId,
      apparelInventoryId: inv.apparelInventoryId ?? inv.id,
      releasedBy: releaserLabel,
      claimedBy: requesterName,
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
        roomId: inv.roomId,
        adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id,
        releasedBy: releaserLabel,
        claimedBy: requesterName,
        releaseAdminSupplyQuantity: qty
      }, tx);
    } else {
      release = { note: 'AdminSupply released (no ReleaseAdminSupply model)', inventoryId: inv.adminSupplyInventoryId ?? inv.id, qty };
    }

    inv.totalQuantity = (inv.totalQuantity || 0) - qty;
    await inv.save(tx);

    if (db.AdminSupply && qty > 0) {
      const units = await db.AdminSupply.findAll({
        where: { adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id, status: 'good' },
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
      roomId: inv.roomId,
      genItemInventoryId: inv.genItemInventoryId ?? inv.id,
      releasedBy: releaserLabel,
      claimedBy: requesterName,
      releaseItemQuantity: qty,
      genItemType: inv.genItemType
    }, tx);

    inv.totalQuantity = (inv.totalQuantity || 0) - qty;
    await inv.save(tx);

    if (db.GenItem && qty > 0) {
      const units = await db.GenItem.findAll({
        where: { genItemInventoryId: inv.genItemInventoryId ?? inv.id, status: 'good' },
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
    { key: 'supply', model: db.AdminSupplyInventory },
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

async function resolveInventoryFromUnit({ type, unit }) {
  if (!unit) return null;
  if (type === 'apparel' && unit.apparelInventoryId) return await db.ApparelInventory.findByPk(unit.apparelInventoryId);
  if (type === 'supply' && unit.adminSupplyInventoryId) return await db.AdminSupplyInventory.findByPk(unit.adminSupplyInventoryId);
  if (type === 'genitem' && unit.genItemInventoryId) return await db.GenItemInventory.findByPk(unit.genItemInventoryId);
  return null;
}

function getInventoryModel(itemType) {
  const t = String(itemType || '').toLowerCase();
  if (t === 'apparel') return db.ApparelInventory;
  if (t === 'supply' || t === 'admin supply' || t === 'admin-supply') return db.AdminSupplyInventory;
  if (t === 'genitem' || t === 'genitem' || t === 'gen item' || t === 'it' || t === 'maintenance') return db.GenItemInventory;
  return null;
}

async function _loadRequestedItem(itemId, itemTypeRaw) {
  if (!itemId) return null;
  const typeNorm = String(itemTypeRaw || '').toLowerCase();

  const invModel = getInventoryModel(itemTypeRaw);
  if (invModel) {
    const inv = await invModel.findByPk(itemId);
    if (inv) return { kind: 'inventory', type: typeNorm || 'unknown', inventory: inv, unit: null };
  }

  const unitResult = await _tryLoadUnitByType(itemId, typeNorm);
  if (unitResult) return unitResult;

  return await _tryLoadAnyUnit(itemId);
}

async function _tryLoadUnitByType(itemId, typeNorm) {
  try {
    if (typeNorm.includes('apparel')) {
      if (db.Apparel) {
        const unit = await db.Apparel.findByPk(itemId);
        if (unit) {
          const inv = await resolveInventoryFromUnit({ type: 'apparel', unit }).catch(() => null);
          return { kind: 'unit', type: 'apparel', unit, inventory: inv || null };
        }
      }
    } else if (typeNorm.includes('supply')) {
      if (db.AdminSupply) {
        const unit = await db.AdminSupply.findByPk(itemId);
        if (unit) {
          const inv = await resolveInventoryFromUnit({ type: 'supply', unit }).catch(() => null);
          return { kind: 'unit', type: 'supply', unit, inventory: inv || null };
        }
      }
    } else if (typeNorm.includes('gen') || typeNorm === 'it' || typeNorm === 'maintenance') {
      if (db.GenItem) {
        const unit = await db.GenItem.findByPk(itemId);
        if (unit) {
          const inv = await resolveInventoryFromUnit({ type: 'genitem', unit }).catch(() => null);
          return { kind: 'unit', type: 'genitem', unit, inventory: inv || null };
        }
      }
    }
  } catch (e) { console.error('_tryLoadUnitByType failed', e); }
  return null;
}

async function _tryLoadAnyUnit(itemId) {
  const checks = [
    { model: db.Apparel, type: 'apparel' },
    { model: db.AdminSupply, type: 'supply' },
    { model: db.GenItem, type: 'genitem' }
  ];
  for (const c of checks) {
    if (!c.model) continue;
    const unit = await c.model.findByPk(itemId);
    if (unit) {
      const inv = await resolveInventoryFromUnit({ type: c.type, unit }).catch(() => null);
      return { kind: 'unit', type: c.type, unit, inventory: inv || null };
    }
  }
  return null;
}