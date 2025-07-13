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
db.Room = require('../_models/room.model')(sequelize);
db.RoomInventory = require('../_models/roomInventory.model')(sequelize);
db.Account = require('../_models/account.model')(sequelize);
db.ActivityLog = require('../_models/activitylog.model')(sequelize);
db.RefreshToken = require('../_models/refresh-token.model')(sequelize);
db.Item = require('../_models/item.model')(sequelize);

dbAssociations();

    await sequelize.sync({ alter: true }); 
}  

function dbAssociations() {
    // Account-Room owner relation
    db.Account.hasMany(db.Room, { foreignKey: 'roomInCharge', as: 'managedRooms' });
    db.Room.belongsTo(db.Account, { foreignKey: 'roomInCharge', as: 'ownerss' });

    // Room-Item many-to-many via RoomInventory
    db.Room.belongsTo(db.Item, { through: db.RoomInventory, foreignKey: 'roomId', otherKey: 'itemId' });
    db.Item.belongsTo(db.Room, { through: db.RoomInventory, foreignKey: 'itemId', otherKey: 'roomId' });

    // Direct join-model relations
    db.RoomInventory.belongsTo(db.Room, { foreignKey: 'roomId' });
    db.RoomInventory.belongsTo(db.Item, { foreignKey: 'itemId', as: 'Item' });
    db.Item.hasMany(db.RoomInventory, { foreignKey: 'itemId' });

    db.RoomInventory.belongsTo(db.Item, { foreignKey: 'itemId' });
    db.RoomInventory.belongsTo(db.Room, { foreignKey: 'roomId' });
    
}