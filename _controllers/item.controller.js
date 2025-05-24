const express = require('express');
const router = express.Router();
const Joi = require('joi');
const itemService = require('_services/item.service');
const validateRequest = require('_middlewares/validate-request');
const multer = require('multer');
//const upload = multer({ dest: 'uploads/' });
const { Router } = require('express');
const upload = require('multer')(/*...storage config...*/).single('itemQrCode');

router.post('/create-item', upload, createItemSchema, createItem);
router.get('/', getItems);
router.get('/:id', getItemById);
router.post('/assign-item', createAssignment);

module.exports = router;

async function createItem(req, res, next) {
  try {
    const { itemName, itemCategory, roomId } = req.body;
    if (!itemName) 
      return res.status(400).json({ message: 'itemName is required' });
    
    const newItem = await itemService.createItem(req.body, req.file);
    res.status(201).json(newItem);
  } catch (err) {
    next(err);
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
