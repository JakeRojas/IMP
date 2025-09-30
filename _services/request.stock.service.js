const db = require('_helpers/db-handler');

module.exports = {
  createStockRequest,
  listStockRequests,
  getStockRequestById,
  approveStockRequest,
  disapproveStockRequest,
  fulfillStockRequest
};

async function createStockRequest({ acccountId, requesterRoomId = null, itemId = null, itemType = 'apparel', quantity = 1, note = null }) {
  if (!acccountId) throw { status: 400, message: 'acccountId is required' };
  if (!['apparel','supply','genItem'].includes(itemType)) throw { status: 400, message: 'invalid itemType' };
  if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be a positive integer' };

  // optional existence check: try to find an inventory or unit
  if (itemId) {
    const model = getInventoryModel(itemType);
    if (model) {
      const found = await model.findByPk(itemId);
      if (!found) throw { status: 400, message: `${itemType} id ${itemId} not found` };
    }
  }

  const req = await db.StockRequest.create({
    acccountId, requesterRoomId, itemId, itemType, quantity, note, status: 'pending'
  });

  return req;
}

async function listStockRequests({ where = {}, limit = 100, offset = 0 } = {}) {
  return await db.StockRequest.findAll({
    where,
    order: [['stockRequestId','DESC']],
    limit,
    offset
  });
}

async function getStockRequestById(stockRequestId) {
  const r = await db.StockRequest.findByPk(stockRequestId);
  if (!r) throw { status: 404, message: 'StockRequest not found' };

  // attach requested item details (inventory OR unit + resolved inventory)
  try {
    const requestedItem = await _loadRequestedItem(r.itemId, r.itemType);
    if (typeof r.setDataValue === 'function') r.setDataValue('requestedItem', requestedItem);
    else r.requestedItem = requestedItem;
  } catch (err) {
    // don't fail the whole request when item lookup fails; log for debugging.
    console.error('getStockRequestById - requested item load failed:', err);
    if (typeof r.setDataValue === 'function') r.setDataValue('requestedItem', null);
    else r.requestedItem = null;
  }

  return r;
}


async function approveStockRequest(id, approverAccountId = null) {
  const req = await getStockRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be approved' };
  req.status = 'approved';
  // optionally: req.approvedBy = approverAccountId; req.approvedAt = new Date(); (add columns if desired)
  await req.save();
  return req;
}

async function disapproveStockRequest(id, adminAccountId = null, reason = null) {
  const req = await getStockRequestById(id);
  if (req.status !== 'pending') throw { status: 400, message: 'Only pending requests can be disapproved' };
  req.status = 'disapproved';
  if (reason) req.note = (req.note ? req.note + ' | ' : '') + `Disapproved: ${reason}`;
  await req.save();
  return req;
}

async function fulfillStockRequest(stockRequestId, fulfillerAccountId) {
  const req = await db.StockRequest.findByPk(stockRequestId);
  if (!req) throw { status: 404, message: 'StockRequest not found' };
  if (req.status !== 'approved') throw { status: 400, message: 'Only approved requests can be fulfilled' };

  const found = await findInventoryAndType(req.itemId);
  if (!found || (!found.inv && !found.unit)) {
    req.status = 'failed_request';
    await req.save();
    throw { status: 404, message: 'Could not locate inventory item to fulfill request; marked as failed' };
  }

  const qty = parseInt(req.quantity || 0, 10);
  if (!Number.isInteger(qty) || qty <= 0) throw { status: 400, message: 'Invalid request quantity' };

  try {
    // create the Receive batch and the per-unit rows
    const createdBatch = await createReceiveAndUnits(found, qty, fulfillerAccountId || req.acccountId || 0);

    // update inventory aggregate (increase by qty)
    if (found.inv) await updateInventory(found.inv, qty);
    else {
      // attempt to resolve inventory if we only had a unit
      if (found.unit) {
        const inv = await resolveInventoryFromUnit(found);
        if (inv) await updateInventory(inv, qty);
      }
    }

    req.status = 'fulfilled';
    await req.save();

    return { request: req, createdBatch };
  } catch (err) {
    // ensure request is marked failed if something went wrong during fulfillment
    if (req.status !== 'failed_request' && req.status !== 'fulfilled') {
      req.status = 'failed_request';
      await req.save();
    }
    throw err;
  }
}

/* ---------- Helpers (kept local for drop-in) ---------- */

async function findInventoryAndType(id) {
  if (!id) return null;

  // try inventory aggregates first
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

  // fallback: maybe it's a unit id (Apparel/AdminSupply/GenItem)
  if (db.Apparel) {
    const u = await db.Apparel.findByPk(id);
    if (u) return { type: 'apparel', unit: u };
  }
  if (db.AdminSupply) {
    const u = await db.AdminSupply.findByPk(id);
    if (u) return { type: 'supply', unit: u };
  }
  if (db.GenItem) {
    const u = await db.GenItem.findByPk(id);
    if (u) return { type: 'genitem', unit: u };
  }

  return null;
}

