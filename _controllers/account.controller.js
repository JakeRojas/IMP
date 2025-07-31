// main functions of account controller
// const express = require('express');
// const router = express. Router(); 
// const Joi = require('joi');
// const validateRequest = require('_middlewares/validate-request'); 
// const authorize = require('_middlewares/authorize');
// const Role = require('_helpers/role');
// const accountService = require('_services/account.service');

// router.post('/authenticate', authenticateSchema, authenticate);
// router.post('/refresh-token', refreshToken);
// router.post('/revoke-token', authorize(), revokeTokenSchema, revokeToken); 
// router.post('/register', authorize(Role.SuperAdmin), registerSchema, register);
// router.post('/verify-email', verifyEmailSchema, verifyEmail);
// router.post('/forgot-password', forgotPasswordSchema, forgotPassword);
// router.post('/validate-reset-token', validateResetTokenSchema, validateResetToken);
// router.post('/reset-password', resetPasswordSchema, resetPassword);

// router.get('/:id/preferences',authorize(), getPreferences);
// router.put('/:id/preferences',authorize(), updatePreferences);

// router.post('/:id/activity', authorize(), getActivities);
// router.get('/activity-logs', authorize(Role.SuperAdmin), getAllActivityLogs);

// router.get('/', authorize (Role.SuperAdmin), getAll);
// router.get('/:id', authorize(), getById);
// router.post('/create-user', authorize (Role.SuperAdmin), createSchema, create);
// router.put('/:id', authorize(), updateSchema, update);
// router.delete('/:id', authorize(Role.SuperAdmin), _delete);

// module.exports = router;

// function authenticateSchema(req, res, next) { 
//     const schema = Joi.object({
//         email: Joi.string().required(),
//         password: Joi.string().required()
//     });

//     validateRequest(req, next, schema);
// }
// async function authenticate(req, res, next) {
//     try {
//     const { email, password } = req.body;
//     const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
//     const browserInfo = req.headers['user-agent'] || 'Unknown Browser';

//     const { jwtToken, refreshToken, user } = await accountService.authenticate({ email, password, ipAddress, browserInfo });
//     res
//     .cookie('token', jwtToken, {
//       httpOnly: true,
//       secure: process.env.NODE_ENV === 'production',
//       sameSite: 'lax',
//       maxAge: 60 * 60 * 1000, // 1h
//     });
//     //.json({ success: true });

//     setTokenCookie(res, refreshToken);

//     return res.json({ success: true, user });
//   } catch (err) {
//     next(err);
//   }
//   }
// //===================Logging Function=======================================
// function getActivities(req, res, next) {
//     const filters = {
//         actionType: req.query.actionType,
//         startDate: req.query.startDate,
//         endDate: req.query.endDate
//     };
//     accountService.getAccountActivities(req.params.id, filters)
//         .then(activities => res.json(activities))
//         .catch(next);
// }
// function getAllActivityLogs(req, res, next) {
//     const filters = {
//         actionType: req.query.actionType,
//         startDate: req.query.startDate,
//         endDate: req.query.endDate,
//         userId: req.query.userId
//     };
    
