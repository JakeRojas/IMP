const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('_helpers/db-handler'); // adjust path if needed

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function filenameFromPayload(stockroomType, payload) {
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 20);
  return `qr-${stockroomType}-${hash}.png`;
}

module.exports = {
  generateBatchQR,
  generateUnitQR,

  releaseUnit
};

async function loadBatchRecord(stockroomType, apparelInventoryId, receiveApparelId, adminSupplyInventoryId, receiveAdminSupplyId) {
  if (stockroomType === 'apparel') {
    return (db.ApparelInventory && await db.ApparelInventory.findByPk(apparelInventoryId))
        || (db.ReceiveApparel && await db.ReceiveApparel.findByPk(receiveApparelId));
  }
  if (stockroomType === 'adminSupply') {
    return (db.AdminSupplyInventory && await db.AdminSupplyInventory.findByPk(adminSupplyInventoryId))
        || (db.ReceiveAdminSupply && await db.ReceiveAdminSupply.findByPk(receiveAdminSupplyId));
  }
  if (db[stockroomType]) return db[stockroomType].findByPk(id);
  return null;
}
async function loadUnitRecord(stockroomType, aparelId, adminSupplyId) {
  if (stockroomType === 'apparel') {
    return (db.Apparel && await db.Apparel.findByPk(aparelId))
  }
  if (stockroomType === 'adminSupply') {
    return (db.AdminSupply && await db.AdminSupply.findByPk(adminSupplyId))
  }
  if (db[stockroomType]) return db[stockroomType].findByPk(id);
  return null;
}
function buildBatchPayloadObject(stockroomType, batch) {
  if (stockroomType === 'apparel') {
    return {
      id:     batch.receiveApparelId  ?? batch.apparelInventoryId ?? null,
      name:   batch.apparelName       ?? batch.name   ?? null,
      size:   batch.apparelSize       ?? batch.size   ?? null,
      level:  batch.apparelLevel      ?? batch.level  ?? null,
      for:    batch.apparelFor        ?? batch.for    ?? null,
      qty:    batch.totalQuantity     ?? batch.qty    ?? null
    };
  }

  if (stockroomType === 'adminSupply') {
    return {
      id:         batch.receiveAdminSupplyId  ?? batch.adminSupplyInventoryId ?? null,
      name:       batch.supplyName            ?? batch.name       ?? null,
      category:   batch.supplyCategory        ?? batch.category   ?? null,
      qty:        batch.totalQuantity         ?? batch.qty        ?? null
    };
  }

  return {
    id:     batch.id    ?? null,
    name:   batch.name  ?? batch.title ?? null
  };
}
function buildUnitPayloadObject(stockroomType, unit) {
  if (stockroomType === 'apparel') {
    return {
      unitId:     unit.apparelId          ?? null,
      batchId:    unit.receiveApparelId   ?? unit.apparelInventoryId ?? null,
      status:     unit.status             ?? null,
      roomId:     unit.roomId             ?? null,
      createdAt:  unit.createdAt          ?? null,
    };
  }

  if (stockroomType === 'adminSupply') {
    return {
      unitId:     unit.adminSupplyId          ?? null,
      batchId:    unit.receiveAdminSupplyId   ?? unit.adminSupplyInventoryId ?? null,
      status:     unit.status                 ?? null,
      location:   unit.location               ?? null,
      createdAt:  unit.createdAt              ?? null
    };
  }

  return {
    unitId: unit.id   ?? null,
    name:   unit.name ?? null
  };
}
async function writePngFromPayload(stockroomType, payload) {
  const filename = filenameFromPayload(stockroomType, payload);
  const absolutePath = path.join(UPLOADS_DIR, filename);
  await QRCode.toFile(absolutePath, payload, {
    errorCorrectionLevel: 'H',
    margin: 1,
    scale: 4
  });
  const publicPath = `/uploads/qrcodes/${filename}`;
  return { filename, absolutePath, publicPath };
}

