const { expressjwt: jwt }   = require('express-jwt');
const { secret }            = require('config.json');
const db                    = require('_helpers/db-handler');
const Role                  = require('_helpers/role');

module.exports = authorize;

function authorize(roles = []) {
    if (typeof roles === 'string') {
        roles = [roles];
    }

    return [
        jwt({ secret, algorithms: ['HS256'], requestProperty: 'auth' }),

        async (req, res, next) => {
            try {
                const account = await db.Account.findByPk(req.auth.accountId);
                if (!account) {
                    return res.status(401).json({ message: 'Account no longer exists' });
                }

                if (roles.length && !roles.includes(account.role)) {
                    return res.status(403).json({ message: 'Forbidden: insufficient permissions' });
                }

                req.user = { 
                    accountId: account.accountId, 
                    email: account.email, 
                    role: account.role };
                next();
            } catch (error) {
                console.error('Authorization error:', error);
                res.status(500).json({ message: 'Internal server error during authorization' });
            }
        }
    ];
}