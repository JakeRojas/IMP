const PDFDocument = require('pdfkit');
const fs      = require('fs');
const express = require('express');
const router  = express.Router();

const qrService   = require('_services/qr.service'); 
const db          = require('_helpers/db-handler');

router.post('/scan',                                scanItem);
router.post('/:stockroomType/unit/:unitId/release', releaseUnit);

router.get('/:stockroomType/:inventoryId/qrcode', qrGeneratorBatch);
router.get('/:stockroomType/unit/:unitId/qrcode', qrGeneratorUnit);

router.get('/:stockroomType/room/:roomId/pdf-all', generateAllPdf);

module.exports = router;

async function qrGeneratorBatch(req, res, next) {
  try {
    const stockroomType = req.params.stockroomType; 
    const inventoryId = parseInt(req.params.inventoryId, 10);
    if (!stockroomType || Number.isNaN(inventoryId)) return res.status(400).json({ message: 'Invalid params' });

    const { filename, absolutePath } = await qrService.generateBatchQR({ stockroomType, inventoryId });
    const buffer = await fs.promises.readFile(absolutePath);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.type('png').send(buffer);
  } catch (err) { next(err); }
}
async function qrGeneratorUnit(req, res, next) {
  try {
    const stockroomType = req.params.stockroomType;   // 'apparel' or 'adminSupply'
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
    const item = await itemService.scanItem(qrId);
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

    // load the inventory rows for the room / type
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

    // If nothing to generate
    if (!inventory || inventory.length === 0) {
      return res.status(404).json({ message: 'No inventory found for this room/type' });
    }

    // Ensure PNGs exist (generateBatchQR is idempotent and returns absolute path)
    const pngPaths = [];
    for (const inv of inventory) {
      // determine appropriate id value (some models use different PK names)
      const invId = inv.receiveApparelId ?? inv.apparelInventoryId ?? inv.adminSupplyInventoryId ?? inv.genItemInventoryId ?? inv.id;
      const out = await qrService.generateBatchQR({ stockroomType, inventoryId: invId });
      pngPaths.push(out.absolutePath);
    }

    // Create PDF and stream to client
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="qrcodes-${stockroomType}-room-${roomId}.pdf"`);

    const doc = new PDFDocument({ autoFirstPage: false });
    doc.pipe(res);

    const inch = 72; // PDF points per inch
    const qrSide = inch; // 1 inch square as requested
    const margin = 36;    // half-inch margin

    for (const imgPath of pngPaths) {
      doc.addPage({ size: 'LETTER', margin: 0 });
      // center the QR on the page (or place at margin)
      const x = (doc.page.width - qrSide) / 2;
      const y = (doc.page.height - qrSide) / 2;
      if (fs.existsSync(imgPath)) {
        doc.image(imgPath, x, y, { width: qrSide, height: qrSide });
      } else {
        // placeholder text if PNG missing
        doc.fontSize(12).text('QR image missing: ' + path.basename(imgPath), margin, margin);
      }
    }

    doc.end();
    // stream will close response automatically
  } catch (err) { next(err); }
}