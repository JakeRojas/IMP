const db = require('_helpers/db-handler');
const accountService = require('_services/account.service');

module.exports = {
  createStockRequest,
  listStockRequests,
  getStockRequestById,
  approveStockRequest,
  disapproveStockRequest,
  fulfillStockRequest
};

async function createStockRequest({ accountId, requesterRoomId, itemId, otherItemName, quantity = 1, note = null, ipAddress, browserInfo }) {
  if (!accountId) throw { status: 400, message: 'accountId is required' };
  if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be a positive integer' };

  // determine itemType by checking inventory tables first, then unit tables
  let resolvedType = null;

  if (itemId) {
    // helper short-circuit checks (check inventories)
    if (db.ApparelInventory) {
      const inv = await db.ApparelInventory.findByPk(itemId);
      if (inv) resolvedType = 'apparel';
    }
    if (!resolvedType && db.AdminSupplyInventory) {
      const inv = await db.AdminSupplyInventory.findByPk(itemId);
      if (inv) resolvedType = 'supply';
    }
    if (!resolvedType && db.GenItemInventory) {
      const inv = await db.GenItemInventory.findByPk(itemId);
      if (inv) resolvedType = 'genItem';
    }

    // if not inventory, check unit tables (individual items/units)
    if (!resolvedType) {
      if (db.Apparel) {
        const unit = await db.Apparel.findByPk(itemId);
        if (unit) resolvedType = 'apparel';
      }
      if (!resolvedType && db.AdminSupply) {
        const unit = await db.AdminSupply.findByPk(itemId);
        if (unit) resolvedType = 'supply';
      }
      if (!resolvedType && db.GenItem) {
        const unit = await db.GenItem.findByPk(itemId);
        if (unit) resolvedType = 'genItem';
      }
    }

    if (!resolvedType) {
      throw { status: 400, message: `Item id ${itemId} not found in inventories or units` };
    }
  } else if (otherItemName) {
    resolvedType = 'other';
  } else {
    throw { status: 400, message: 'Must provide either itemId or otherItemName' };
  }

  // create stock request — store the resolved itemType for downstream flows
  const req = await db.StockRequest.create({
    accountId,
    requesterRoomId,
    itemType: resolvedType,
    itemId: itemId || null,
    otherItemName: otherItemName || null,
    quantity,
    note,
    status: 'pending'
  });

  try {
    await accountService.logActivity(String(accountId), 'stock_request_create', ipAddress, browserInfo, `stockRequestId:${req.stockRequestId}`);
  } catch (err) {
    console.error('activity log failed (createStockRequest)', err);
  }

  return req;
}
async function listStockRequests({ where = {}, limit = 100, offset = 0 } = {}) {
  const { count, rows } = await db.StockRequest.findAndCountAll({
    where,
    order: [['stockRequestId', 'DESC']],
    limit,
    offset,
    include: [
      { model: db.Room, attributes: ['roomId', 'roomName'] },
      { model: db.Account, attributes: ['accountId', 'firstName', 'lastName'] }
    ]
  });
  return { rows, count };
}
async function getStockRequestById(stockRequestId) {
  const r = await db.StockRequest.findByPk(stockRequestId, {
    include: [{
      model: db.Account,
      attributes: ['accountId', 'firstName', 'lastName']
    }]
  });
  if (!r) throw { status: 404, message: 'StockRequest not found' };

  try {
    const requestedItem = await _loadRequestedItem(r.itemId, r.itemType);
    if (typeof r.setDataValue === 'function') r.setDataValue('requestedItem', requestedItem);
    else r.requestedItem = requestedItem;
  } catch (err) {
    console.error('getStockRequestById - requested item load failed:', err);
    if (typeof r.setDataValue === 'function') r.setDataValue('requestedItem', null);
    else r.requestedItem = null;
  }

  return r;
}
// async function approveStockRequest(id, approverAccountId = null, ipAddress, browserInfo) {
//   const req = await getStockRequestById(id);
//   if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be approved' };
//   req.status = 'approved';
//   await req.save();

//   try {
//     await accountService.logActivity( String(approverAccountId), 'stock_request_approve', ipAddress, browserInfo, `stockRequestId:${req.stockRequestId}`);
//   } catch (err) {
//     console.error('activity log failed (approveStockRequest)', err);
//   }

