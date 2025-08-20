const fs = require('fs');
const qrService = require('_services/qr.service'); 
const express = require('express');
const router = express.Router();

router.post('/:stockroomType/unit/:unitId/release', releaseUnitHandler);

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



async function releaseUnitHandler(req, res, next) {
  try {
    const stockroomType = req.params.stockroomType;
    const unitId = parseInt(req.params.unitId, 10);
    if (!stockroomType || Number.isNaN(unitId)) return res.status(400).json({ message: 'Invalid params' });

    // If you have authentication middleware, use req.user.id; otherwise accept actorId body (less secure)
    const actorId = req.user?.id || (req.body && req.body.actorId) || null;

    const result = await releaseService.releaseUnit({ stockroomType, unitId, actorId });

    if (!result.ok) return res.status(400).json({ message: result.message || 'Release failed' });

    // return updated objects
    return res.json({
      success: true,
      message: result.message || 'Released',
      unit: result.unit,
      batch: result.batch
    });
  } catch (err) {
    // map known errors to 400
    if (err.message && (err.message.includes('not found') || err.message.includes('no available'))) {
      return res.status(400).json({ success: false, message: err.message });
    }
    next(err);
  }
}