const express = require('express');
const router = express.Router();
const Joi = require('joi');
const userService = require('../_services/user.service');
const validateRequest = require('_middlewares/validate-request');

router.post('/create-user', createUserSchema, createUser);
router.get('/', getUsers);
router.get('/:id', getUserById);
module.exports = router;

function createUserSchema(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  });
  validateRequest(req, next, schema);
}
async function createUser(req, res, next) {
  try {
    const user = await userService.create(req.body);
    res.json(user);
  } catch (err) { next(err) }
}
async function getUsers(req, res, next) {
  try {
    const users = await userService.getAll();
    res.json(users);
  } catch (err) { next(err) }
}
async function getUserById(req, res, next) {
  try {
    const user = await userService.getById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) { next(err) }
}