//   return req;
// }
async function approveStockRequest(id, approverAccountId = null, ipAddress, browserInfo, updatedQuantity = null) {
  const req = await getStockRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be approved' };

  // [NEW] Update quantity if valid
  if (updatedQuantity !== null && updatedQuantity !== undefined) {
    const qty = parseInt(updatedQuantity, 10);
    if (Number.isInteger(qty) && qty > 0) {
      req.quantity = qty;
    }
  }
  req.status = 'approved';
  await req.save();
  try {
    // ... existing logging
    await accountService.logActivity(String(approverAccountId), 'stock_request_approve', ipAddress, browserInfo, `stockRequestId:${req.stockRequestId}`);
  } catch (err) {
    console.error('activity log failed (approveStockRequest)', err);
  }
  return req;
}
async function disapproveStockRequest(id, adminAccountId = null, reason = null, ipAddress, browserInfo) {
  const req = await getStockRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be disapproved' };
  req.status = 'disapproved';
  if (reason) req.note = (req.note ? req.note + ' | ' : '') + `Disapproved: ${reason}`;
  await req.save();

  try {
    await accountService.logActivity(String(adminAccountId), 'stock_request_disapprove', ipAddress, browserInfo, `stockRequestId:${req.stockRequestId || req.id}${reason ? `, reason:${reason}` : ''}`);
  } catch (err) {
    console.error('activity log failed (disapproveStockRequest)', err);
  }

  return req;
}
async function fulfillStockRequest(stockRequestId, fulfillerAccountId, ipAddress, browserInfo) {
  const req = await db.StockRequest.findByPk(stockRequestId);
  if (!req) throw { status: 404, message: 'StockRequest not found' };
  if (req.status !== 'approved') throw { status: 400, message: 'Only approved requests can be fulfilled' };

  let found = null;
  if (req.itemType === 'other' || (!req.itemId && req.otherItemName)) {
    const otherName = req.otherItemName || 'Unspecified Item';
    const roomId = req.requesterRoomId;

    if (!roomId) throw { status: 400, message: 'Requester room ID is missing; cannot fulfill request' };

    // Try to find if a GenItemInventory already exists with this name in this room
    let inv = await db.GenItemInventory.findOne({ where: { genItemName: otherName, roomId: roomId } });
    if (!inv) {
      inv = await db.GenItemInventory.create({
        roomId: roomId,
        genItemName: otherName,
        genItemType: 'unknownType',
        totalQuantity: 0
      });
    }
    found = { type: 'genitem', inv: inv };
  } else {
    found = await findInventoryAndType(req.itemId, req.itemType);
  }

  if (!found || (!found.inv && !found.unit)) {
    req.status = 'failed_request';
    await req.save();
    throw { status: 404, message: 'Could not locate inventory item to fulfill request; marked as failed' };
  }

  const qty = parseInt(req.quantity || 0, 10);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid request quantity' };

  try {
    const createdBatch = await createReceiveAndUnits(found, qty, fulfillerAccountId || req.acccountId || 0);

    if (found.inv) await updateInventory(found.inv, qty);
    else {
      if (found.unit) {
        const inv = await resolveInventoryFromUnit(found);
        if (inv) await updateInventory(inv, qty);
      }
    }

    req.status = 'fulfilled';
    await req.save();

    try {
      await accountService.logActivity(String(fulfillerAccountId), 'stock_request_fulfill', ipAddress, browserInfo, `stockRequestId:${req.stockRequestId}`);
    } catch (err) {
      console.error('activity log failed (fulfillStockRequest - log)', err);
    }

    return { request: req, createdBatch };
  } catch (err) {
    if (req.status !== 'failed_request' && req.status !== 'fulfilled') {
      req.status = 'failed_request';
      await req.save();
    }
    throw err;
  }
}

