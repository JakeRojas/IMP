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
db.Account          = require('../_models/account.model')(sequelize);
db.ActivityLog      = require('../_models/activitylog.model')(sequelize);
db.RefreshToken     = require('../_models/refresh-token.model')(sequelize);

// Apparel models
db.Apparel            = require('../_models/apparel/apparel.model')(sequelize);
db.ReceiveApparel     = require('../_models/apparel/receiveApparel.model')(sequelize);
db.ReleaseApparel     = require('../_models/apparel/releaseApparel.model')(sequelize);
db.ApparelInventory   = require('../_models/apparel/apparelInventory.model')(sequelize);

// Admin Supply models
db.AdminSupply              = require('../_models/adminSupply/adminSupply.model')(sequelize);
db.ReceiveAdminSupply       = require('../_models/adminSupply/receiveAdminSupply.model')(sequelize);
db.ReleaseAdminSupply      = require('../_models/adminSupply/releaseAdminSupply.model')(sequelize);
db.AdminSupplyInventory     = require('../_models/adminSupply/adminSupplyInventory.model')(sequelize);

// Item models
db.GenItem            = require('../_models/genItem/genItem.model')(sequelize);
db.ReceiveGenItem     = require('../_models/genItem/receiveGenItem.model')(sequelize);
db.ReleaseGenItem     = require('../_models/genItem/releaseGenItem.model')(sequelize);
db.GenItemInventory   = require('../_models/genItem/genItemInventory.model')(sequelize);

// Qr code models
db.Qr = require('../_models/qr.model')(sequelize);

// Request models
db.StockRequest = require('../_models/request/stock.request.model')(sequelize);
db.ItemRequest  = require('../_models/request/item.request.model')(sequelize);

// Transfer models
db.Transfer = require('../_models/transfer.model')(sequelize);

dbAssociations();

    await sequelize.sync({ alter: true }); 
}  

function dbAssociations() {
  // ---------------- Account / Auth ----------------
  // Account -> RefreshToken : store JWT refresh tokens for an account (cascade delete)
  db.Account.hasMany(db.RefreshToken, { onDelete: 'CASCADE' });
  db.RefreshToken.belongsTo(db.Account);

  // ---------------- Account / Room ----------------
  // [Label] Account (roomInCharge) -> Room : which account is in charge of a room
  db.Account.hasMany(db.Room, { foreignKey: 'roomInCharge' });
  db.Room.belongsTo(db.Account, { foreignKey: 'roomInCharge' });

  // ---------- APPAREL / BATCH / ROOM associations ----------
  // ReceiveApparel -> Apparel (per-unit), keep alias 'apparel' (matches prior code)
  db.ReceiveApparel.hasMany(db.Apparel, { foreignKey: 'receiveApparelId' });
  db.Apparel.belongsTo(db.ReceiveApparel, { foreignKey: 'receiveApparelId' });

  // ReceiveApparel -> Room (batch belongs to room) and Room -> ReceiveApparel
  db.ReceiveApparel.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReceiveApparel, { foreignKey: 'roomId' });

  // Apparel may optionally belong to a Room directly (if your model has roomId)
  // Keep these so code that queries by Apparel.roomId keeps working if the attribute exists.
  db.Apparel.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.Apparel, { foreignKey: 'roomId' });

  // ApparelInventory (aggregate) belongs to Room and Room has many ApparelInventory rows
  db.Room.hasMany(db.ApparelInventory, { foreignKey: 'roomId' });
  db.ApparelInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

  // ApparelInventory <-> ReleaseApparel
  db.ApparelInventory.hasMany(db.ReleaseApparel, { foreignKey: 'apparelInventoryId' });
  db.ReleaseApparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId'  });

  // ApparelInventory -> Apparel (optional relation if your model uses apparelInventoryId)
  db.ApparelInventory.hasMany(db.Apparel, { foreignKey: 'apparelInventoryId' });
  db.Apparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId' });

  // ---------- ADMIN SUPPLY associations ----------
  db.ReceiveAdminSupply.hasMany(db.AdminSupply, { foreignKey: 'receiveAdminSupplyId' });
  db.AdminSupply.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId' });

  db.Account.hasMany(db.ReceiveApparel, { foreignKey: 'accountId'});
  db.ReceiveApparel.belongsTo(db.Account, { foreignKey: 'accountId'});

  db.Account.hasMany(db.ReceiveAdminSupply, { foreignKey: 'accountId'});
  db.ReceiveAdminSupply.belongsTo(db.Account, { foreignKey: 'accountId'});

  db.Account.hasMany(db.ReceiveGenItem, { foreignKey: 'accountId'});
  db.ReceiveGenItem.belongsTo(db.Account, { foreignKey: 'accountId'});

  db.Account.hasMany(db.ReleaseApparel, { foreignKey: 'accountId'});
  db.ReleaseApparel.belongsTo(db.Account, { foreignKey: 'accountId'});

  db.ReleaseApparel.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReleaseApparel, { foreignKey: 'roomId' });

  db.ReceiveGenItem.hasMany(db.GenItem, { foreignKey: 'receiveGenItemId' });
  db.GenItem.belongsTo(db.ReceiveGenItem, { foreignKey: 'receiveGenItemId' });

  db.AdminSupply.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.AdminSupply, { foreignKey: 'roomId' });



  // ---------------- STOCK REQUEST associations ----------------
  // StockRequest -> Account (who requested)
  db.Account.hasMany(db.StockRequest, { foreignKey: 'acccountId' });
  db.StockRequest.belongsTo(db.Account, { foreignKey: 'acccountId' });

  // StockRequest -> Room (which room/stockroom requested it)
  db.Room.hasMany(db.StockRequest, { foreignKey: 'requesterRoomId' });
  db.StockRequest.belongsTo(db.Room, { foreignKey: 'requesterRoomId' });

  // Polymorphic-like associations for itemId (no DB constraints so itemId may refer to any of these)
  // These use `constraints: false` because itemId can point to different models depending on itemType.
  // You can include all three when querying and check which one is non-null, or conditionally include based on itemType.
  db.StockRequest.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.ApparelInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });

  db.StockRequest.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.AdminSupplyInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });

  db.StockRequest.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
  db.GenItemInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });




  // ---------- ITEM REQUEST associations ----------
  db.Account.hasMany(db.ItemRequest, { foreignKey: 'accountId' });
  db.ItemRequest.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.Room.hasMany(db.ItemRequest, { foreignKey: 'requesterRoomId' });
  db.ItemRequest.belongsTo(db.Room, { foreignKey: 'requesterRoomId' });

  // Polymorphic-ish itemId (no FK constraints since itemId may map to different tables)
  db.ItemRequest.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.ApparelInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

  db.ItemRequest.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.AdminSupplyInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

  db.ItemRequest.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
  db.GenItemInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });



  db.Transfer.belongsTo(db.Account, { foreignKey: 'createdBy' });
  db.Transfer.belongsTo(db.Account, { foreignKey: 'acceptedBy' });    // who accepted transfer
  db.Transfer.belongsTo(db.Account, { foreignKey: 'returningBy' });   // who initiated return

  // Transfer <> Room (rooms)
  db.Transfer.belongsTo(db.Room, { foreignKey: 'fromRoomId' });
  db.Transfer.belongsTo(db.Room, { foreignKey: 'toRoomId' });

  // Convenience (polymorphic) relations to inventory aggregates.
  // NOTE: we set constraints: false because itemId can point to different tables
  db.Transfer.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });

}