// main functions of account controller
const express   = require('express');
const router    = express. Router(); 
const Joi       = require('joi');

const validateRequest   = require('_middlewares/validate-request'); 
const authorize         = require('_middlewares/authorize');
const Role              = require('_helpers/role');
const accountService    = require('_services/account.service');
const db                = require('_helpers/db-handler');

router.post('/register',                registerSchema, register);
router.post('/authenticate',            authenticateSchema, authenticate);
router.post('/refresh-token',           refreshToken);
router.post('/revoke-token',            authorize(), revokeTokenSchema, revokeToken); 
router.post('/verify-email',            verifyEmailSchema, verifyEmail);
router.post('/forgot-password',         forgotPasswordSchema, forgotPassword);
router.post('/validate-reset-token',    validateResetTokenSchema, validateResetToken);
router.post('/reset-password',          resetPasswordSchema, resetPassword);

router.post('/:accountId/activity',     authorize(), getActivities);
router.get('/activity-logs',            authorize(Role.SuperAdmin), getAllActivityLogs);
router.get('/exists',                   existsAccount);

router.post('/create-user',             authorize (Role.SuperAdmin), createSchema, create);
router.get('/',                         authorize (Role.SuperAdmin), getAll);
router.get('/:accountId',               authorize(), getById);
router.put('/:accountId',               authorize(Role.SuperAdmin), updateSchema, update);

router.delete('/:accountId',            authorize(Role.SuperAdmin), _delete);

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

    // accountService.authenticate returns { ...basicDetails(account), jwtToken, refreshToken: token }
    const account = await accountService.authenticate({ email, password, ipAddress, browserInfo });

    if (account.status === 'deactivated') {
      return res.status(403).json({ message: 'Account is deactivated. Contact administrator.' });
    }

    // set jwt cookie (if you want a jwt cookie) — keep same options as before
    res.cookie('token', account.jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 1000, // 1h
    });

    // set refresh-token cookie (httpOnly) — setTokenCookie already does this
    setTokenCookie(res, account.refreshToken);

    // return the account object (frontend expects account + jwtToken)
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
    
    accountService.getAllActivityLogs(filters)
        .then(logs => res.json({
            success: true,
            data: logs
        }))
        .catch(next);
}
async function refreshToken(req, res, next) {
    try {
      // try common locations for the refresh token
      const token =
        (req.cookies && req.cookies.refreshToken) ||
        req.body?.token ||
        req.get('x-refresh-token') ||
        req.headers['x-refresh-token'];
  
      // No token -> not logged in (choose 204 to avoid console noise)
      if (!token) {
        return res.status(204).end(); // or res.status(401).json({ message: 'No refresh token' });
      }
  
      // call service — wrap in try so service errors are handled
      let accountPayload;
      try {
        accountPayload = await accountService.refreshToken({ token, ipAddress: req.ip });
      } catch (serviceErr) {
        // service-level failure (invalid token / DB error). Distinguish if possible:
        if (serviceErr && serviceErr.message && serviceErr.message.toLowerCase().includes('invalid')) {
          return res.status(401).json({ message: 'Invalid or expired refresh token' });
        }
        // unexpected service error: log and forward
        console.error('refreshToken service error:', serviceErr);
        return res.status(500).json({ message: 'Internal error while refreshing token' });
      }
  
      // No payload => treat as unauthorized
      if (!accountPayload) {
        return res.status(401).json({ message: 'Invalid or expired refresh token' });
      }
  
      // success: return payload (tokens/account)
      return res.json(accountPayload);
    } catch (err) {
      console.error('refreshToken handler unexpected error:', err);
      // fallback: don't expose internal errors
      return res.status(500).json({ message: 'Unexpected server error' });
    }
  }
function revokeTokenSchema(req, res, next) { 
    const schema = Joi.object({
        token: Joi.string().empty('')
    });
    validateRequest(req, next, schema);
}
// function revokeToken (req, res, next) {
//     const token = req.body.token || req.cookies.refreshToken; 
//     const ipAddress = req.ip;

//     if (!token) return res.status(400).json({ message: 'Token is required' });
    
//     if (!req.user.ownsToken (token) && req.user.role !== Role.SuperAdmin) {
//         return res.status(401).json({ message: 'Unauthorized' });
//     }

//     accountService.revokeToken({token, ipAddress })
//         .then(() =>res.json({ message: 'Token revoked' }))
//         .catch(next);
// }
async function revokeToken (req, res, next) {
    try {
        const token = req.body.token || req.cookies.refreshToken;
        const ipAddress = req.ip;

        if (!token) return res.status(400).json({ message: 'Token is required' });

        // Find refresh token (validate it)
        const refreshToken = await db.RefreshToken.findOne({ where: { token } });
        if (!refreshToken || !refreshToken.isActive) {
            // Keep response consistent with service errors
            return res.status(400).json({ message: 'Invalid token' });
        }

        // Ensure token belongs to caller or caller is SuperAdmin
        if (refreshToken.accountId !== req.user.accountId && req.user.role !== Role.SuperAdmin) {
            return res.status(401).json({ message: 'Unauthorized' });
        }

        // Revoke via service (keeps single place for revoke logic)
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
        .then(() => res.json({ message: 'Registration successful, please check your email for verification instructions' })) 
        .catch(next);
}
async function existsAccount(req, res, next) {
    try {
      const total = await db.Account.count();
      const exists = (total && total > 0);
      return res.json({ exists });
    } catch (err) {
      console.error('accounts.exists error:', err && err.stack ? err.stack : err);
      return res.status(500).json({ message: 'Internal server error' });
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
        .then (account => res.json (account))
        .catch(next);
}
function getById(req, res, next) {
    accountService.getById(req.params.accountId)
        .then(account => account ? res.json(account) : res.sendStatus(404)) 
        .catch(next);
}
function createSchema (req, res, next) {
    const schema = Joi.object({
        title: Joi.string().required(), 
        firstName: Joi.string().required(), 
        lastName: Joi.string().required(), 
        email: Joi.string().email().required(),
        password: Joi.string().min(6).required(), 
        confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
        role: Joi.string().valid(Role. SuperAdmin, Role.Admin, Role.User, Role.StockroomAdmin, Role.Teacher).required(),
        status: Joi.string().valid('active','deactivated').optional(),
    });
    validateRequest(req, next, schema);
}
function create(req, res, next) {
    accountService.create(req.body) 
    .then (account => res.json (account)) 
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
        role: Joi.string().valid(Role. SuperAdmin, Role.Admin, Role.User, Role.StockroomAdmin, Role.Teacher).empty('')
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
  
      // soft delete
      await accountService.update(accountId, { status: 'deactivated' });
      res.json({ message: 'Account deactivated' });
    } catch (err) {
      next(err);
    }
}
function setTokenCookie(res, token) {
  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    expires: new Date(Date.now() + 7*24*60*60*1000)
  };
  res.cookie('refreshToken', token, cookieOptions);
}