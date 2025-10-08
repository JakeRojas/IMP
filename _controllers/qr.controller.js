const PDFDocument = require('pdfkit');
const fs          = require('fs');
const express     = require('express');
const router      = express.Router();

const qrService   = require('_services/qr.service'); 
const db          = require('_helpers/db-handler');

router.post('/scan',                                scanItem);
router.post('/:stockroomType/unit/:unitId/release', releaseUnit);

router.get('/:stockroomType/:inventoryId/qrcode', getBatchQr);
router.get('/:stockroomType/unit/:unitId/qrcode', qrGeneratorUnit);

router.get('/:stockroomType/room/:roomId/pdf-all', generateAllPdf);

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
    const stockroomType = req.params.stockroomType;
    const unitId = parseInt(req.params.unitId, 10);
    const actorId = req.body?.actorId;

    if (!stockroomType || Number.isNaN(unitId)) return res.status(400).json({ message: 'Invalid params' });

    // delegate to specific service depending on stockroomType
    if (stockroomType === 'apparel') {
      const apparelService = require('_services/apparel.service');
      const result = await apparelService.releaseUnitById(unitId, { actorId });
      return res.json(result);
    } else if (stockroomType === 'admin-supply' || stockroomType === 'supply') {
      const supplyService = require('_services/adminSupply.service');
      const result = await supplyService.releaseUnitById(unitId, { actorId });
      return res.json(result);
    } else {
      // fallback — you can add gen item handler similarly
      return res.status(400).json({ message: 'Unsupported stockroomType for unit release' });
    }
  } catch (err) { next(err); }
}
async function generateAllPdf(req, res, next) {
  try {
    const stockroomType = String(req.params.stockroomType || '').toLowerCase();
    const roomId = parseInt(req.params.roomId, 10);
    if (!stockroomType || Number.isNaN(roomId)) return res.status(400).json({ message: 'Invalid params' });

    // Load inventory for the room/type (adapt model names to your project if needed)
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

    // Helper to safely read candidate fields (also checks dataValues for Sequelize instances)
    function tryFields(obj, ...keys) {
      if (!obj) return null;
      for (const k of keys) {
        if (obj[k] !== undefined && obj[k] !== null) return obj[k];
        if (obj.dataValues && obj.dataValues[k] !== undefined && obj.dataValues[k] !== null) return obj.dataValues[k];
      }
      return null;
    }

    // Build array of items with image path and label (sku). Keep invId for fallback or later use.
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

      // Final label fallback order:
      // 1) labelCandidate (preferred)
      // 2) invId (if present)
      // 3) "Item #<index+1>" as last resort to avoid 'undefined'
      const label = labelCandidate !== null && labelCandidate !== undefined
        ? String(labelCandidate)
        : (invId !== undefined && invId !== null ? String(invId) : `Item #${idx + 1}`);

      if (pngPath) {
        qrItems.push({ imgPath: pngPath, label, invId });
      } else {
        // optionally include items without PNG (they will show "QR missing" placeholders)
        qrItems.push({ imgPath: null, label, invId });
      }
    }

    if (!qrItems.length) {
      return res.status(404).json({ message: 'No QR images generated' });
    }

    // Prepare PDF response
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="qrcodes-${stockroomType}-room-${roomId}.pdf"`);

    const doc = new PDFDocument({ autoFirstPage: false, size: 'LETTER', margin: 0 });
    doc.pipe(res);

    // Layout constants
    const POINTS_PER_INCH = 72;
    const PAGE_WIDTH = 8.5 * POINTS_PER_INCH; // 612
    const PAGE_HEIGHT = 11 * POINTS_PER_INCH; // 792
    const MARGIN = 0.5 * POINTS_PER_INCH;     // half inch margin (36pt)
    const QR_SIDE = 1 * POINTS_PER_INCH;     // 1 inch QR (72pt)
    const LABEL_HEIGHT = 12;                 // room for label under QR (12pt)
    const CELL_HEIGHT = QR_SIDE + LABEL_HEIGHT;

    const usableWidth = PAGE_WIDTH - 2 * MARGIN;
    const usableHeight = PAGE_HEIGHT - 2 * MARGIN;

    // how many fit horizontally / vertically
    const cols = Math.max(1, Math.floor(usableWidth / QR_SIDE));
    const rows = Math.max(1, Math.floor(usableHeight / CELL_HEIGHT));
    const perPage = cols * rows;

    // distribute leftover space as gaps
    const gapX = (usableWidth - cols * QR_SIDE) / (cols + 1);
    const gapY = (usableHeight - rows * CELL_HEIGHT) / (rows + 1);
    const hGap = Math.max(0, gapX);
    const vGap = Math.max(0, gapY);

    // font defaults
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

      // draw SKU label under the QR
      const labelY = y + QR_SIDE + 4; // small gap between QR and label
      doc.fontSize(10);
      doc.text(label, x, labelY, { width: QR_SIDE, align: 'center' });
    }

    doc.end();
  } catch (err) {
    console.error('generateAllPdf error:', err && err.stack ? err.stack : err);
    return res.status(500).json({ message: 'Internal server error while generating PDF' });
  }
}