async function resolveInventoryFromUnit(found) {
  // If we only have a unit, load its inventory FK (common field names used in your project)
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
  // Apparel model enum: 'released','damaged','lost','good' -> use 'good'
  // AdminSupply and GenItem use free-form STRING default 'in_stock' -> use 'in_stock'
  if (type === 'apparel') return 'good';
  if (type === 'supply') return 'in_stock';
  if (type === 'genitem') return 'in_stock';
  return 'in_stock';
}

async function createReceiveAndUnits(found, qty, fulfillerAccountId) {
  // Returns created batch row. Creates per-unit rows if unit model exists.
  if (found.type === 'apparel') {
    const inv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!inv) throw { status: 404, message: 'Apparel inventory record not found' };

    const batch = await db.ReceiveApparel.create({
      roomId:          inv.roomId,
      receivedFrom:    'Administration',
      receivedBy:      fulfillerAccountId,
      apparelName:     inv.apparelName,
      apparelLevel:    inv.apparelLevel,
      apparelType:     inv.apparelType,
      apparelFor:      inv.apparelFor,
      apparelSize:     inv.apparelSize,
      apparelQuantity: qty
    });

    const unitStatus = getUnitStatusForType(found.type);

// apparel units example
if (db.Apparel && qty > 0) {
  const apparelUnits = Array(qty).fill().map(() => ({
    receiveApparelId: batch.receiveApparelId,
    apparelInventoryId: inv.apparelInventoryId ?? inv.id,
    roomId: inv.roomId,
    status: unitStatus   // <-- use mapping
  }));
  await db.Apparel.bulkCreate(apparelUnits);
}

    return batch;
  }

  if (found.type === 'supply') {
    const inv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!inv) throw { status: 404, message: 'AdminSupply inventory record not found' };

    const batch = await db.ReceiveAdminSupply.create({
      roomId:        inv.roomId,
      receivedFrom:  'Administration',
      receivedBy:    fulfillerAccountId,
      supplyName:    inv.supplyName,
      supplyQuantity: qty,
      supplyMeasure: inv.supplyMeasure
    });

    if (db.AdminSupply && qty > 0) {
      const units = Array(qty).fill().map(() => ({
        receiveAdminSupplyId: batch.receiveAdminSupplyId,
        adminSupplyInventoryId: inv.adminSupplyInventoryId ?? inv.id,
        roomId: inv.roomId,
        status: 'in_stock'
      }));
      await db.AdminSupply.bulkCreate(units);
    }

    return batch;
  }

  if (found.type === 'genitem') {
    const inv = found.inv || (found.unit ? await resolveInventoryFromUnit(found) : null);
    if (!inv) throw { status: 404, message: 'GenItem inventory record not found' };

    const batch = await db.ReceiveGenItem.create({
      roomId:         inv.roomId,
      receivedFrom:   'Administration',
      receivedBy:     fulfillerAccountId,
      genItemName:    inv.genItemName,
      genItemSize:    inv.genItemSize ?? null,
      genItemQuantity: qty,
      genItemType:    inv.genItemType
    });

    if (db.GenItem && qty > 0) {
      const units = Array(qty).fill().map(() => ({
        receiveGenItemId: batch.receiveGenItemId,
        roomId: inv.roomId,
        status: 'in_stock'
      }));
      await db.GenItem.bulkCreate(units);
    }

    return batch;
  }

  throw { status: 500, message: 'Unsupported inventory type' };
}

async function updateInventory(inv, qty) {
  // update the aggregate totalQuantity field (safe against different column names)
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

  // If none of the expected fields are present, throw so caller can mark failed_request.
  throw { status: 500, message: 'Inventory does not have known quantity field' };
}

function getInventoryModel(itemType) {
  // your models use: ApparelInventory, AdminSupplyInventory, GenItemInventory (see _models)
  if (itemType === 'apparel') return db.ApparelInventory || null;
  if (itemType === 'supply') return db.AdminSupplyInventory || null;
  if (itemType === 'genItem') return db.GenItemInventory || null;
  return null;
}



async function _loadRequestedItem(itemId, itemTypeRaw) {
  if (!itemId) return null;

  // normalize label for 'type' only (for returned object)
  const typeNorm = String(itemTypeRaw || '').toLowerCase();

  // 1) prefer inventory aggregate (uses your existing helper)
  const invModel = getInventoryModel(itemTypeRaw);
  if (invModel) {
    const inv = await invModel.findByPk(itemId);
    if (inv) return { kind: 'inventory', type: typeNorm || 'unknown', inventory: inv, unit: null };
  }

  // 2) try unit model by type
  const unitResult = await _tryLoadUnitByType(itemId, typeNorm);
  if (unitResult) return unitResult;

  // 3) fallback: try all unit models (best-effort)
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
    // bubble up (will be caught by caller)
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