//     accountService.getAllActivityLogs(filters)
//         .then(logs => res.json({
//             success: true,
//             data: logs
//         }))
//         .catch(next);
// }
// //====================Preferences Router Function=========================
// function getPreferences(req, res, next) {
//     accountService.getPreferences(req.params.id)
//         .then(preferences => res.json(preferences))
//         .catch(next);
// }
// function updatePreferences(req, res, next) {
//     accountService.updatePreferences(req.params.id, req.body)
//         .then(() => res.json({ message: 'Preferences updated successfully' }))
//         .catch(next);
// }
// function refreshToken (req, res, next) {
//     const token = req.cookies.refreshToken;
//     const ipAddress = req.ip;
//     accountService.refreshToken({ token, ipAddress })
//         .then(({refreshToken, ...account }) => {
//             setTokenCookie(res, refreshToken);
//             res.json(account);
//         })
//         .catch(next);
// }
// function revokeTokenSchema(req, res, next) { 
//     const schema = Joi.object({
//         token: Joi.string().empty('')
//     });
//     validateRequest(req, next, schema);
// }
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
// function registerSchema(req, res, next) {
//     const schema = Joi.object({
//         title: Joi.string().required(),
//         firstName: Joi.string().required(), 
//         lastName: Joi.string().required(),
//         email: Joi.string().email().required(),
//         phoneNumber: Joi.string().length(11).pattern(/^(09|\+639)\d{9}$/).required(),
//         password: Joi.string().min(6).required(),
//         confirmPassword: Joi.string().valid(Joi.ref('password')).required(), 
//         //acceptTerms: Joi.boolean().valid(true).required()
//     });
//     validateRequest(req, next, schema);
// }
// function register(req, res, next) {
//     accountService.register(req.body, req.get('origin'))
//         .then(() => res.json({ message: 'Registration successful, please check your email for verification instructions' })) 
//         .catch(next);
// }
// function verifyEmailSchema(req, res, next) {
//     const schema = Joi.object({
//         token: Joi.string().required()
//     });
//     validateRequest(req, next, schema);
// }
// function verifyEmail(req, res, next) {
//     accountService.verifyEmail(req.body)
//         .then(() => res.json({ message: 'Verification successful, you can now login' })) 
//         .catch(next);
// }
// function forgotPasswordSchema(req, res, next) {
//     const schema = Joi.object({
//         email: Joi.string().email().required()
//     });
//     validateRequest(req, next, schema);
// }
// function forgotPassword(req, res, next) {
//     accountService.forgotPassword(req.body, req.get('origin'))
//         .then(() => res.json({ message: 'Please check your email for password reset instructions' })) 
//         .catch(next);
// }
// function validateResetTokenSchema(req, res, next) {
//     const schema = Joi.object({
//         token: Joi.string().required()
//     });
//     validateRequest(req, next, schema);
// }
// function validateResetToken(req, res, next) {
//     accountService.validateResetToken(req.body)
//         .then(() => res.json({ message: 'Token is valid' }))
//         .catch(next);
// }
// function resetPasswordSchema(req, res, next) {
//     const schema = Joi.object({
//         token: Joi.string().required(),
//         password: Joi.string().min(6).required(),
//         confirmPassword: Joi.string().valid(Joi.ref('password')).required()
//     });
//     validateRequest(req, next, schema);
// }
// function resetPassword(req, res, next) {
//     const { token, password } = req.body;
//     const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
//     const browserInfo = req.headers['user-agent'] || 'Unknown Browser';
  
//     accountService.resetPassword({ token, password }, ipAddress, browserInfo)
//       .then(() => {
//         res.json({ message: 'Password reset successful, you can now login' });
//       })
//       .catch(next);
//   }
// function getAll(req, res, next) {
//     accountService.getAll()
//         .then (accounts => res.json (accounts))
//         .catch(next);
// }
// function getById(req, res, next) {
//     //Check if the user is trying to access their own account or is anSuperadmin
//     if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin) {
//         return res.status(403).json({ message: 'Access to other user\'s data is forbidden' });
//     }
    
//     accountService.getById(req.params.id)
//         .then(account => account ? res.json(account) : res.sendStatus(404)) 
//         .catch(next);
// }
// function createSchema (req, res, next) {
//     const schema = Joi.object({
//         title: Joi.string().required(), 
//         firstName: Joi.string().required(), 
//         lastName: Joi.string().required(), 
//         email: Joi.string().email().required(),
//         phoneNumber: Joi.string().length(11).pattern(/^(09|\+639)\d{9}$/).required(),  
//         password: Joi.string().min(6).required(), 
//         confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
//         role: Joi.string().valid(Role. SuperAdmin, Role.Admin, Role.User).required()
//     });
//     validateRequest(req, next, schema);
// }
// function create(req, res, next) {
//     accountService.create(req.body) 
//     .then (account => res.json (account)) 
//     .catch(next);
// }
// function updateSchema(req, res, next) { const schemaRules = {
//     title: Joi.string().empty(''), 
//     firstName: Joi.string().empty(''), 
//     lastName: Joi.string().empty(''),
//     email: Joi.string().email().empty(''),
//     phoneNumber: Joi.string().length(11).pattern(/^(09|\+639)\d{9}$/).empty(''),
//     password: Joi.string().min(6).empty(''),
//     confirmPassword: Joi.string().valid(Joi.ref('password')).empty('')
// }

// if (req.user.role === Role.SuperAdmin) {
//     schemaRules.role = Joi.string().valid (Role.SuperAdmin, Role.User, Role.Staff).empty('');
// }

//     const schema = Joi.object(schemaRules).with('password', 'confirmPassword'); 
//     validateRequest(req, next, schema);
// }
// function update(req, res, next) {
//     //Check authorization
//     if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin) {
//       return res.status(401).json({
//         success: false,
//         message: 'Unauthorized - You can only update your own account unless you are anSuperadmin'
//       });
//     }
  
//     const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
//     const browserInfo = req.headers['user-agent'] || 'Unknown Browser';
  
