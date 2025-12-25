const PDFDocument = require('pdfkit');
const fs          = require('fs');
const express     = require('express');
const router      = express.Router();

const qrService   = require('_services/qr.service'); 
const db          = require('_helpers/db-handler');
const validateRequest   = require('_middlewares/validate-request');
const authorize         = require('_middlewares/authorize');
const Role              = require('_helpers/role');

router.post('/scan',                               authorize([Role.SuperAdmin, Role.Admin, Role.StockroomAdmin]), scanItem);
router.post('/:stockroomType/unit/:unitId/release', releaseUnit);

router.get('/:stockroomType/:inventoryId/qrcode', getBatchQr);
router.get('/:stockroomType/unit/:unitId/qrcode', qrGeneratorUnit);

router.get('/:stockroomType/room/:roomId/pdf-all', generateAllPdf);
router.get('/:stockroomType/room/:roomId/pdf-units', generateAllUnitsPdf);

router.put('/:stockroomType/unit/:unitId/status', updateUnitStatus);

module.exports = router;

async function getBatchQr(req, res, next) {
  try {
    const stockroomType = String(req.params.stockroomType || '').toLowerCase();
    const inventoryId = Number(req.params.inventoryId);

    const out = await qrService.generateBatchQR({ stockroomType, inventoryId });
    const pngPath = out && (out.absolutePath || out.path || out.filepath);
    if (!pngPath || !fs.existsSync(pngPath)) return res.status(404).json({ message: 'QR not found' });

    res.sendFile(pngPath);
  } catch (err) {
    next(err);
  }
}

