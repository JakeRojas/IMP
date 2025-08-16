// const { register }      = require('_helpers/registry');
// const accountService    = require('_services/account.service');
// const authorize         = require('_middlewares/authorize');

// // --- auth flows ---
// register('authenticate',       params  => accountService.authenticate(params));
// register('refreshToken',       params  => accountService.refreshToken(params));
// register('revokeToken',        params  => accountService.revokeToken(params));
// register('register',           (...args) => accountService.register(...args));
// register('verifyEmail',        params  => accountService.verifyEmail(params));
// register('forgotPassword',     (...args) => accountService.forgotPassword(...args));
// register('validateResetToken', params  => accountService.validateResetToken(params));
// register('resetPassword',      params  => accountService.resetPassword(params));

// // --- preferences ---
// register('getPreferences',     id      => accountService.getPreferences(id));
// register('updatePreferences',  (id, b) => accountService.updatePreferences(id, b));

// // --- activity logs ---
// register('getAccountActivities', (id, filters) =>
//   accountService.getAccountActivities(id, filters)
// );
// register('getAllActivityLogs', filters =>
//   accountService.getAllActivityLogs(filters)
// );

// // --- user management ---
// register('getAll',      ()          => accountService.getAll());
// register('getById',     id          => accountService.getById(id));
// register('create',      data        => accountService.create(data));
// register('update',      (id, data)  => accountService.update(id, data));
// register('delete',      id          => accountService.delete(id));

// // And finally the authorize middleware factory:
// register('authorize', roles => authorize(roles));






// // // Register our auth handlers
// // register('authenticate', async ({ email, password, ipAddress, browserInfo }) =>
// //   accountService.authenticate({ email, password, ipAddress, browserInfo })
// // );

// // register('refreshToken', async ({ token, ipAddress }) =>
// //   accountService.refreshToken({ token, ipAddress })
// // );

// // register('revokeToken', async ({ token, ipAddress }) =>
// //   accountService.revokeToken({ token, ipAddress })
// // );

// // // Register the authorize middleware factory
// // register('authorize', roles => authorize(roles));