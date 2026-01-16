let config = {};
try {
  config = require('config.json');
} catch (e) {
  // config.json not found
}
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require("crypto");
const { Op } = require('sequelize');

const sendEmail = require('_helpers/send-email');
const db = require('_helpers/db-handler');
const Role = require('_helpers/role');

module.exports = {
  authenticate,
  refreshToken,
  revokeToken,
  register,
  verifyEmail,
  forgotPassword,
  validateResetToken,
  resetPassword,
  getAll,
  getById,
  create,
  logActivity,
  getAccountActivities,
  getAllActivityLogs,
  update,
  delete: _delete,
};

async function authenticate({ email, password, ipAddress, browserInfo }) {
  const normalizedEmail = email.trim().toLowerCase();
  const account = await db.Account.scope('withHash').findOne({ where: { email: normalizedEmail } });

  if (!account || !account.isVerified || !(await bcrypt.compare(password, account.passwordHash))) {
    throw 'Email or password is incorrect';
  }

  // if (!user.isActive) {
  //   return res.status(401).json({ message: 'Account is deactivated. Please contact an administrator.' });
  // }

  const jwtToken = generateJwtToken(account);
  const refreshToken = generateRefreshToken(account, ipAddress);

  await refreshToken.save();

  try {
    await logActivity(account.accountId, 'login', ipAddress, browserInfo);
  } catch (error) {
    console.error('Error logging activity:', error);
  }

  return {
    ...basicDetails(account),
    jwtToken,
    refreshToken: refreshToken.token
  };
}
async function logActivity(accountId, actionType, ipAddress, browserInfo, updateDetails = '') {
  try {
    // Create a new log entry in the 'activity_log' table
    await db.ActivityLog.create({
      accountId,
      actionType,
      actionDetails: `IP Address: ${ipAddress}, Browser Info: ${browserInfo}, Details: ${updateDetails}`,
      timestamp: new Date()
    });

    // Count the number of logs for the user
    const logCount = await db.ActivityLog.count({ where: { accountId } });

    if (logCount > 100) {
      // Find and delete the oldest logs
      const logsToDelete = await db.ActivityLog.findAll({
        where: { accountId },
        order: [['timestamp', 'ASC']],
        limit: logCount - 100
      });

      if (logsToDelete.length > 0) {
        const logIdsToDelete = logsToDelete.map(log => log.activityLogId);

        await db.ActivityLog.destroy({
          where: {
            activityLogId: {
              [Op.in]: logIdsToDelete
            }
          }
        });
        console.log(`Deleted ${logIdsToDelete.length} oldest log(s) for user ${accountId}.`);
      }
    }
  } catch (error) {
    console.error('Error logging activity:', error);
    throw error;
  }
}
async function getAllActivityLogs(filters = {}, { page = 1, limit = 10 } = {}) {
  try {
    let whereClause = {};

    // Apply filters
    if (filters.actionType) {
      whereClause.actionType = { [Op.like]: `%${filters.actionType}%` };
    }

    if (filters.userId) {
      whereClause.accountId = filters.userId;
    }

    if (filters.startDate || filters.endDate) {
      const startDate = filters.startDate ? new Date(filters.startDate) : new Date(0);
      const endDate = filters.endDate ? new Date(filters.endDate) : new Date();

      // Adjust endDate to be the end of that day (23:59:59.999) if it was provided as a date string
      if (filters.endDate) {
        endDate.setHours(23, 59, 59, 999);
      }

      whereClause.timestamp = { [Op.between]: [startDate, endDate] };
    }

    const offset = (page - 1) * limit;

    // Get all activity logs with user details
    const { count, rows } = await db.ActivityLog.findAndCountAll({
      where: whereClause,
      include: [{
        model: db.Account,
        attributes: ['email', 'firstName', 'lastName', 'role'],
        required: true
      }],
      order: [['timestamp', 'DESC']],
      limit: limit,
      offset: offset
    });

    // Format the response
    const logs = rows.map(log => {
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(new Date(log.timestamp));

      return {
        activityLogId: log.activityLogId,
        userId: log.accountId,
        userEmail: log.Account.email,
        userRole: log.Account.role,
        userName: `${log.Account.firstName} ${log.Account.lastName}`,
        actionType: log.actionType,
        actionDetails: log.actionDetails,
        timestamp: formattedDate
      };
    });

    return { logs, total: count };
  } catch (error) {
    console.error('Error retrieving all activity logs:', error);
    throw new Error('Error retrieving activity logs');
  }
}
async function getAccountActivities(accountId, filters = {}) {
  const account = await getAccount(accountId);
  if (!account) throw new Error('User not found');

  let whereClause = { accountId };

  // Apply optional filters such as action type and timestamp range
  if (filters.actionType) {
    whereClause.actionType = { [Op.like]: `%${filters.actionType}%` };
  }
  if (filters.startDate || filters.endDate) {
    const startDate = filters.startDate ? new Date(filters.startDate) : new Date(0);
    const endDate = filters.endDate ? new Date(filters.endDate) : new Date();
    whereClause.timestamp = { [Op.between]: [startDate, endDate] };
  }

  try {
    const activities = await db.ActivityLog.findAll({ where: whereClause });
    return activities.map(activity => {
      const formattedDate = new Intl.DateTimeFormat('en-US', {
        year: '2-digit',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(new Date(activity.timestamp));

      return {
        activityLogId: activity.activityLogId,
        accountId: activity.accountId,
        actionType: activity.actionType,
        actionDetails: activity.actionDetails,
        timestamp: formattedDate
      };
    });
  } catch (error) {
    console.error('Error retrieving activities:', error);
    throw new Error('Error retrieving activities');
  }
}
async function refreshToken({ token, ipAddress }) {
  const refreshToken = await getRefreshToken(token);
  const account = await refreshToken.getAccount();

  const newRefreshToken = generateRefreshToken(account, ipAddress);
  refreshToken.revoked = Date.now();
  refreshToken.revokedByIp = ipAddress;
  refreshToken.replacedByToken = newRefreshToken.token;
  await refreshToken.save();
  await newRefreshToken.save();

  const jwtToken = generateJwtToken(account);

  return {
    ...basicDetails(account),
    jwtToken,
    refreshToken: newRefreshToken.token
  };
}
async function revokeToken({ token, ipAddress }) {
  const refreshToken = await getRefreshToken(token);

  refreshToken.revoked = Date.now();
  refreshToken.revokedByIp = ipAddress;
  await refreshToken.save();
}
async function register(params, origin) {
  params.email = params.email.trim().toLowerCase();
  if (await db.Account.findOne({ where: { email: params.email } })) {
    return await sendAlreadyRegisteredEmail(params.email, origin);
  }

  const account = new db.Account(params);

  // Check if this is the first account EVER in the system
  const totalAccountsFound = await db.Account.count();
  const isFirstAccount = totalAccountsFound === 0;

  account.role = isFirstAccount ? Role.SuperAdmin : (params.role || Role.User);

  // Auto-verify if first account, otherwise standard token
  if (isFirstAccount) {
    account.verified = new Date();
    account.status = 'active';
    console.log(`[AccountService] First account detected (${params.email}). Auto-verifying and assigning SuperAdmin role.`);
  } else {
    account.verificationToken = randomTokenString();
  }

  account.passwordHash = await hash(params.password);

  await account.save();

  if (!isFirstAccount) {
    await sendVerificationEmail(account, origin);
  } else {
    console.log(`[AccountService] Skipping verification email for first account (${params.email}).`);
  }
}
async function verifyEmail({ token }) {
  const account = await db.Account.findOne({ where: { verificationToken: token } });

  if (!account) throw 'Verification failed';

  account.verified = Date.now();
  account.verificationToken = null;
  await account.save();
}
async function forgotPassword({ email }, origin) {
  const account = await db.Account.findOne({ where: { email } });

  if (!account) return;

  account.resetToken = randomTokenString();
  account.resetTokenExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await account.save();

  await sendPasswordResetEmail(account, origin);
}
async function validateResetToken({ token }) {
  const account = await db.Account.findOne({
    where: {
      resetToken: token,
      resetTokenExpires: { [Op.gt]: Date.now() }
    }
  });

  if (!account) throw 'Invalid token';

  return account;
}
async function resetPassword({ token, password }, ipAddress, browserInfo) {
  const account = await validateResetToken({ token });

  // Add password validation if needed
  if (password.length < 6) {
    throw 'Password must be at least 6 characters';
  }
  account.passwordHash = await hash(password);
  account.passwordReset = Date.now();
  account.resetToken = null;
  account.resetTokenExpires = null; // Clear the expiry
  await account.save();

  try {
    await logActivity(account.accountId, 'password_reset', ipAddress, browserInfo);
  } catch (error) {
    console.error('Error logging activity:', error);
  }

  return;
}
async function getAll() {

  const account = await db.Account.findAll({
    attributes: ['accountId', 'title', 'email', 'firstName', 'lastName', 'email', 'role', 'status']
  });

  return account;
}
async function getById(accountId) {
  const account = await db.Account.findByPk(accountId);
  return account;
}
async function create(params) {
  // Check if the email is already registered
  const existingAccount = await db.Account.findOne({ where: { email: params.email } });
  if (existingAccount) {
    throw `Email "${params.email}" is already registered`;
  }

  const account = new db.Account(params);
  account.verified = Date.now();
  account.passwordHash = await hash(params.password);

  // Save the account
  await account.save();
  return account;
}
async function update(accountId, params, ipAddress, browserInfo) {
  const account = await getAccount(accountId);
  const oldData = account.toJSON();
  const updatedFields = [];
  const nonUserFields = ['ipAddress', 'browserInfo'];

  // Check if any meaningful changes are being made
  const hasChanges = Object.keys(params).some(key =>
    !nonUserFields.includes(key) &&
    params[key] !== undefined &&
    params[key] !== oldData[key]
  );

  if (!hasChanges) {
    return basicDetails(account);
  }

  if (params.email && account.email !== params.email && await db.Account.findOne({ where: { email: params.email } })) {
    throw 'Email "' + params.email + '" is already taken';
  }

  if (params.password) {
    params.passwordHash = await hash(params.password);
  }

  for (const key in params) {
    if (params.hasOwnProperty(key) && !nonUserFields.includes(key)) {
      if (oldData[key] !== params[key]) {
        updatedFields.push(`${key}: ${oldData[key]} -> ${params[key]}`);
      }
    }
  }

  Object.assign(account, params);
  account.updated = Date.now();

  try {
    await account.save();

    // Log activity with updated fields
    const updateDetails = updatedFields.length > 0
      ? `Updated fields: ${updatedFields.join(', ')}`
      : 'No fields changed';

    await logActivity(account.accountId, 'profile update', ipAddress || 'Unknown IP', browserInfo || 'Unknown Browser', updateDetails);
  } catch (error) {
    console.error('Error logging activity:', error);
  }

  return basicDetails(account);
}
async function _delete(accountId) {
  const account = await getAccount(accountId);
  await account.status === 'deactivated';
}
async function getAccount(accountId) {
  const account = await db.Account.findByPk(accountId);
  if (!account) throw 'Account not found';
  return account;
}
async function getRefreshToken(token) {
  const refreshToken = await db.RefreshToken.findOne({ where: { token } });
  if (!refreshToken || !refreshToken.isActive) throw 'Invalid token';
  return refreshToken;
}
async function hash(password) {
  return await bcrypt.hash(password, 10);
}
function generateJwtToken(account) {
  const secret = process.env.SECRET || config.secret;
  return jwt.sign({ sub: account.accountId, accountId: account.accountId }, secret, { expiresIn: '1h' });
}
function generateRefreshToken(account, ipAddress) {
  return new db.RefreshToken({
    accountId: account.accountId,
    token: randomTokenString(),
    expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    createdByIp: ipAddress
  });
}
function randomTokenString() {
  return crypto.randomBytes(40).toString('hex');
}
function basicDetails(account) {
  const { accountId, title, firstName, lastName, email, phoneNumber, role, created, updated, isVerified } = account;
  return { accountId, title, firstName, lastName, email, phoneNumber, role, created, updated, isVerified };
}
async function sendVerificationEmail(account, origin) {
  let message;
  if (origin) {
    const verifyUrl = `${origin}/account/verify-email?token=${account.verificationToken}`;
    message = `<p>Please click the below link to verify your email address:</p>;
                   <p><a href="${verifyUrl}">${verifyUrl}</a></p>`;
  } else {
    message = `<p>Please use the below token to verify your email address with the <code>/account/verify-email</code> api route:</p> 
                   <p><code>${account.verificationToken}</code></p>`;
  }

  await sendEmail({
    to: account.email,
    subject: 'Sign-up Verification API - Verify Email',
    html: `<h4>Verify Email</h4>
          <p>Thanks for registering!</p> 
          ${message}`
  });
}
async function sendAlreadyRegisteredEmail(email, origin) {
  let message;
  if (origin) {
    message = `
        <p>If you don't know your password please visit the <a href="${origin}/account/forgot-password">forgot password</a> page.</p>`;
  } else {
    message = `
        <p>If you don't know your password you can reset it via the <code>/account/forgot-password</code> api route.</p>`;
  }

  await sendEmail({
    to: email,
    subject: 'Sign-up Verification API - Email Already Registered',
    html: `<h4>Email Already Registered</h4>
        <p>Your email <strong>${email}</strong> is already registered.</p> ${message}`
  });
}
async function sendPasswordResetEmail(account, origin) {
  let message;
  if (origin) {
    const resetUrl = `${origin}/account/reset-password?token=${account.resetToken}`;
    message = `<p>Please click the below link to reset your password, the link will be valid for 1 day:</p>
                   <p><a href="${resetUrl}">${resetUrl}</a></p>`;
  } else {
    message = `<p>Please use the below token to reset your password with the <code>/account/reset-password</code> api route:</p> 
                   <p><code>${account.resetToken}</code></p>`;
  }

  await sendEmail({
    to: account.email,
    subject: 'Sign-up Verification API - Reset Password',
    html: `<h4>Reset Password Email</h4>
          ${message}`
  });
}