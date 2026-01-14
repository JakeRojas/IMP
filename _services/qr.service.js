const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const QRCode = require('qrcode');
const db = require('_helpers/db-handler');

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
  releaseUnit,
  updateItemStatus,

  markInventoryQrGenerated,
};

function pickFirst(obj, ...keys) {
  if (!obj) return null;
  for (const k of keys) {
    if (obj[k] !== undefined && obj[k] !== null) return obj[k];
    if (obj.dataValues && obj.dataValues[k] !== undefined && obj.dataValues[k] !== null) return obj.dataValues[k];
  }
  return null;
}
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
  if (stockroomType === 'it' || stockroomType === 'maintenance' || stockroomType === 'genitem' || stockroomType === 'general') {
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

  if (stockroomType === 'supply' || stockroomType === 'admin-supply') {
    if (db.AdminSupply) {
      const u = await db.AdminSupply.findByPk(id);
      if (u) return u;
    }
    return null;
  }

  if (stockroomType === 'genitem' || stockroomType === 'general' || stockroomType === 'it' || stockroomType === 'maintenance') {
    if (db.GenItem) {
      const u = await db.GenItem.findByPk(id);
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
  if (!batch) return { stockroomType };

  // Common fields we want in every QR
  const id = pickFirst(batch,
    // inventory primary keys in different patterns
    'id', 'apparelInventoryId', 'adminSupplyInventoryId', 'genItemInventoryId',
    'receiveApparelId', 'receiveAdminSupplyId', 'receiveGenItemId'
  );

  const name = pickFirst(batch,
    'sku', 'code', 'itemCode', 'apparelSku', 'adminSupplyCode', 'genItemSku',
    'name', 'title', 'apparelName', 'supplyName', 'genItemName', 'itemName', 'description'
  );

  // Status (inventory-level)
  const status = pickFirst(batch, 'status', 'itemStatus', 'apparelStatus', 'adminSupplyStatus');

  // totalQuantity fallbacks
  const totalQuantity = pickFirst(batch,
    'totalQuantity', 'quantity', 'qty',
    'apparelQuantity', 'supplyQuantity', 'genItemQuantity',
    'remainingQuantity', 'availableQuantity'
  );

  const roomId = pickFirst(batch, 'roomId', 'room_id');

  return {
    stockroomType: stockroomType || null,
    inventoryId: id ?? null,
    name: name ?? null,
    status: status ?? null,
    totalQuantity: (totalQuantity !== null && totalQuantity !== undefined) ? Number(totalQuantity) : null,
    roomId: roomId ?? null
  };
}
function buildUnitPayloadObject(stockroomType, unit) {
  if (stockroomType === 'apparel') {
    return {
      unitId: unit.apparelId ?? null,
      batchId: unit.receiveApparelId ?? unit.apparelInventoryId ?? null,
      status: unit.apparelStatus ?? null,
      roomId: unit.roomId ?? null,
      createdAt: unit.createdAt ?? null,
    };
  }

  if (stockroomType === 'supply' || stockroomType === 'admin-supply') {
    return {
      unitId: unit.adminSupplyId ?? null,
      batchId: unit.receiveAdminSupplyId ?? unit.adminSupplyInventoryId ?? null,
      status: unit.status ?? null,
      roomId: unit.roomId ?? null,
      createdAt: unit.createdAt ?? null
    };
  }

  if (stockroomType === 'genitem' || stockroomType === 'general' || stockroomType === 'it' || stockroomType === 'maintenance') {
    return {
      unitId: unit.genItemId ?? null,
      batchId: unit.receiveGenItemId ?? unit.genItemInventoryId ?? null,
      status: unit.status ?? null,
      roomId: unit.roomId ?? null,
      createdAt: unit.createdAt ?? null
    };
  }

  return {
    unitId: unit.id ?? null,
    name: unit.name ?? null
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

  const { filename: writtenFilename, absolutePath: writtenAbs, publicPath: writtenPublic } =
    await writePngFromPayload(stockroomType, payload, { filenameOverride: filename, outputDir: UPLOADS_DIR });

  // optional: update DB rows with qr path info (if you do that elsewhere)
  try { if (typeof batch.update === 'function') await batch.update({ qrFilePath: payload, qrCodePath: writtenPublic }); } catch (e) { }

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

  try { if (typeof unit.update === 'function') await unit.update({ qrFilePath: payload, qrCodePath: writtenPublic }); } catch (e) { }

  return { filename: writtenFilename || filename, absolutePath: writtenAbs || absolutePath, publicPath: writtenPublic || publicPath, payload, unit };
}

async function scanItem(qrPayloadText) {
  if (!qrPayloadText) throw { status: 400, message: 'qr payload required' };

  // previously you attempted exact QR matches first — keep that
  if (db.Qr) {
    const record = await db.Qr.findOne({ where: { qrFilePath: qrPayloadText } });
    if (record) return { qrRecord: record };
  }

  try {
    const parsed = JSON.parse(qrPayloadText);

    // helper tries explicit type first, otherwise tries common types
    async function findBatch(parsedObj) {
      const id = Number(parsedObj.inventoryId || parsedObj.id);
      if (!id) return null;
      const explicit = (parsedObj.stockroomType || parsedObj.itemType || parsedObj.type);
      const tryOrder = explicit ? [String(explicit).toLowerCase()] : ['apparel', 'supply', 'genitem', 'it', 'maintenance'];
      for (const t of tryOrder) {
        const inv = await loadBatchRecord(t, id);
        if (inv) return { inv, type: t };
      }
      return null;
    }

    if (parsed.inventoryId || parsed.id) {
      const found = await findBatch(parsed);
      if (found) {
        parsed._detectedItemType = parsed._detectedItemType || found.type;
        return { payload: parsed, inventory: found.inv };
      }
    }

    if (parsed.unitId) {
      const tryOrder = [(parsed.stockroomType || parsed.itemType || parsed.type), 'apparel', 'supply', 'genitem', 'it', 'maintenance']
        .filter(Boolean).map(x => String(x).toLowerCase());
      for (const t of tryOrder) {
        const u = await loadUnitRecord(t, Number(parsed.unitId));
        if (u) { parsed._detectedItemType = parsed._detectedItemType || t; return { payload: parsed, unit: u }; }
      }
    }

    return { payload: parsed };
  } catch (e) {
    throw { status: 404, message: 'QR code not found' };
  }
}

// new helper: centralize unit release logic so controller can be tiny
async function releaseUnit(stockroomType, unitId, opts = {}) {
  if (!stockroomType || !unitId) throw { status: 400, message: 'Invalid params' };
  const t = String(stockroomType).toLowerCase();
  const actorId = opts.actorId || null;

  if (t === 'apparel') {
    const apparelService = require('_services/apparel.service');
    return apparelService.releaseUnitById(Number(unitId), { actorId });
  }

  if (['admin-supply', 'supply', 'adminsupply', 'admin-supply'].includes(t)) {
    const supplyService = require('_services/adminSupply.service');
    return supplyService.releaseUnitById(Number(unitId), { actorId });
  }

  if (['genitem', 'general-item', 'general', 'it', 'maintenance'].includes(t)) {
    const genService = require('_services/genItem.service');
    return genService.releaseUnitById(Number(unitId), { actorId });
  }

  throw { status: 400, message: 'Unsupported stockroomType for unit release' };
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
async function markInventoryQrGenerated(stockroomType, inventoryId) {
  try {
    if (!inventoryId) return;

    stockroomType = String(stockroomType || '').toLowerCase();

    if (stockroomType === 'apparel' && db.ApparelInventory) {
      await db.ApparelInventory.update({ qrStatus: true }, { where: { id: inventoryId } });
      return;
    }
    if (stockroomType === 'supply' && db.AdminSupplyInventory) {
      await db.AdminSupplyInventory.update({ qrStatus: true }, { where: { id: inventoryId } });
      return;
    }
    if ((stockroomType === 'general' || stockroomType === 'it' || stockroomType === 'maintenance') && db.GenItemInventory) {
      await db.GenItemInventory.update({ qrStatus: true }, { where: { id: inventoryId } });
      return;
    }

    const modelName = `${stockroomType.charAt(0).toUpperCase()}${stockroomType.slice(1)}Inventory`;
    if (db[modelName]) {
      await db[modelName].update({ qrStatus: true }, { where: { id: inventoryId } });
    }
  } catch (err) {
    console.warn('markInventoryQrGenerated warning:', err && err.message ? err.message : err);
  }
}