const config            = require('config.json');
const mysql             = require('mysql2/promise');
const { Sequelize }     = require('sequelize');

module.exports = db = {};

initialize();
async function initialize() { 
    const { host, port, user, password, database } = config.database;
    const connection = await mysql.createConnection({ host, port, user, password });
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    
    await connection.end();

    const sequelize = new Sequelize(database, user, password, { host: 'localhost', dialect: 'mysql' });

// Initialize models and add them to the exported `db` object
db.Room             = require('../_models/room.model')(sequelize);
db.RoomInventory    = require('../_models/roomInventory.model')(sequelize);
db.Account          = require('../_models/account.model')(sequelize);
db.ActivityLog      = require('../_models/activitylog.model')(sequelize);
db.RefreshToken     = require('../_models/refresh-token.model')(sequelize);
db.Item             = require('../_models/item.model')(sequelize);

// Apparel models
db.Apparel          = require('../_models/apparel/apparel.model')(sequelize);
db.ReceiveApparel  = require('../_models/apparel/receiveApparel.model')(sequelize);
db.ReleaseApparel  = require('../_models/apparel/releaseApparel.model')(sequelize);
db.ApparelInventory = require('../_models/apparel/apparelInventory.model')(sequelize);

// Admin Supply models
db.AdminSupply             = require('../_models/adminSupply/adminSupply.model')(sequelize);
db.ReceiveAdminSupply     = require('../_models/adminSupply/receiveAdminSupply.model')(sequelize);

dbAssociations();

    await sequelize.sync({ alter: true }); 
}  

function dbAssociations() {
  // db.Account.hasMany(db.RefreshToken, { foreignKey: 'AccountId' });
  // db.RefreshToken.belongsTo(db.Account, { foreignKey: 'AccountId' });
  db.Account.hasMany(db.RefreshToken, { onDelete: 'CASCADE' });
  db.RefreshToken.belongsTo(db.Account);

    // Account - Room (owner)
  db.Account.hasMany(db.Room, { foreignKey: 'roomInCharge', as: 'managedRooms' });
  db.Room.belongsTo(db.Account, { foreignKey: 'roomInCharge', as: 'ownerss' });

  // Room <-> Item (many-to-many) via RoomInventory (join table)
  db.Room.belongsToMany(db.Item, {
    through: db.RoomInventory,
    foreignKey: 'roomId',
    otherKey: 'itemId',
    as: 'items'
  });
  db.Item.belongsToMany(db.Room, {
    through: db.RoomInventory,
    foreignKey: 'itemId',
    otherKey: 'roomId',
    as: 'rooms'
  });

  // Also keep direct RoomInventory ↔ Room, Item for convenience
  db.Room.hasMany(db.RoomInventory,   { foreignKey: 'roomId', as: 'inventories' });
  db.RoomInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

  db.Item.hasMany(db.RoomInventory,   { foreignKey: 'itemId', as: 'roomInventories' });
  db.RoomInventory.belongsTo(db.Item, { foreignKey: 'itemId', as: 'item' });

  // ReceiveApparel -> Apparel (per-unit) and Apparel -> ReceiveApparel (batch)
  db.ReceiveApparel.hasMany(db.Apparel, { foreignKey: 'receiveApparelId', as: 'apparel' });
  db.Apparel.belongsTo(db.ReceiveApparel, { foreignKey: 'receiveApparelId', as: 'batch' });

  // ReceiveAdminSupply -> AdminSupply (per-unit) and back
  db.ReceiveAdminSupply.hasMany(db.AdminSupply, { foreignKey: 'receiveAdminSupplyId', as: 'supplies' });
  db.AdminSupply.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId', as: 'batch' });

  // Apparel unit -> Item (each apparel unit references an Item row)
  db.Apparel.belongsTo(db.Item, { foreignKey: 'itemId', as: 'generalItem' });
  db.Item.hasOne(db.Apparel, { foreignKey: 'itemId', as: 'apparelUnit' });

  // Optional: AdminSupply -> Item if you also create Item rows for supplies
  // db.AdminSupply.belongsTo(db.Item, { foreignKey: 'itemId', as: 'generalItem' });
  // db.Item.hasOne(db.AdminSupply, { foreignKey: 'itemId', as: 'supplyDetail' });

  // ReceiveApparel -> Room (batch belongs to room) and Room -> ReceiveApparel
  db.ReceiveApparel.belongsTo(db.Room, { foreignKey: 'roomId', as: 'room' });
  db.Room.hasMany(db.ReceiveApparel, { foreignKey: 'roomId', as: 'receivedBatches' });

  // ApparelInventory (aggregate) belongs to Room and Room has many ApparelInventory rows
  db.Room.hasMany(db.ApparelInventory, { foreignKey: 'roomId', as: 'apparelInventory' });
  db.ApparelInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

  // ReleaseApparel should be linked to the ApparelInventory aggregate row (apparelInventoryId)
  db.ApparelInventory.hasMany(db.ReleaseApparel, { foreignKey: 'apparelInventoryId', as: 'releases' });
  db.ReleaseApparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId', as: 'inventory' });

  // Item <--> Receive models: Item rows should belong to their receive/batch (useful for includes)
  // (Item model defines receiveApparelId and receiveAdminSupplyId fields)
  db.ReceiveApparel.hasMany(db.Item, { foreignKey: 'receiveApparelId', as: 'items' });
  db.Item.belongsTo(db.ReceiveApparel, { foreignKey: 'receiveApparelId', as: 'receiveApparel' });

  db.ReceiveAdminSupply.hasMany(db.Item, { foreignKey: 'receiveAdminSupplyId', as: 'items' });
  db.Item.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId', as: 'receiveAdminSupply' });

}