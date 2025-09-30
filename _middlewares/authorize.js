const { expressjwt: jwt }   = require('express-jwt');
const { secret }            = require('config.json');
const db                    = require('_helpers/db-handler');
const Role                  = require('_helpers/role');

module.exports = authorize;

// main
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
                const account = await db.Account.findByPk(req.auth.accountId);
                if (!account) {
                    return res.status(401).json({ message: 'Account no longer exists' });
                }

                // Disallow if role not in allowed list
                if (roles.length && !roles.includes(account.role)) {
                    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
                }

                // Attach essential user details to req.user
                req.user = { accountId: account.accountId, email: account.email, role: account.role };
                next();
            } catch (error) {
                console.error('Authorization error:', error);
                res.status(500).json({ message: 'Internal server error during authorization' });
            }
        }
        // async (req, res, next) => {
        //     try {
        //       // defensive: ensure express-jwt produced req.auth
        //       if (!req.auth || !req.auth.accountId) {
        //         return res.status(401).json({ message: 'Unauthorized' });
        //       }
          
        //       const account = await db.Account.findByPk(req.auth.accountId);
        //       if (!account) {
        //         return res.status(401).json({ message: 'Account no longer exists' });
        //       }
          
        //       // role check...
        //       if (roles.length && !roles.includes(account.role)) {
        //         return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
        //       }
          
        //       req.user = { accountId: account.accountId, email: account.email, role: account.role };
        //       next();
        //     } catch (error) {
        //       console.error('Authorization error:', error);
        //       res.status(500).json({ message: 'Internal server error during authorization' });
        //     }
        //   }
    ];
}