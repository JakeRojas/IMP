// const { expressjwt: jwt } = require('express-jwt');
// const { secret } = require('config.json');
// const db = require('_helpers/db-handler');
// const Role = require('_helpers/role');

// module.exports = authorize;

// function authorize(roles = []) {
//     // Convert single role to array if string is provided
//     if (typeof roles === 'string') {
//         roles = [roles];
//     }

//     return [
//         // Authenticate JWT token and attach decoded token to request as req.auth
//         jwt({ 
//             secret, /* process.env.JWT_SECRET */
//             algorithms: ['HS256'],
//             requestProperty: 'auth'
//         }),

//         // Authorize based on user role
//         async (req, res, next) => {
//             try {
//                 const account = await db.Account.findByPk(req.auth.id);
//                 if (!account) {
//                     return res.status(401).json({ message: 'Account no longer exists' });
//                 }
//                 if (roles.length && !roles.includes(account.role)) {
//                     return res.status(401).json({ message: 'Unauthorized - Insufficient role permissions' });
//                 }

//                 // Attach user details to req.user
//                 req.user = {
//                     id: account.id,
//                     email: account.email,
//                     role: account.role,
//                     ownsToken: token => account.getRefreshTokens().then(tokens =>
//                         tokens.some(x => x.token === token)
//                     )
//                 };

//                 // // authentication and authorization successful
//                 // // attach user and role to request object
//                 // req.user = {
//                 //     ...req.auth,
//                 //     role: account.role,
//                 //     BranchId: account.BranchId  // Make sure this is being set correctly
//                 // };
                
//                 // // Add method to check if user owns a refresh token
//                 // const refreshTokens = await account.getRefreshTokens();
//                 // req.user.ownsToken = token => !!refreshTokens.find(x => x.token === token);

//                 // Log authorization attempt
//                 console.log(`Authorization successful for user ${account.email} with role ${account.role}`);

//                 next();
//             } catch (error) {
//                 console.error('Authorization error:', error);
//                 return res.status(500).json({
//                     success: false,
//                     message: 'Internal server error during authorization'
//                 });
//             }
//         }
//     ];
// }

const { expressjwt: jwt } = require('express-jwt');
const { secret } = require('config.json');
const db = require('_helpers/db-handler');
const Role = require('_helpers/role');

module.exports = authorize;

/**
 * Protect routes based on JWT and user role.
 * @param {string|string[]} roles - allowed roles for this route
 */
function authorize(roles = []) {
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return [
        // 1) Authenticate JWT token and attach decoded token to request as req.auth
        jwt({ secret, algorithms: ['HS256'], requestProperty: 'auth' }),

        // 2) Authorize based on user role
        async (req, res, next) => {
            try {
                const account = await db.Account.findByPk(req.auth.id);
                if (!account) {
                    return res.status(401).json({ message: 'Account no longer exists' });
                }

                // Disallow if role not in allowed list
                if (roles.length && !roles.includes(account.role)) {
                    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
                }

                // Attach essential user details to req.user
                req.user = { id: account.id, email: account.email, role: account.role };
                next();
            } catch (error) {
                console.error('Authorization error:', error);
                res.status(500).json({ message: 'Internal server error during authorization' });
            }
        }
    ];
}