//     accountService.update(req.params.id, req.body, ipAddress, browserInfo)
//       .then(account => {
//         res.json({
//           success: true,
//           message: 'Account updated successfully',
//           account: account
//         });
//       })
//       .catch(next);
//   }
// function _delete(req, res, next) {
//     if (Number(req.params.id) !== req.user.id && req.user.role !== Role.Admin) {
//         return res.status(401).json({ message: 'Unauthorized' });
//     }
    
//     accountService.delete(req.params.id)
//         .then(() =>res.json({ message: 'Account deleted successfully' })) 
//         .catch(next);
// }  
// function setTokenCookie(res, token) {
//     const cookieOptions = {
//         httpOnly: true,
//         expires: new Date(Date.now() + 7*24*60*60*1000)
//     };
//     res.cookie('refreshToken', token, cookieOptions);
// }



const express           = require('express');
const router            = express.Router();
const Joi               = require('joi');
const validateRequest   = require('_middlewares/validate-request');
const { get }           = require('_helpers/registry');
const Role              = require('_helpers/role');

// Routes
router.post('/authenticate',            authenticateSchema, authenticate);
router.post('/refresh-token',           refreshToken);
router.post('/verify-email',            verifyEmailSchema, verifyEmail);
router.post('/forgot-password',         forgotPasswordSchema, forgotPassword);
router.post('/validate-reset-token',    validateResetTokenSchema, validateResetToken);
router.post('/reset-password',          resetPasswordSchema, resetPassword);
router.post('/revoke-token',            get('authorize')(),                     revokeTokenSchema, revokeToken);
router.post('/register',                get('authorize')([Role.SuperAdmin]),    registerSchema, register);
router.get('/:id/preferences',          get('authorize')(),                     getPreferences);
router.put('/:id/preferences',          get('authorize')(),                     updatePreferences);
router.post('/:id/activity',            get('authorize')(),                     getActivities);
router.get('/activity-logs',            get('authorize')([Role.SuperAdmin, Role.Admin]),    getAllActivityLogs);
router.get('/',                         get('authorize')([Role.SuperAdmin]),    getAll);
router.get('/:id',                      get('authorize')(),                     getById);
router.post('/create-user',             get('authorize')([Role.SuperAdmin]),    createSchema, create);
router.put('/:id',                      get('authorize')(),                     updateSchema, update);
router.delete('/:id',                   get('authorize')([Role.SuperAdmin]),    _delete);

module.exports = router;

// Schema validators
function authenticateSchema(req, res, next) {
  const schema = Joi.object({
    email: Joi.string().required(),
    password: Joi.string().required(),
  });
  validateRequest(req, next, schema);
}

function revokeTokenSchema(req, res, next) {
  const schema = Joi.object({ token: Joi.string().empty('') });
  validateRequest(req, next, schema);
}

function registerSchema(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string().length(11).pattern(/^(09|\+639)\d{9}$/).required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  });
  validateRequest(req, next, schema);
}

function verifyEmailSchema(req, res, next) {
  const schema = Joi.object({ token: Joi.string().required() });
  validateRequest(req, next, schema);
}

function forgotPasswordSchema(req, res, next) {
  const schema = Joi.object({ email: Joi.string().email().required() });
  validateRequest(req, next, schema);
}

function validateResetTokenSchema(req, res, next) {
  const schema = Joi.object({ token: Joi.string().required() });
  validateRequest(req, next, schema);
}

function resetPasswordSchema(req, res, next) {
  const schema = Joi.object({
    token: Joi.string().required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
  });
  validateRequest(req, next, schema);
}

function createSchema(req, res, next) {
  const schema = Joi.object({
    title: Joi.string().required(),
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    email: Joi.string().email().required(),
    phoneNumber: Joi.string().length(11).pattern(/^(09|\+639)\d{9}$/).required(),
    password: Joi.string().min(6).required(),
    confirmPassword: Joi.string().valid(Joi.ref('password')).required(),
    role: Joi.string().valid(Role.SuperAdmin, Role.Admin, Role.User).required(),
  });
  validateRequest(req, next, schema);
}

function updateSchema(req, res, next) {
  const rules = {
    title: Joi.string().empty(''),
    firstName: Joi.string().empty(''),
    lastName: Joi.string().empty(''),
    email: Joi.string().email().empty(''),
    phoneNumber: Joi.string().length(11).pattern(/^(09|\+639)\d{9}$/).empty(''),
    password: Joi.string().min(6).empty(''),
    confirmPassword: Joi.string().valid(Joi.ref('password')).empty(''),
  };
  if (req.user.role === Role.SuperAdmin) {
    rules.role = Joi.string().valid(Role.SuperAdmin, Role.Admin, Role.User).empty('');
  }
  const schema = Joi.object(rules).with('password', 'confirmPassword');
  validateRequest(req, next, schema);
}

