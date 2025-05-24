const db = require('../_helpers/db-handler');
const bcrypt = require('bcryptjs');

module.exports = { 
  create, 
  getAll, 
  getById 
};

async function create({ password, ...rest }) {
  rest.passwordHash = await bcrypt.hash(password, 10);
  const u = await db.Account.create(rest);
  return { id: u.id, ...rest, created: u.created };
}
async function getAll() {
  return db.Account.findAll({ attributes: ['id','firstName','lastName','email'] });
}
async function getById(id) {
  return db.Account.findByPk(id, { attributes: ['id','firstName','lastName','email'] });
}