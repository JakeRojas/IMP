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
  const rid = Number(stockRequestId);
  if (!Number.isFinite(rid) || rid <= 0) throw { status: 400, message: 'Invalid stock request id' };

  const result = await db.sequelize.transaction(async (t) => {
    const req = await db.StockRequest.findByPk(rid, { transaction: t, lock: t.LOCK.UPDATE });
    if (!req) throw { status: 404, message: 'StockRequest not found' };
    if (req.status !== 'approved') throw { status: 400, message: 'Only approved requests can be fulfilled' };

    const qty = parseInt(req.quantity || 0, 10);
    if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid request quantity' };

    const destRoomId = req.requesterRoomId;
    if (!destRoomId) throw { status: 400, message: 'Requester room ID is missing; cannot fulfill request' };

    const room = await db.Room.findByPk(destRoomId, { transaction: t });
    if (!room) throw { status: 400, message: 'Requester room not found' };

    // 1. Resolve effective item type and metadata
    let effectiveType = req.itemType;
    let metadata = null;

    if (req.itemType === 'other' || (!req.itemId && req.otherItemName)) {
      // Resolve category from room's stockroomType
      const srt = String(room.stockroomType || '').toLowerCase();
      if (srt === 'apparel') effectiveType = 'apparel';
      else if (srt === 'supply') effectiveType = 'supply';
      else effectiveType = 'genitem';

      metadata = {
        name: req.otherItemName || 'Unspecified Item'
      };
    } else {
      const found = await findInventoryAndType(req.itemId, req.itemType, { transaction: t });
      if (!found || (!found.inv && !found.unit)) {
        req.status = 'failed_request';
        await req.save({ transaction: t });
        throw { status: 404, message: 'Could not locate source inventory/item details to fulfill request' };
      }
      effectiveType = found.type;
      const itemData = found.inv || found.unit;

      // Normalize metadata based on type
      if (effectiveType === 'apparel') {
        metadata = {
          name: itemData.apparelName || itemData.name,
          level: itemData.apparelLevel,
          type: itemData.apparelType,
          for: itemData.apparelFor,
          size: itemData.apparelSize
        };
      } else if (effectiveType === 'supply') {
        metadata = {
          name: itemData.supplyName || itemData.name,
          measure: itemData.supplyMeasure
        };
      } else {
        metadata = {
          name: itemData.genItemName || itemData.name,
          size: itemData.genItemSize,
          type: itemData.genItemType || 'unknownType'
        };
      }
    }

    // 2. Find or Create Inventory and Batch
    let createdBatch = null;
    if (effectiveType === 'apparel') {
      const where = {
        roomId: destRoomId,
        apparelName: metadata.name,
        apparelLevel: metadata.level || 'Unknown',
        apparelType: metadata.type || 'Unknown',
        apparelFor: metadata.for || 'Unknown',
        apparelSize: metadata.size || 'Unknown'
      };
      const [inv] = await db.ApparelInventory.findOrCreate({ where, defaults: { ...where, totalQuantity: 0 }, transaction: t });
      inv.totalQuantity = (inv.totalQuantity || 0) + qty;
      await inv.save({ transaction: t });

      createdBatch = await db.ReceiveApparel.create({
        roomId: destRoomId,
        receivedFrom: 'Administration (Stock Request)',
        receivedBy: fulfillerAccountId || req.accountId,
        apparelName: inv.apparelName,
        apparelLevel: inv.apparelLevel,
        apparelType: inv.apparelType,
        apparelFor: inv.apparelFor,
        apparelSize: inv.apparelSize,
        apparelQuantity: qty
      }, { transaction: t });

      if (db.Apparel && qty > 0) {
        const units = Array(qty).fill().map(() => ({
          receiveApparelId: createdBatch.receiveApparelId,
          apparelInventoryId: inv.apparelInventoryId || inv.id,
          roomId: destRoomId,
          status: 'good'
        }));
        await db.Apparel.bulkCreate(units, { transaction: t });
      }
    } else if (effectiveType === 'supply') {
      const where = {
        roomId: destRoomId,
        supplyName: metadata.name,
        supplyMeasure: metadata.measure || 'Unknown'
      };
      const [inv] = await db.AdminSupplyInventory.findOrCreate({ where, defaults: { ...where, totalQuantity: 0 }, transaction: t });
      inv.totalQuantity = (inv.totalQuantity || 0) + qty;
      await inv.save({ transaction: t });

      createdBatch = await db.ReceiveAdminSupply.create({
        roomId: destRoomId,
        receivedFrom: 'Administration (Stock Request)',
        receivedBy: fulfillerAccountId || req.accountId,
        supplyName: inv.supplyName,
        supplyQuantity: qty,
        supplyMeasure: inv.supplyMeasure
      }, { transaction: t });

      if (db.AdminSupply && qty > 0) {
        const units = Array(qty).fill().map(() => ({
          receiveAdminSupplyId: createdBatch.receiveAdminSupplyId,
          adminSupplyInventoryId: inv.adminSupplyInventoryId || inv.id,
          roomId: destRoomId,
          status: 'good'
        }));
        await db.AdminSupply.bulkCreate(units, { transaction: t });
      }
    } else {
      // genItem
      const where = {
        roomId: destRoomId,
        genItemName: metadata.name,
        genItemSize: metadata.size || null,
        genItemType: metadata.type || 'unknownType'
      };
      const [inv] = await db.GenItemInventory.findOrCreate({ where, defaults: { ...where, totalQuantity: 0 }, transaction: t });
      inv.totalQuantity = (inv.totalQuantity || 0) + qty;
      await inv.save({ transaction: t });

      createdBatch = await db.ReceiveGenItem.create({
        roomId: destRoomId,
        receivedFrom: 'Administration (Stock Request)',
        receivedBy: fulfillerAccountId || req.accountId,
        genItemName: inv.genItemName,
        genItemSize: inv.genItemSize || null,
        genItemQuantity: qty,
        genItemType: inv.genItemType
      }, { transaction: t });

      if (db.GenItem && qty > 0) {
        const units = Array(qty).fill().map(() => ({
          receiveGenItemId: createdBatch.receiveGenItemId,
          genItemInventoryId: inv.genItemInventoryId || inv.id,
          roomId: destRoomId,
          status: 'good'
        }));
        await db.GenItem.bulkCreate(units, { transaction: t });
      }
    }

    req.status = 'fulfilled';
    await req.save({ transaction: t });

    return { request: req, createdBatch };
  });

  try {
    await accountService.logActivity(String(fulfillerAccountId), 'stock_request_fulfill', ipAddress, browserInfo, `stockRequestId:${result.request.stockRequestId}`);
  } catch (err) {
    console.error('activity log failed (fulfillStockRequest - log)', err);
  }

  return result;
}