// Controller handlers
async function authenticate(req, res, next) {
  try {
    const { email, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const browserInfo = req.headers['user-agent'] || 'Unknown Browser';
    const { jwtToken, refreshToken, user } = await get('authenticate')({ email, password, ipAddress, browserInfo });
    res.cookie('token', jwtToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 60*60*1000 });
    setTokenCookie(res, refreshToken);
    return res.json({ success: true, user });
  } catch (err) { next(err); }
}

async function refreshToken(req, res, next) {
  try {
    const token = req.cookies.refreshToken;
    const ipAddress = req.ip;
    const account = await get('refreshToken')({ token, ipAddress });
    setTokenCookie(res, account.refreshToken);
    res.json(account);
  } catch (err) { next(err); }
}

async function revokeToken(req, res, next) {
  try {
    const token = req.body.token || req.cookies.refreshToken;
    const ipAddress = req.ip;
    await get('revokeToken')({ token, ipAddress });
    res.json({ message: 'Token revoked' });
  } catch (err) { next(err); }
}

async function register(req, res, next) {
  try {
    await get('register')(req.body, req.get('origin'));
    res.json({ message: 'Registration successful, please check your email for verification instructions' });
  } catch (err) { next(err); }
}

async function verifyEmail(req, res, next) {
  try {
    await get('verifyEmail')(req.body);
    res.json({ message: 'Verification successful, you can now login' });
  } catch (err) { next(err); }
}

async function forgotPassword(req, res, next) {
  try {
    await get('forgotPassword')(req.body, req.get('origin'));
    res.json({ message: 'Please check your email for password reset instructions' });
  } catch (err) { next(err); }
}

async function validateResetToken(req, res, next) {
  try {
    await get('validateResetToken')(req.body);
    res.json({ message: 'Token is valid' });
  } catch (err) { next(err); }
}

async function resetPassword(req, res, next) {
  try {
    const { token, password } = req.body;
    const ipAddress = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const browserInfo = req.headers['user-agent'] || 'Unknown Browser';
    await get('resetPassword')({ token, password, ipAddress, browserInfo });
    res.json({ message: 'Password reset successful, you can now login' });
  } catch (err) { next(err); }
}

async function getPreferences(req, res, next) {
  try {
    const prefs = await get('getPreferences')(req.params.id);
    res.json(prefs);
  } catch (err) { next(err); }
}

async function updatePreferences(req, res, next) {
  try {
    await get('updatePreferences')(req.params.id, req.body);
    res.json({ message: 'Preferences updated successfully' });
  } catch (err) { next(err); }
}

async function getActivities(req, res, next) {
  try {
    const filters = { actionType: req.query.actionType, startDate: req.query.startDate, endDate: req.query.endDate };
    const activities = await get('getAccountActivities')(req.params.id, filters);
    res.json(activities);
  } catch (err) { next(err); }
}

async function getAllActivityLogs(req, res, next) {
  try {
    const filters = { actionType: req.query.actionType, startDate: req.query.startDate, endDate: req.query.endDate, userId: req.query.userId };
    const logs = await get('getAllActivityLogs')(filters);
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
}

async function getAll(req, res, next) {
  try {
    const accounts = await get('getAll')();
    res.json(accounts);
  } catch (err) { next(err); }
}

async function getById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const account = await get('getById')(id);
    if (!account) return res.sendStatus(404);
    res.json(account);
  } catch (err) { next(err); }
}

async function create(req, res, next) {
  try {
    const newAcc = await get('create')(req.body);
    res.json(newAcc);
  } catch (err) { next(err); }
}

async function update(req, res, next) {
  try {
    const id = Number(req.params.id);
    const updated = await get('update')(id, req.body);
    res.json({ success: true, message: 'Account updated successfully', account: updated });
  } catch (err) { next(err); }
}

async function _delete(req, res, next) {
  try {
    const id = Number(req.params.id);
    await get('delete')(id);
    res.json({ message: 'Account deleted successfully' });
  } catch (err) { next(err); }
}

// Helper to set refresh token cookie
function setTokenCookie(res, token) {
  res.cookie('refreshToken', token, { httpOnly: true, expires: new Date(Date.now() + 7*24*60*60*1000) });
}
