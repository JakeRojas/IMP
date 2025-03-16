const config = require('config.json');
const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');

module.exports = db = {};

initialize();
async function initialize() { 
    const { host, port, user, password, database } = config.database;
    const connection = await mysql.createConnection({ host, port, user, password });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    
    await connection.end();

    const sequelize = new Sequelize(database, user, password, { host: 'localhost', dialect: 'mysql' });

// Initialize models and add them to the exported `db` object
db.Apparel = require('../apparel/apparel.model')(sequelize);
db.Stockroom = require('../stockroom/stockroom.model')(sequelize);
db.RoomInventory = require('../room/room.model')(sequelize);
db.ItemRequest = require('../request/request.model')(sequelize);

dbAssociations();

    await sequelize.sync({ alter: true });
} 

function dbAssociations() {
    db.Apparel.hasMany(db.Stockroom, { foreignKey: 'apparelId'});
    db.Stockroom.belongsTo(db.Apparel, { foreignKey: 'apparelId' });
}