/* ---------- Helpers (kept local for drop-in) ---------- */
async function findInventoryAndType(id, preferredType, options = {}) {
  if (!id) return null;
  const tOpt = options.transaction ? { transaction: options.transaction } : {};

  const normalizeType = t => (typeof t === 'string' ? String(t).toLowerCase() : t);

  if (preferredType) {
    const pref = normalizeType(preferredType);
    const model = getInventoryModel(pref === 'genitem' ? 'genItem' : pref);
    if (model) {
      const inv = await model.findByPk(id, tOpt);
      if (inv) return { type: pref === 'genitem' ? 'genitem' : pref, inv };
    }
    if (pref === 'apparel' && db.Apparel) {
      const u = await db.Apparel.findByPk(id, tOpt);
      if (u) {
        const inv = await resolveInventoryFromUnit({ type: 'apparel', unit: u }).catch(() => null);
        return { type: 'apparel', unit: u, inv: inv || null };
      }
    }
    if ((pref === 'supply' || pref === 'admin-supply') && db.AdminSupply) {
      const u = await db.AdminSupply.findByPk(id, tOpt);
      if (u) {
        const inv = await resolveInventoryFromUnit({ type: 'supply', unit: u }).catch(() => null);
        return { type: 'supply', unit: u, inv: inv || null };
      }
    }
    if ((pref === 'genitem' || pref === 'it' || pref === 'maintenance') && db.GenItem) {
      const u = await db.GenItem.findByPk(id, tOpt);
      if (u) {
        const inv = await resolveInventoryFromUnit({ type: 'genitem', unit: u }).catch(() => null);
        return { type: 'genitem', unit: u, inv: inv || null };
      }
    }
  }

  if (db.ApparelInventory) {
    const inv = await db.ApparelInventory.findByPk(id, tOpt);
    if (inv) return { type: 'apparel', inv };
  }
  if (db.AdminSupplyInventory) {
    const inv = await db.AdminSupplyInventory.findByPk(id, tOpt);
    if (inv) return { type: 'supply', inv };
  }
  if (db.GenItemInventory) {
    const inv = await db.GenItemInventory.findByPk(id, tOpt);
    if (inv) return { type: 'genitem', inv };
  }

  if (db.Apparel) {
    const u = await db.Apparel.findByPk(id, tOpt);
    if (u) {
      const inv = await resolveInventoryFromUnit({ type: 'apparel', unit: u }).catch(() => null);
      return { type: 'apparel', unit: u, inv: inv || null };
    }
  }
  if (db.AdminSupply) {
    const u = await db.AdminSupply.findByPk(id, tOpt);
    if (u) {
      const inv = await resolveInventoryFromUnit({ type: 'supply', unit: u }).catch(() => null);
      return { type: 'supply', unit: u, inv: inv || null };
    }
  }
  if (db.GenItem) {
    const u = await db.GenItem.findByPk(id, tOpt);
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