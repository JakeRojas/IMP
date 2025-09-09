const fs      = require('fs');
const path    = require('path');
const crypto  = require('crypto');
const QRCode  = require('qrcode');
const db      = require('_helpers/db-handler');

const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function filenameFromPayload(stockroomType, payload) {
  const hash = crypto.createHash('sha256').update(payload).digest('hex').slice(0, 20);
  return `qr-${stockroomType}-${hash}.png`;
}

module.exports = {
  generateBatchQR,
  generateUnitQR,

  scanItem,
  updateItemStatus
};

async function loadBatchRecord(stockroomType, id) {
  if (!stockroomType || !id) return null;

  stockroomType = String(stockroomType).toLowerCase();

  // apparel
  if (stockroomType === 'apparel') {
    // try apparelInventory by PK
    if (db.ApparelInventory) {
      const inv = await db.ApparelInventory.findByPk(id);
      if (inv) return inv;
    }
    // then try receive apparel batch by PK
    if (db.ReceiveApparel) {
      const recv = await db.ReceiveApparel.findByPk(id);
      if (recv) return recv;
    }
    return null;
  }

  // adminSupply
  if (stockroomType === 'supply') {
    if (db.AdminSupplyInventory) {
      const inv = await db.AdminSupplyInventory.findByPk(id);
      if (inv) return inv;
    }
    if (db.ReceiveAdminSupply) {
      const recv = await db.ReceiveAdminSupply.findByPk(id);
      if (recv) return recv;
    }
    return null;
  }

  // generalitem
  if (stockroomType === 'it' || stockroomType === 'maintenance') {
    if (db.GenItemInventory) {
      const inv = await db.GenItemInventory.findByPk(id);
      if (inv) return inv;
    }
    if (db.ReceiveGenItem) {
      const recv = await db.ReceiveGenItem.findByPk(id);
      if (recv) return recv;
    }
    return null;
  }

  // generic pattern: try <type>Inventory then <type> table
  const inventoryModel = db[stockroomType + 'Inventory'] || db[stockroomType + '_inventory'];
  if (inventoryModel) {
    const inv = await inventoryModel.findByPk(id);
    if (inv) return inv;
  }
  if (db[stockroomType]) {
    const row = await db[stockroomType].findByPk(id);
    if (row) return row;
  }
  return null;
}
async function loadUnitRecord(stockroomType, id) {
  if (!stockroomType || !id) return null;

  stockroomType = String(stockroomType).toLowerCase();

  if (stockroomType === 'apparel') {
    if (db.Apparel) {
      const u = await db.Apparel.findByPk(id);
      if (u) return u;
    }
    // older naming possibilities
    if (db.ApparelUnit) {
      const u2 = await db.ApparelUnit.findByPk(id);
      if (u2) return u2;
    }
    return null;
  }

  if (stockroomType === 'supply') {
    if (db.AdminSupply) {
      const u = await db.AdminSupply.findByPk(id);
      if (u) return u;
    }
    return null;
  }

  if (db[stockroomType]) {
    const u = await db[stockroomType].findByPk(id);
    if (u) return u;
  }
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

  if (stockroomType === 'supply') {
    return {
      id:         batch.receiveAdminSupplyId  ?? batch.adminSupplyInventoryId ?? null,
      name:       batch.supplyName            ?? batch.name       ?? null,
      category:   batch.supplyCategory        ?? batch.category   ?? null,
      qty:        batch.totalQuantity         ?? batch.qty        ?? null
    };
  }

  if (stockroomType === 'it' || stockroomType === 'maintenance') {
    return {
      id:     batch.receiveGEnItemId  ?? batch.genItemInventoryId ?? null,
      name:   batch.genItemName       ?? batch.name   ?? null,
      size:   batch.genItemSize       ?? batch.size   ?? null,
      type:   batch.genItemType       ?? batch.type   ?? null,
      qty:    batch.totalQuantity     ?? batch.qty        ?? null
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
      status:     unit.apparelStatus      ?? null,
      roomId:     unit.roomId             ?? null,
      createdAt:  unit.createdAt          ?? null,
    };
  }

  if (stockroomType === 'supply') {
    return {
      unitId:     unit.adminSupplyId          ?? null,
      batchId:    unit.receiveAdminSupplyId   ?? unit.adminSupplyInventoryId ?? null,
      status:     unit.status                 ?? null,
      roomId:     unit.roomId                 ?? null,
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

async function generateBatchQR(argsOrStockroom) {
  // normalize arguments (keeps backwards compatibility)
  let stockroomType, inventoryId;
  if (typeof argsOrStockroom === 'object' && argsOrStockroom !== null && !Array.isArray(argsOrStockroom)) {
    ({ stockroomType, inventoryId } = argsOrStockroom);
  } else {
    stockroomType = arguments[0];
    inventoryId = arguments[1];
  }

  if (!stockroomType || !inventoryId) 
    throw new Error('stockroomType and inventoryId required');

  // load batch record (reuse your existing loader)
  const batch = await loadBatchRecord(stockroomType, inventoryId);
  if (!batch) throw new Error(`Batch not found for ${stockroomType} id=${inventoryId}`);

  // build payload object (use your existing builder)
  const payloadObj = buildBatchPayloadObject(stockroomType, batch);
  const payload = JSON.stringify(payloadObj);

  // compute deterministic filename & absolute path BEFORE writing
  const filename = filenameFromPayload(stockroomType, payload);
  const absolutePath = path.join(UPLOADS_DIR, filename);
  const publicPath = `/uploads/qrcodes/${filename}`;

  // if file already exists, return info immediately (idempotent)
  if (fs.existsSync(absolutePath)) {
    return { filename, absolutePath, publicPath, payload, batch };
  }

  // otherwise, write new PNG (reuse your existing writePngFromPayload or similar)
  // If you already have a writePngFromPayload(stockroomType, payload) that writes a file and returns paths,
  // you can keep using it — but ensure it writes into QRCODES_DIR with the filename above.
  // Example (adapt to your existing code):
  const { filename: writtenFilename, absolutePath: writtenAbs, publicPath: writtenPublic } =
    await writePngFromPayload(stockroomType, payload, { filenameOverride: filename, outputDir: UPLOADS_DIR });

  // optional: update DB rows with qr path info (if you do that elsewhere)
  try { if (typeof batch.update === 'function') await batch.update({ qrFilePath: payload, qrCodePath: writtenPublic }); } catch (e) {}

  return { filename: writtenFilename || filename, absolutePath: writtenAbs || absolutePath, publicPath: writtenPublic || publicPath, payload, batch };
}
async function generateUnitQR(argsOrStockroom) {
  let stockroomType, unitId;
  if (typeof argsOrStockroom === 'object' && argsOrStockroom !== null && !Array.isArray(argsOrStockroom)) {
    ({ stockroomType, unitId } = argsOrStockroom);
  } else {
    stockroomType = arguments[0];
    unitId = arguments[1];
  }

  if (!stockroomType || !unitId) 
    throw new Error('stockroomType and unitId required');

  const unit = await loadUnitRecord(stockroomType, unitId);
  if (!unit) throw new Error(`Unit not found for ${stockroomType} id=${unitId}`);

  const payloadObj = buildUnitPayloadObject(stockroomType, unit);
  const payload = JSON.stringify(payloadObj);

  const filename = filenameFromPayload(stockroomType, payload);
  const absolutePath = path.join(UPLOADS_DIR, filename);
  const publicPath = `/uploads/qrcodes/${filename}`;

  if (fs.existsSync(absolutePath)) {
    return { filename, absolutePath, publicPath, payload, unit };
  }

  // otherwise create file
  const { filename: writtenFilename, absolutePath: writtenAbs, publicPath: writtenPublic } =
    await writePngFromPayload(stockroomType, payload, { filenameOverride: filename, outputDir: UPLOADS_DIR });

  try { if (typeof unit.update === 'function') await unit.update({ qrFilePath: payload, qrCodePath: writtenPublic }); } catch (e) {}

  return { filename: writtenFilename || filename, absolutePath: writtenAbs || absolutePath, publicPath: writtenPublic || publicPath, payload, unit };
}

async function scanItem(qrPayloadText) {
  if (!qrPayloadText) throw { status: 400, message: 'qr payload required' };

  // Attempt exact match against stored payload column (example uses qrFilePath or qrFilePath)
  const record = await db.Qr.findOne({ where: { qrFilePath: qrPayloadText } });

  if (!record) {
    // fallback: try matching by decoded JSON fields (for example unitId)
    try {
      const parsed = JSON.parse(qrPayloadText);
      if (parsed.unitId) {
        // try to load the unit record from corresponding table
        const unit = await loadUnitRecord(parsed.itemType || 'apparel', parsed.unitId);
        if (unit) return { payload: parsed, unit };
      }
    } catch (e) { /* not JSON — ignore */ }

    throw { status: 404, message: `QR code not found` };
  }

  return record;
}
async function updateItemStatus(stockroomType, id) {
  if (!stockroomType || !id) return null;

  if (stockroomType === 'apparel') {
    const updated = await db.Apparel.update(
      { itemStatus: updated.apparelStatus },
      { where: { id } }
    );
    if (!updated) throw new Error('Status update failed');

    return null;
  }

  
}