async function generateBatchQR({ stockroomType, inventoryId }) {
  if (!stockroomType || !inventoryId) throw new Error('stockroomType and inventoryId required');
  const batch = await loadBatchRecord(stockroomType, inventoryId);
  if (!batch) throw new Error(`Batch not found for ${stockroomType} id=${inventoryId}`);

  const payloadObj = buildBatchPayloadObject(stockroomType, batch);
  const payload = JSON.stringify(payloadObj);

  const { filename, absolutePath, publicPath } = await writePngFromPayload(stockroomType, payload);

  // optional: update batch with payload path (swallow failures)
  try { if (typeof batch.update === 'function') await batch.update({ qrFilePath: payload, qrCodePath: publicPath }); } catch (e) {}

  // optional audit row (swallow failures)
  try { if (db.Qr) await db.Qr.create({ itemType: stockroomType, batchId: inventoryId, qrFilePath: payload }); } catch (e) {}

  return { filename, absolutePath, publicPath, payload, batch };
}
async function generateUnitQR({ stockroomType, unitId }) {
  if (!stockroomType || !unitId) throw new Error('stockroomType and unitId required');
  const unit = await loadUnitRecord(stockroomType, unitId);
  if (!unit) throw new Error(`Unit not found for ${stockroomType} id=${unitId}`);

  const payloadObj = buildUnitPayloadObject(stockroomType, unit);
  const payload = JSON.stringify(payloadObj);

  const { filename, absolutePath, publicPath } = await writePngFromPayload(stockroomType, payload);

  // optional: update unit with payload (if columns exist)
  try { if (typeof unit.update === 'function') await unit.update({ qrFilePath: payload, qrCodePath: publicPath }); } catch (e) {}

  // optional audit row
  try { if (db.Qr) await db.Qr.create({ itemType: stockroomType, batchId: payloadObj.batchId ?? null, qrFilePath: payload }); } catch (e) {}

  return { filename, absolutePath, publicPath, payload, unit };
}




async function releaseUnit({ stockroomType, unitId, actorId = null }) {
  if (!stockroomType || !unitId) throw new Error('stockroomType and unitId required');

  // Start a transaction for safety
  const t = await db.sequelize.transaction();

  try {
    // 1) load unit with FOR UPDATE lock
    let unitModel;
    if (stockroomType === 'apparel') {
      unitModel = db.Apparel || db.ApparelUnit;
    } else if (stockroomType === 'adminSupply') {
      unitModel = db.AdminSupply || db.AdminSupplyUnit;
    } else {
      unitModel = db[stockroomType];
    }
    if (!unitModel) throw new Error('Unit model not found for type ' + stockroomType);

    // find the unit row and lock it FOR UPDATE to prevent concurrent releases
    const unit = await unitModel.findByPk(unitId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!unit) {
      await t.rollback();
      throw new Error('Unit not found');
    }

    // 2) idempotency: if already released, return sensible response
    if ((unit.status || '').toLowerCase() === 'released') {
      // already released: commit no DB change and return current state
      await t.commit();
      return { ok: true, message: 'Unit already released', unit };
    }

    // 3) find the batch/inventory row and lock it
    let batchModel;
    const batchId = unit.receiveApparelId ?? unit.apparelInventoryId ?? unit.receiveAdminSupplyId ?? unit.adminSupplyInventoryId;
    if (stockroomType === 'apparel') {
      batchModel = db.ApparelInventory || db.Receive_Apparel;
    } else if (stockroomType === 'adminSupply') {
      batchModel = db.AdminSupplyInventory || db.Receive_AdminSupply;
    } else {
      batchModel = db[stockroomType + 'Inventory'] || db[stockroomType];
    }

    if (!batchModel) {
      await t.rollback();
      throw new Error('Batch model not found for type ' + stockroomType);
    }

    if (!batchId) {
      // unit lacks batch reference — still allow release but don't change batch qty
      // decide business rule; here we proceed but warn
    }

    // lock batch row if exists
    let batch = null;
    if (batchId) {
      batch = await batchModel.findByPk(batchId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!batch) {
        await t.rollback();
        throw new Error('Batch not found for unit');
      }
      // 4) check batch quantity availability
      const currentQty = (batch.totalQuantity ?? batch.quantity ?? 0);
      if (currentQty <= 0) {
        await t.rollback();
        throw new Error('Batch has no available quantity to release');
      }
      // decrement the quantity by 1
      const newQty = currentQty - 1;
      // update the batch
      await batch.update({ totalQuantity: newQty }, { transaction: t });
    }

    // 5) mark unit as released
    const now = new Date();
    await unit.update({
      status: 'released',
      releasedAt: now,
      releasedBy: actorId
    }, { transaction: t });

    // 6) create audit / release record
    if (db.Release) {
      await db.Release.create({
        stockroomType,
        unitId,
        batchId: batchId ?? null,
        qty: 1,
        releasedBy: actorId ?? null,
        releasedAt: now
      }, { transaction: t });
    } else {
      // If your project has typed release tables e.g. ReleaseApparel, create there
      // swallow if not present
      try {
        if (stockroomType === 'apparel' && db.ReleaseApparel) {
          await db.ReleaseApparel.create({ unitId, batchId, qty:1, releasedBy: actorId, releasedAt: now }, { transaction: t });
        }
      } catch (e) {}
    }

    // 7) commit
    await t.commit();

    // reload unit & batch to return current state
    await unit.reload();
    if (batch) await batch.reload();

    return { ok: true, unit, batch };

  } catch (err) {
    // rollback on any error
    try { await t.rollback(); } catch (e) {}
    throw err;
  }
}