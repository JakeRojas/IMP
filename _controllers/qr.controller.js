const fs      = require('fs');
const express = require('express');
const router  = express.Router();

const qrService   = require('_services/qr.service'); 
const db          = require('_helpers/db-handler');

router.post('/scan',                                scanItem);
router.post('/:stockroomType/unit/:unitId/release', releaseUnit);

router.get('/:stockroomType/:inventoryId/qrcode', qrGeneratorBatch);
router.get('/:stockroomType/unit/:unitId/qrcode', qrGeneratorUnit);

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