async function qrGeneratorUnit(req, res, next) {
  try {
    const stockroomType = req.params.stockroomType; 
    const unitId = parseInt(req.params.unitId, 10);
    if (!stockroomType || Number.isNaN(unitId)) return res.status(400).json({ message: 'Invalid params' });

    const { filename, absolutePath } = await qrService.generateUnitQR({ stockroomType, unitId });
    const buffer = await fs.promises.readFile(absolutePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.type('png').send(buffer);
  } catch (err) { next(err); }
}
async function scanItem(req, res, next) {
  try {
    const { qrId } = req.body;
    const item = await qrService.scanItem(qrId);
    return res.json({ item });
  } catch (err) {
    next(err);
  }
}
async function releaseUnit(req, res, next) {
  try {
    const stockroomType = String(req.params.stockroomType || '').toLowerCase();
    const unitId = parseInt(req.params.unitId, 10);
    const actorId = req.body?.actorId;

    if (!stockroomType || Number.isNaN(unitId)) return res.status(400).json({ message: 'Invalid params' });

    const result = await qrService.releaseUnit(stockroomType, unitId, { actorId });
    return res.json(result);
  } catch (err) { next(err); }
}
async function generateAllPdf(req, res, next) {
  try {
    const stockroomType = String(req.params.stockroomType || '').toLowerCase();
    const roomId = parseInt(req.params.roomId, 10);
    if (!stockroomType || Number.isNaN(roomId)) return res.status(400).json({ message: 'Invalid params' });

    let inventory = [];
    if (stockroomType === 'apparel') {
      inventory = await db.ApparelInventory.findAll({ where: { roomId } });
    } else if (stockroomType === 'supply') {
      inventory = await db.AdminSupplyInventory.findAll({ where: { roomId } });
    } else if (stockroomType === 'genitem' || stockroomType === 'it' || stockroomType === 'maintenance') {
      inventory = await db.GenItemInventory.findAll({ where: { roomId } });
    } else {
      const modelName = stockroomType + 'Inventory';
      if (db[modelName]) inventory = await db[modelName].findAll({ where: { roomId } });
    }

    if (!inventory || inventory.length === 0) {
      return res.status(404).json({ message: 'No inventory found for this room/type' });
    }

    function tryFields(obj, ...keys) {
      if (!obj) return null;
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        if (obj.dataValues && obj.dataValues[k] !== undefined && obj.dataValues[k] !== null) return obj.dataValues[k];
      }
      return null;
    }

    const qrItems = [];
    for (let idx = 0; idx < inventory.length; idx++) {
      const inv = inventory[idx];
      const invId = tryFields(inv,
        'receiveApparelId', 'apparelInventoryId', 'adminSupplyInventoryId', 'genItemInventoryId', 'id'
      );

      const out = await qrService.generateBatchQR({ stockroomType, inventoryId: invId });
      const pngPath = out && (out.absolutePath || out.path || out.filepath);

      const labelCandidate = tryFields(inv,
        'sku', 'code', 'itemCode', 'apparelSku', 'adminSupplyCode', 'genItemSku',
        'name', 'title', 'apparelName', 'supplyName', 'genItemName', 'itemName',
        'description', 'serialNumber'
      );

      const label = labelCandidate !== null && labelCandidate !== undefined
        ? String(labelCandidate)
        : (invId !== undefined && invId !== null ? String(invId) : `Item #${idx + 1}`);

      if (pngPath) {
        qrItems.push({ imgPath: pngPath, label, invId });
      } else {
        qrItems.push({ imgPath: null, label, invId });
      }
    }

    if (!qrItems.length) {
      return res.status(404).json({ message: 'No QR images generated' });
    }

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="qrcodes-${stockroomType}-room-${roomId}.pdf"`);

    const doc = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 0 });
    doc.pipe(res);

    const POINTS_PER_INCH = 72;
    const PAGE_WIDTH = 8.5 * POINTS_PER_INCH;
    const PAGE_HEIGHT = 11 * POINTS_PER_INCH;
    const MARGIN = 0.5 * POINTS_PER_INCH;
    const QR_SIDE = 1 * POINTS_PER_INCH;
    const LABEL_HEIGHT = 12;
    const CELL_HEIGHT = QR_SIDE + LABEL_HEIGHT;

    const usableWidth = PAGE_WIDTH - 2 * MARGIN;
    const usableHeight = PAGE_HEIGHT - 2 * MARGIN;

    const cols = Math.max(1, Math.floor(usableWidth / QR_SIDE));
    const rows = Math.max(1, Math.floor(usableHeight / CELL_HEIGHT));
    const perPage = cols * rows;

    const gapX = (usableWidth - cols * QR_SIDE) / (cols + 1);
    const gapY = (usableHeight - rows * CELL_HEIGHT) / (rows + 1);
    const hGap = Math.max(0, gapX);
    const vGap = Math.max(0, gapY);

    doc.font('Helvetica');

    for (let i = 0; i < qrItems.length; i++) {
      const indexInPage = i % perPage;
      if (indexInPage === 0) {
        doc.addPage({ size: 'LETTER', margin: 0 });
      }

      const col = indexInPage % cols;
      const row = Math.floor(indexInPage / cols);

      const x = MARGIN + hGap + col * (QR_SIDE + hGap);
      const y = MARGIN + vGap + row * (CELL_HEIGHT + vGap);

      const { imgPath, label } = qrItems[i];

      if (imgPath && fs.existsSync(imgPath)) {
        try {
          doc.image(imgPath, x, y, { width: QR_SIDE, height: QR_SIDE, align: 'center', valign: 'center' });
        } catch (imgErr) {
          doc.fontSize(8).text('QR image load error', x, y + QR_SIDE / 2 - 4, { width: QR_SIDE, align: 'center' });
        }
      } else {
        doc.fontSize(8).text('QR missing', x, y + QR_SIDE / 2 - 4, { width: QR_SIDE, align: 'center' });
      }

      const labelY = y + QR_SIDE + 4;
      doc.fontSize(10);
      doc.text(label, x, labelY, { width: QR_SIDE, align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error('generateAllPdf error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Internal server error while generating PDF' });
  }
}
async function generateAllUnitsPdf(req, res, next) {
  try {
    const stockroomType = String(req.params.stockroomType || '').toLowerCase();
    const roomId = parseInt(req.params.roomId, 10);
    if (!stockroomType || Number.isNaN(roomId)) return res.status(400).json({ message: 'Invalid params' });

    // load unit rows for room depending on type
    let units = [];
    if (stockroomType === 'apparel') {
      units = await db.Apparel.findAll({ where: { roomId } });
    } else if (stockroomType === 'supply') {
      units = await db.AdminSupply.findAll({ where: { roomId } });
    } else if (stockroomType === 'genitem' || stockroomType === 'it' || stockroomType === 'maintenance') {
      units = await db.GenItem.findAll({ where: { roomId } });
    } else {
      // try generic model name (singular)
      const modelName = stockroomType.charAt(0).toUpperCase() + stockroomType.slice(1);
      if (db[modelName]) units = await db[modelName].findAll({ where: { roomId } });
    }

    if (!units || units.length === 0) return res.status(404).json({ message: 'No units found for this room/type' });

    // small helper to pick candidate label fields
    const tryFields = (obj, ...keys) => {
      if (!obj) return null;
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        if (obj.dataValues && obj.dataValues[k] !== undefined && obj.dataValues[k] !== null) return obj.dataValues[k];
      }
      return null;
    };

    // build QR item list (generate per-unit PNG if needed)
    const qrItems = [];
    for (let u of units) {
      const unitId = tryFields(u, 'id', 'apparelId', 'adminSupplyId', 'genItemId') || null;
      if (!unitId) continue;
      const out = await qrService.generateUnitQR({ stockroomType, unitId });
      const pngPath = out && (out.absolutePath || out.path || out.filepath) || null;

      const labelCandidate = tryFields(u,
        'name','apparelName','supplyName','genItemName','sku','code','serialNumber','description'
      );
      const label = labelCandidate ? String(labelCandidate) : `Unit #${unitId}`;

      qrItems.push({ imgPath: pngPath, label, unitId });
    }

    if (!qrItems.length) return res.status(404).json({ message: 'No QR images generated' });

    // --- PDF layout (same simple grid used in generateAllPdf) ---
    const doc = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 0 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="qrcodes-${stockroomType}-room-${roomId}-units.pdf"`);
    doc.pipe(res);

    const POINTS_PER_INCH = 72;
    const PAGE_WIDTH = 8.5 * POINTS_PER_INCH;
    const PAGE_HEIGHT = 11 * POINTS_PER_INCH;
    const MARGIN = 0.5 * POINTS_PER_INCH;
    const QR_SIDE = 1 * POINTS_PER_INCH;
    const LABEL_HEIGHT = 12;
    const CELL_HEIGHT = QR_SIDE + LABEL_HEIGHT;

    const usableWidth = PAGE_WIDTH - 2 * MARGIN;
    const usableHeight = PAGE_HEIGHT - 2 * MARGIN;

    const cols = Math.max(1, Math.floor(usableWidth / QR_SIDE));
    const rows = Math.max(1, Math.floor(usableHeight / CELL_HEIGHT));
    const perPage = cols * rows;

    const gapX = (usableWidth - cols * QR_SIDE) / (cols + 1);
    const gapY = (usableHeight - rows * CELL_HEIGHT) / (rows + 1);
    const hGap = Math.max(0, gapX);
    const vGap = Math.max(0, gapY);

    doc.font('Helvetica');

    for (let i = 0; i < qrItems.length; i++) {
      const indexInPage = i % perPage;
      if (indexInPage === 0) doc.addPage({ size: 'LETTER', margin: 0 });

      const col = indexInPage % cols;
      const row = Math.floor(indexInPage / cols);
      const x = MARGIN + hGap + col * (QR_SIDE + hGap);
      const y = MARGIN + vGap + row * (CELL_HEIGHT + vGap);

      const { imgPath, label } = qrItems[i];

      if (imgPath && fs.existsSync(imgPath)) {
        try { doc.image(imgPath, x, y, { width: QR_SIDE, height: QR_SIDE }); }
        catch (imgErr) { doc.fontSize(8).text('QR image load error', x, y + QR_SIDE / 2 - 4, { width: QR_SIDE, align: 'center' }); }
      } else {
        doc.fontSize(8).text('QR missing', x, y + QR_SIDE / 2 - 4, { width: QR_SIDE, align: 'center' });
      }

      const labelY = y + QR_SIDE + 4;
      doc.fontSize(10).text(label, x, labelY, { width: QR_SIDE, align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error('generateAllUnitsPdf error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Internal server error while generating units PDF' });
  }
}


async function updateUnitStatus(req, res, next) {
  try {
    const stockroomType = String(req.params.stockroomType || '').toLowerCase();
    const unitId = parseInt(req.params.unitId, 10);
    const { status } = req.body;
    const actorId = req.body?.actorId || null;

    if (!stockroomType || Number.isNaN(unitId)) return res.status(400).json({ message: 'Invalid params' });
    if (!status) return res.status(400).json({ message: 'Missing status in body' });

    const result = await qrService.updateItemStatus(stockroomType, Number(unitId), status, { actorId });
    return res.json({ success: true, result });
  } catch (err) {
    next(err);
  }
}