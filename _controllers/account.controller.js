// main functions of account controller
const express = require('express');
const router = express.Router();
const Joi = require('joi');

const validateRequest = require('_middlewares/validate-request');
const authorize = require('_middlewares/authorize');
const Role = require('_helpers/role');
const accountService = require('_services/account.service');
const db = require('_helpers/db-handler');

router.post('/register', registerSchema, register);
router.post('/authenticate', authenticateSchema, authenticate);
router.post('/refresh-token', refreshToken);
router.post('/revoke-token', authorize(), revokeTokenSchema, revokeToken);
router.post('/verify-email', verifyEmailSchema, verifyEmail);
router.post('/forgot-password', forgotPasswordSchema, forgotPassword);
router.post('/validate-reset-token', validateResetTokenSchema, validateResetToken);
router.post('/reset-password', resetPasswordSchema, resetPassword);

router.post('/:accountId/activity', authorize(), getActivities);
router.get('/activity-logs', authorize(Role.SuperAdmin), getAllActivityLogs);
router.get('/exists', existsAccount);

router.post('/create-user', authorize(Role.SuperAdmin), createSchema, create);
router.post('/create-array', authorize(Role.SuperAdmin), createAsArraySchema, createAsArray);
router.get('/', authorize(Role.SuperAdmin), getAll);
router.get('/:accountId', authorize(), getById);
router.put('/:accountId', authorize(Role.SuperAdmin), updateSchema, update);

router.delete('/:accountId', authorize(Role.SuperAdmin), _delete);

module.exports = router;

function authenticateSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required()
  });

  validateRequest(req, next, schema);
}
async function authenticate(req, res, next) {
  try {
    const { email, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const browserInfo = req.headers['user-agent'] || 'Unknown Browser';

    const account = await accountService.authenticate({ email, password, ipAddress, browserInfo });

    res.cookie('token', account.jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 1000, // 1h
    });

    setTokenCookie(res, account.refreshToken);

    return res.json(account);
  } catch (err) {
    next(err);
  }
}
//===================Logging Function=======================================
function getActivities(req, res, next) {
  const filters = {
    actionType: req.query.actionType,
    startDate: req.query.startDate,
    endDate: req.query.endDate
  };
  accountService.getAccountActivities(req.params.id, filters)
    .then(activities => res.json(activities))
    .catch(next);
}
function getAllActivityLogs(req, res, next) {
  const filters = {
    actionType: req.query.actionType,
    startDate: req.query.startDate,
    endDate: req.query.endDate,
    userId: req.query.userId
  };

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;

  accountService.getAllActivityLogs(filters, { page, limit })
    .then(({ logs, total }) => res.json({
      success: true,
      data: logs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }))
    .catch(next);
}
async function refreshToken(req, res, next) {
  try {
    const token =
      (req.cookies && req.cookies.refreshToken) ||
      req.body?.token ||
      req.get('x-refresh-token') ||
      req.headers['x-refresh-token'];

    if (!token) {
      return res.status(204).end();
    }

    let accountPayload;
    try {
      accountPayload = await accountService.refreshToken({ token, ipAddress: req.ip });
    } catch (serviceErr) {
      if (serviceErr && serviceErr.message && serviceErr.message.toLowerCase().includes('invalid')) {
        return res.status(401).json({ message: 'Invalid or expired refresh token' });
      }
      console.error('refreshToken service error:', serviceErr);
      return res.status(500).json({ message: 'Internal error while refreshing token' });
    }

    if (!accountPayload) {
      return res.status(401).json({ message: 'Invalid or expired refresh token' });
    }

    return res.json(accountPayload);
  } catch (err) {
    console.error('refreshToken handler unexpected error:', err);
    return res.status(500).json({ message: 'Unexpected server error' });
  }
}
function revokeTokenSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().empty('')
  });
  validateRequest(req, next, schema);
}
async function revokeToken(req, res, next) {
  try {
    const token = req.body.token || req.cookies.refreshToken;
    const ipAddress = req.ip;

    if (!token) return res.status(400).json({ message: 'Token is required' });

    const refreshToken = await db.RefreshToken.findOne({ where: { token } });
    if (!refreshToken || !refreshToken.isActive) {
      return res.status(400).json({ message: 'Invalid token' });
    }

    if (refreshToken.accountId !== req.user.accountId && req.user.role !== Role.SuperAdmin) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    await accountService.revokeToken({ token, ipAddress });
    return res.json({ message: 'Token revoked' });
  } catch (err) {
    next(err);
  }
}
function registerSchema(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  });
  validateRequest(req, next, schema);
}
function register(req, res, next) {
  accountService.register(req.body, req.get('origin'))
    .then(() => res.json({ message: 'Registration successful' }))
    .catch(next);
}
async function existsAccount(req, res, next) {
  try {
    const total = await db.Account.count();
    const exists = total > 0;

    if (exists) {
      const accounts = await db.Account.findAll({ attributes: ['email', 'status'], limit: 5 });
      console.log(`[AccountController] Found ${total} accounts. Samples:`, accounts.map(a => `${a.email} (${a.status})`));
    } else {
      console.log('[AccountController] No accounts found in database.');
    }

    return res.json({ exists });
  } catch (err) {
    console.error('existsAccount error:', err);
    next(err);
  }
}


function verifyEmailSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required()
  });
  validateRequest(req, next, schema);
}
function verifyEmail(req, res, next) {
  accountService.verifyEmail(req.body)
    .then(() => res.json({ message: 'Verification successful, you can now login' }))
    .catch(next);
}
function forgotPasswordSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().email().required()
  });
  validateRequest(req, next, schema);
}
function forgotPassword(req, res, next) {
  accountService.forgotPassword(req.body, req.get('origin'))
    .then(() => res.json({ message: 'Please check your email for password reset instructions' }))
    .catch(next);
}
function validateResetTokenSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required()
  });
  validateRequest(req, next, schema);
}
function validateResetToken(req, res, next) {
  accountService.validateResetToken(req.body)
    .then(() => res.json({ message: 'Token is valid' }))
    .catch(next);
}
function resetPasswordSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required()
  });
  validateRequest(req, next, schema);
}
function resetPassword(req, res, next) {
  const { token, password } = req.body;
  const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const browserInfo = req.headers['user-agent'] || 'Unknown Browser';

  accountService.resetPassword({ token, password }, ipAddress, browserInfo)
    .then(() => {
      res.json({ message: 'Password reset successful, you can now login' });
    })
    .catch(next);
}
function getAll(req, res, next) {
  accountService.getAll()
    .then(account => res.json(account))
    .catch(next);
}
function getById(req, res, next) {
  accountService.getById(req.params.accountId)
    .then(account => account ? res.json(account) : res.sendStatus(404))
    .catch(next);
}
function createSchema(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
    role: Joi.string().valid(Role.SuperAdmin, Role.Admin, Role.User, Role.StockroomAdmin, Role.Teacher).required(),
    status: Joi.string().valid('active', 'deactivated').optional(),
  });
  validateRequest(req, next, schema);
}
function create(req, res, next) {
  accountService.create(req.body)
    .then(account => res.json(account))
    .catch(next);
}
function updateSchema(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().empty(''),
    firstName: Joi.string().empty(''),
    lastName: Joi.string().empty(''),
    email: Joi.string().email().empty(''),
    password: Joi.string().min(6).empty(''),
    confirmPassword: Joi.string().valid(Joi.ref('password')).empty(''),
    status: Joi.string().valid('active', 'deactivated').empty(''),
    role: Joi.string().valid(Role.SuperAdmin, Role.Admin, Role.User, Role.StockroomAdmin, Role.Teacher).empty('')
  });
  validateRequest(req, next, schema);
}
function update(req, res, next) {

  const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const browserInfo = req.headers['user-agent'] || 'Unknown Browser';

  accountService.update(req.params.accountId, req.body, ipAddress, browserInfo)
    .then(account => {
      res.json({
        success: true,
        message: 'Account updated successfully',
        account: account
      });
    })
    .catch(next);
}
async function _delete(req, res, next) {
  try {
    const accountId = parseInt(req.params.accountId || req.params.accountId, 10);
    if (Number.isNaN(accountId)) return res.status(400).json({ message: 'Invalid id' });

    await accountService.update(accountId, { status: 'deactivated' });
    res.json({ message: 'Account deactivated' });
  } catch (err) {
    next(err);
  }
}
function setTokenCookie(res, token) {
  const isProduction = process.env.NODE_ENV === 'production';
  const cookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  };
  res.cookie('refreshToken', token, cookieOptions);
}

//===================Lazy Style Methods=======================================
function createAsArraySchema(req, res, next) {
  const accountSchema = Joi.object({
    title: Joi.string().empty(''),
    firstName: Joi.string().empty(''),
    lastName: Joi.string().empty(''),
    email: Joi.string().email().empty(''),
    password: Joi.string().min(6).empty(''),
    confirmPassword: Joi.string().valid(Joi.ref('password')).empty(''),
    status: Joi.string().valid('active', 'deactivated').empty(''),
    role: Joi.string().valid(Role.SuperAdmin, Role.Admin, Role.User, Role.StockroomAdmin, Role.Teacher).empty('')
  });

  const schema = Joi.alternatives().try(
    accountSchema,
    Joi.array().items(accountSchema)
  );

  validateRequest(req, next, schema);
}
async function createAsArray(req, res, next) {
  try {
    if (Array.isArray(req.body)) {
      const accounts = await Promise.all(req.body.map(data => accountService.create(data)));
      return res.json(accounts);
    }

    const account = await accountService.create(req.body);
    res.json(account);
  } catch (err) {
    next(err);
  }
}