/* ---------- Helpers (kept local for drop-in) ---------- */
async function findInventoryAndType(id, preferredType) {
  if (!id) return null;

  const normalizeType = t => (typeof t === 'string' ? String(t).toLowerCase() : t);

  if (preferredType) {
    const pref = normalizeType(preferredType);
    const model = getInventoryModel(pref === 'genitem' ? 'genItem' : pref);
    if (model) {
      const inv = await model.findByPk(id);
      if (inv) return { type: pref, inv };
    }
    if (pref === 'apparel' && db.Apparel) {
      const u = await db.Apparel.findByPk(id);
      if (u) {
        const inv = await resolveInventoryFromUnit({ type: 'apparel', unit: u }).catch(() => null);
        return { type: 'apparel', unit: u, inv: inv || null };
      }
    }
    if ((pref === 'supply' || pref === 'admin-supply') && db.AdminSupply) {
      const u = await db.AdminSupply.findByPk(id);
      if (u) {
        const inv = await resolveInventoryFromUnit({ type: 'supply', unit: u }).catch(() => null);
        return { type: 'supply', unit: u, inv: inv || null };
      }
    }
    if ((pref === 'genitem' || pref === 'it' || pref === 'maintenance') && db.GenItem) {
      const u = await db.GenItem.findByPk(id);
      if (u) {
        const inv = await resolveInventoryFromUnit({ type: 'genitem', unit: u }).catch(() => null);
        return { type: 'genitem', unit: u, inv: inv || null };
      }
    }
  }

  if (db.ApparelInventory) {
    const inv = await db.ApparelInventory.findByPk(id);
    if (inv) return { type: 'apparel', inv };
  }
  if (db.AdminSupplyInventory) {
    const inv = await db.AdminSupplyInventory.findByPk(id);
    if (inv) return { type: 'supply', inv };
  }
  if (db.GenItemInventory) {
    const inv = await db.GenItemInventory.findByPk(id);
    if (inv) return { type: 'genitem', inv };
  }

  if (db.Apparel) {
    const u = await db.Apparel.findByPk(id);
    if (u) {
      const inv = await resolveInventoryFromUnit({ type: 'apparel', unit: u }).catch(() => null);
      return { type: 'apparel', unit: u, inv: inv || null };
    }
  }
  if (db.AdminSupply) {
    const u = await db.AdminSupply.findByPk(id);
    if (u) {
      const inv = await resolveInventoryFromUnit({ type: 'supply', unit: u }).catch(() => null);
      return { type: 'supply', unit: u, inv: inv || null };
    }
  }
  if (db.GenItem) {
    const u = await db.GenItem.findByPk(id);
    if (u) {
      const inv = await resolveInventoryFromUnit({ type: 'genitem', unit: u }).catch(() => null);
      return { type: 'genitem', unit: u, inv: inv || null };
    }
  }

  return null;
}
async function resolveInventoryFromUnit(found) {
  try {
    if (found.type === 'apparel' && found.unit.apparelInventoryId) {
      return await db.ApparelInventory.findByPk(found.unit.apparelInventoryId);
    }
    if (found.type === 'supply' && found.unit.adminSupplyInventoryId) {
      return await db.AdminSupplyInventory.findByPk(found.unit.adminSupplyInventoryId);
    }
    if (found.type === 'genitem' && found.unit.genItemInventoryId) {
      return await db.GenItemInventory.findByPk(found.unit.genItemInventoryId);
    }
  } catch (e) {
    return null;
  }
  return null;
}
function getUnitStatusForType(type) {
  // Models now use ENUM('good', 'working', 'damage')
  return 'good';
}
async function createReceiveAndUnits(found, qty, fulfillerAccountId) {
  if (found.type === 'apparel') {
    const inv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!inv) throw { status: 404, message: 'Apparel inventory record not found' };

    const batch = await db.ReceiveApparel.create({
      roomId: inv.roomId,
      receivedFrom: 'Administration',
      receivedBy: fulfillerAccountId,
      apparelName: inv.apparelName,
      apparelLevel: inv.apparelLevel,
      apparelType: inv.apparelType,
      apparelFor: inv.apparelFor,
      apparelSize: inv.apparelSize,
      apparelQuantity: qty
    });

    const unitStatus = getUnitStatusForType(found.type);

    if (db.Apparel && qty > 0) {
      const apparelUnits = Array(qty).fill().map(() => ({
        receiveApparelId: batch.receiveApparelId,
        apparelInventoryId: inv.apparelInventoryId ?? inv.id,
        roomId: inv.roomId,
        status: unitStatus
      }));
      await db.Apparel.bulkCreate(apparelUnits);
    }

    return batch;
  }

  if (found.type === 'supply') {
    const inv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!inv) throw { status: 404, message: 'AdminSupply inventory record not found' };

    const batch = await db.ReceiveAdminSupply.create({
      roomId: inv.roomId,
      receivedFrom: 'Administration',
      receivedBy: fulfillerAccountId,
      supplyName: inv.supplyName,
      supplyQuantity: qty,
      supplyMeasure: inv.supplyMeasure
    });

    if (db.AdminSupply && qty > 0) {
      const unitsStatus = getUnitStatusForType('supply');
      const units = Array(qty).fill().map(() => ({
        receiveAdminSupplyId: batch.receiveAdminSupplyId,
        adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id,
        roomId: inv.roomId,
        status: unitsStatus
      }));
      await db.AdminSupply.bulkCreate(units);
    }

    return batch;
  }

  if (found.type === 'genitem') {
    const inv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!inv) throw { status: 404, message: 'GenItem inventory record not found' };

    const batch = await db.ReceiveGenItem.create({
      roomId: inv.roomId,
      receivedFrom: 'Administration',
      receivedBy: fulfillerAccountId,
      genItemName: inv.genItemName,
      genItemSize: inv.genItemSize ?? null,
      genItemQuantity: qty,
      genItemType: inv.genItemType
    });

    if (db.GenItem && qty > 0) {
      const unitsStatus = getUnitStatusForType('genitem');
      const units = Array(qty).fill().map(() => ({
        receiveGenItemId: batch.receiveGenItemId,
        genItemInventoryId: inv.genItemInventoryId ?? inv.id,
        roomId: inv.roomId,
        status: unitsStatus
      }));
      await db.GenItem.bulkCreate(units);
    }

    return batch;
  }

  throw { status: 500, message: 'Unsupported inventory type' };
}
async function updateInventory(inv, qty) {
  if (!inv) return;
  if (typeof inv.totalQuantity !== 'undefined') {
    inv.totalQuantity = (inv.totalQuantity || 0) + qty;
    await inv.save();
    return;
  }
  if (typeof inv.supplyQuantity !== 'undefined') {
    inv.supplyQuantity = (inv.supplyQuantity || 0) + qty;
    await inv.save();
    return;
  }
  if (typeof inv.quantity !== 'undefined') {
    inv.quantity = (inv.quantity || 0) + qty;
    await inv.save();
    return;
  }

  throw { status: 500, message: 'Inventory does not have known quantity field' };
}
function getInventoryModel(itemType) {
  if (itemType === 'apparel') return db.ApparelInventory;
  if (itemType === 'supply') return db.AdminSupplyInventory;
  if (itemType === 'genItem') return db.GenItemInventory;
  return;
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
    } else if (typeNorm.includes('supply') || typeNorm === 'supply') {
      if (db.AdminSupply) {
        const unit = await db.AdminSupply.findByPk(itemId);
        if (unit) {
          const inv = await resolveInventoryFromUnit({ type: 'supply', unit }).catch(() => null);
          return { kind: 'unit', type: 'supply', unit, inventory: inv || null };
        }
      }
    } else if (typeNorm.includes('gen') || typeNorm === 'genitem' || typeNorm === 'gen-item') {
      if (db.GenItem) {
        const unit = await db.GenItem.findByPk(itemId);
        if (unit) {
          const inv = await resolveInventoryFromUnit({ type: 'genitem', unit }).catch(() => null);
          return { kind: 'unit', type: 'genitem', unit, inventory: inv || null };
        }
      }
    }
  } catch (e) {
    throw e;
  }
  return null;
}
async function _tryLoadAnyUnit(itemId) {
  // Apparel
  if (db.Apparel) {
    const unit = await db.Apparel.findByPk(itemId);
    if (unit) {
      const inv = await resolveInventoryFromUnit({ type: 'apparel', unit }).catch(() => null);
      return { kind: 'unit', type: 'apparel', unit, inventory: inv || null };
    }
  }

  // AdminSupply
  if (db.AdminSupply) {
    const unit = await db.AdminSupply.findByPk(itemId);
    if (unit) {
      const inv = await resolveInventoryFromUnit({ type: 'supply', unit }).catch(() => null);
      return { kind: 'unit', type: 'supply', unit, inventory: inv || null };
    }
  }

  // GenItem
  if (db.GenItem) {
    const unit = await db.GenItem.findByPk(itemId);
    if (unit) {
      const inv = await resolveInventoryFromUnit({ type: 'genitem', unit }).catch(() => null);
      return { kind: 'unit', type: 'genitem', unit, inventory: inv || null };
    }
  }

  return null;
}