const config = require('config.json'); 
const jwt = require('jsonwebtoken'); 
const bcrypt = require('bcryptjs'); 
const crypto= require("crypto"); 
const { Op} = require('sequelize');
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
    update,
    delete: _delete,

    logActivity,
    getAccountActivities,
    getAllActivityLogs,

    updatePreferences,
    getPreferences
    
};


async function create(params) {
  const existingAccount = await db.Account.findOne({ where: { email: params.email } });
  if (existingAccount) {
      throw `Email "${params.email}" is already registered`;
  }
  const existingAccountNumber = await db.Account.findOne({ where: { phoneNumber: params.phoneNumber } });
  if (existingAccountNumber) {
      throw `PhoneNumber "${params.phoneNumber}" is already registered`;
  }
  
  const account = new db.Account(params);
  account.verified = Date.now();
  account.passwordHash = await hash(params.password);
  
  await account.save();
  
  return basicDetails(account);
}
async function update(id, params, ipAddress, browserInfo) {
  const account = await getAccount(id);
  const oldData = account.toJSON(); 
  const updatedFields = []; 
  const nonUserFields = ['ipAddress', 'browserInfo'];
  
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
  
      const updateDetails = updatedFields.length > 0 
          ? `Updated fields: ${updatedFields.join(', ')}` 
          : 'No fields changed';
  
      await logActivity(account.id, 'profile update', ipAddress || 'Unknown IP', browserInfo || 'Unknown Browser', updateDetails);
  } catch (error) {
      console.error('Error logging activity:', error);
  }
  
  return basicDetails(account);
}
async function _delete(id) {
  const account = await getAccount(id);
  await account.destroy();
}
async function getAll() {
  const accounts = await db.Account.findAll(); 
  return accounts.map(x => basicDetails(x));
}
async function getById(id) {
  const account = await getAccount(id); 
  return basicDetails (account);
}
async function register(params, origin) {
  if (await db.Account.findOne({ where: { email: params.email } })) {
      return await sendAlreadyRegisteredEmail (params.email, origin);
  }
  
  const account = new db.Account (params);

  const isFirstAccount = (await db.Account.count()) === 0; 
  account.role = isFirstAccount? Role.Admin: Role.User; 
  account.verificationToken = randomTokenString();
  
  account.passwordHash = await hash (params.password);
  
  await account.save();
  
  await db.Preferences.create(preferencesData);

  await sendVerificationEmail (account, origin);
}
async function authenticate({ email, password, ipAddress, browserInfo }) {
    const account = await db.Account.scope('withHash').findOne({ where: { email } });
  
    if (!(await bcrypt.compare(password, account.passwordHash))) {
      throw 'Email or password is incorrect';
    }
  
    const jwtToken = generateJwtToken(account);
    const refreshToken = generateRefreshToken(account, ipAddress);
  
    await refreshToken.save();
  
    try {
      await logActivity(account.id, 'login', ipAddress, browserInfo);
    } catch (error) {
      console.error('Error logging activity:', error);
    }
  
    return {
      ...basicDetails(account),
      jwtToken,
      refreshToken: refreshToken.token
    };
}
async function logActivity(AccountId, actionType, ipAddress, browserInfo, updateDetails = '') {
    try {
      await db.ActivityLog.create({
        AccountId,
        actionType,
        actionDetails: `IP Address: ${ipAddress}, Browser Info: ${browserInfo}, Details: ${updateDetails}`,
        timestamp: new Date()
      });
  
      const logCount = await db.ActivityLog.count({ where: { AccountId } });
  
      if (logCount > 10) {
        const logsToDelete = await db.ActivityLog.findAll({
          where: { AccountId },
          order: [['timestamp', 'ASC']],
          limit: logCount - 10
        });
  
        if (logsToDelete.length > 0) {
          const logIdsToDelete = logsToDelete.map(log => log.id);
  
          await db.ActivityLog.destroy({
            where: {
              id: {
                [Op.in]: logIdsToDelete
              }
            }
          });
          console.log(`Deleted ${logIdsToDelete.length} oldest log(s) for user ${AccountId}.`);
        }
      }
    } catch (error) {
      console.error('Error logging activity:', error);
      throw error;
    }
}
async function getAllActivityLogs(filters = {}) {
  try {
      let whereClause = {};
      
      if (filters.actionType) {
          whereClause.actionType = { [Op.like]: `%${filters.actionType}%` };
      }
      
      if (filters.userId) {
          whereClause.AccountId = filters.userId;
      }
      
      if (filters.startDate || filters.endDate) {
          const startDate = filters.startDate ? new Date(filters.startDate) : new Date(0);
          const endDate = filters.endDate ? new Date(filters.endDate) : new Date();
          whereClause.timestamp = { [Op.between]: [startDate, endDate] };
      }

      const logs = await db.ActivityLog.findAll({
          where: whereClause,
          include: [{
              model: db.Account,
              attributes: ['email', 'firstName', 'lastName', 'role'],
              required: true
          }],
          order: [['timestamp', 'DESC']]
      });

      return logs.map(log => {
          const formattedDate = new Intl.DateTimeFormat('en-US', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              hour12: true
          }).format(new Date(log.timestamp));

          return {
              id: log.id,
              userId: log.AccountId,
              userEmail: log.Account.email,
              userRole: log.Account.role,
              userName: `${log.Account.firstName} ${log.Account.lastName}`,
              actionType: log.actionType,
              actionDetails: log.actionDetails,
              timestamp: formattedDate
          };
      });
  } catch (error) {
      console.error('Error retrieving all activity logs:', error);
      throw new Error('Error retrieving activity logs');
  }
}
async function getAccountActivities(AccountId, filters = {}) {
  const account = await getAccount(AccountId);
  if (!account) throw new Error('User not found');

  let whereClause = { AccountId };

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
          id: activity.id,
          AccountId: activity.AccountId,
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
async function forgotPassword({ email }, origin) {
  const account = await db.Account.findOne({ where: { email } });

  if (!account) return;
  
  account.resetToken = randomTokenString();
  account.resetTokenExpires= new Date(Date.now() + 24*60*60*1000);
  await account.save();

  await sendPasswordResetEmail (account, origin);
}
async function resetPassword({ token, password }, ipAddress, browserInfo) {
  const account = await validateResetToken({ token });

   if (password.length < 6) {
    throw 'Password must be at least 6 characters';
}
  account.passwordHash = await hash(password);
  account.passwordReset = Date.now();
  account.resetToken = null;
  account.resetTokenExpires = null; // Clear the expiry
  await account.save();

  try {
    await logActivity(account.id, 'password_reset', ipAddress, browserInfo);
  } catch (error) {
    console.error('Error logging activity:', error);
  }

  return;
}
async function refreshToken({ token, ipAddress }) { 
    const refreshToken = await getRefreshToken(token); 
    const account = await refreshToken.getAccount();

    const newRefreshToken = generateRefreshToken (account, ipAddress); 
    refreshToken.revoked = Date.now();
    refreshToken.revokedByIp = ipAddress;
    refreshToken.replacedByToken = newRefreshToken.token;
    await refreshToken.save();
    await newRefreshToken.save();
    
    const jwtToken = generateJwtToken(account);
    
    return {
        ...basicDetails (account),
        jwtToken,
        refreshToken: newRefreshToken.token
    };
}
async function revokeToken({ token, ipAddress }) { 
    const refreshToken = await getRefreshToken (token);
    
    refreshToken.revoked = Date.now();
    refreshToken.revokedByIp = ipAddress; 
    await refreshToken.save();
}
async function verifyEmail({token}) {
    const account = await db.Account.findOne({ where: { verificationToken: token} });

    if (!account) throw 'Verification failed';

    account.verified = Date.now();
    account.verificationToken = null; 
    await account.save();
}
async function validateResetToken({token}) { 
    const account = await db.Account.findOne({ 
        where: {
            resetToken: token,
            resetTokenExpires: { [Op.gt]: Date.now() }
        }
    });

    if (!account) throw 'Invalid token';

    return account;
}
async function getAccount (id) {
  const account = await db.Account.findByPk(id); 
  if (!account) throw 'Account not found';
  return account;
}
async function getRefreshToken(token) {
  const refreshToken = await db.RefreshToken.findOne({ where: {token} });
  if (!refreshToken || !refreshToken.isActive) throw 'Invalid token'; 
  return refreshToken;
}
async function hash (password) {
  return await bcrypt.hash (password, 10);
}
function generateJwtToken(account) {
  return jwt.sign({ sub: account.id, id: account.id}, config.secret, { expiresIn: '1h' });
}
function generateRefreshToken(account, ipAddress) {
  return new db.RefreshToken({
      AccountId: account.id, // Set the AccountId field
      token: randomTokenString(),
      expires: new Date(Date.now() + 7*24*60*60*1000), 
      createdByIp: ipAddress
  });
}
function randomTokenString() {
  return crypto.randomBytes (40).toString('hex');
}
function basicDetails(account) {
  const { id, title, firstName, lastName, email, phoneNumber, role, created, updated, isVerified, BranchId } = account; 
  return { id, title, firstName, lastName, email, phoneNumber, role, created, updated, isVerified, BranchId };
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
  } else { message = `
      <p>If you don't know your password you can reset it via the <code>/account/forgot-password</code> api route.</p>`;
  }

  await sendEmail({
      to: email,
      subject: 'Sign-up Verification API - Email Already Registered',
      html: `<h4>Email Already Registered</h4>
      <p>Your email <strong>${email}</strong> is already registered.</p> ${message}`
  });
}
async function sendPasswordResetEmail (account, origin) {
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

//===================Preferences Get & Update Function===========================
async function getPreferences(id) {
  const preferences = await db.Preferences.findOne({
      where: { AccountId: id },
      attributes: ['id', 'userId','theme', 'notifications', 'language']
  });
  if (!preferences) throw new Error('User not found');
  return preferences;
}
async function updatePreferences(id, params) {
  const preferences = await db.Preferences.findOne({ where: { AccountId: id } });
  if (!preferences) throw new Error('User not found');

  // Update only the provided fields
  Object.assign(preferences, params);

  await preferences.save();
}

    