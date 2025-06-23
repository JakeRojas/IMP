const express = require('express');
const router = express.Router();
const Joi = require('joi');
const itemService = require('_services/item.service');
const validateRequest = require('_middlewares/validate-request');
const { Router } = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');

const UPLOAD_DIR = path.resolve(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ storage }).single('itemQrCode');

router.post('/create-item', authorize(Role.SuperAdmin, Role.Admin), upload, createItemSchema, createItem);
router.get('/', getItems);
router.get('/:id', getItemById);
router.post('/assign-item', authorize(Role.SuperAdmin), createAssignment);
//router.post('/scan-item', authorize(Role.SuperAdmin, Role.Admin), scanItemHandler);
router.put('/:id/activation', authorize(Role.SuperAdmin), itemActivation);

module.exports = router;

async function createItem(req, res, next) {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'QR code file is required.' });
    }

    const { itemName, itemCategory } = req.body;
    const qrFilename = req.file.filename;
    const qrPath = `/uploads/${qrFilename}`;

    const newItem = await itemService.createItem({
      itemName,
      itemCategory,
      itemQrCode: qrPath
    });

    return res.status(201).json(newItem);
  } catch (error) {
    next(error);
  }
}
function createItemSchema(req, res, next) {
  const schema = Joi.object({
      itemName: Joi.string().required().min(1).max(10),
      itemCategory: Joi.string().valid('it', 'apparel', 'academic', 'unknown').required(),
      roomId: Joi.number().optional()
  });
  validateRequest(req, next, schema);
}
function getItems(req, res, next) {
  itemService.getItems()
      .then(items => res.json(items))
      .catch(next);
}
function getItemById(req, res, next) {
  itemService.getItemById(req.params.id)
      .then(items => res.json(items))
      .catch(next);
}
async function createAssignment(req, res, next) {
  try {
    const { params } = req.body;
    const assignment = await itemService.assignItem({ params });
    res.status(201).json(assignment);
  } catch (err) {
    next(err);
  }
}
// async function scanItemHandler(req, res, next) {
//   try {
//     const { qrCode, roomId } = req.body;

//     const inv = await db.RoomInventory.findOne({
//       where: { roomId },
//       include: {
//         model: db.Item,
//         as: 'Item',
//         where: { itemQrCode: qrCode }
//       }
//     });

//     if (!inv) {
//       return res.status(400).json({ message: 'This item is not belong here' });
//     }

//     await itemService.activateItem(inv.itemId);

//     res.json({ message: 'Item activated', item: inv.Item });
//   } catch (err) {
//     next(err);
//   }
// }
function itemActivation(req, res, next) {
  const { id } = req.params;

  itemService
    .itemActivation(id)
    .then((newStatus) =>
      res.json({ message: `Product ${newStatus} successfully` })
    )
    .catch(next);
}