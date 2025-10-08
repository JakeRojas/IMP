// const config            = require('config.json');
// const mysql             = require('mysql2/promise');
// const { Sequelize }     = require('sequelize');

// module.exports = db = {};

// initialize();
// async function initialize() { 
//     const { host, port, user, password, database } = config.database;
//     const connection = await mysql.createConnection({ host, port, user, password });
//     await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
    
//     await connection.end();

//     const sequelize = new Sequelize(database, user, password, { host: 'localhost', dialect: 'mysql' });

// // Initialize models and add them to the exported `db` object
// db.Room             = require('../_models/room.model')(sequelize);
// db.Account          = require('../_models/account.model')(sequelize);
// db.ActivityLog      = require('../_models/activitylog.model')(sequelize);
// db.RefreshToken     = require('../_models/refresh-token.model')(sequelize);

// // Apparel models
// db.Apparel            = require('../_models/apparel/apparel.model')(sequelize);
// db.ReceiveApparel     = require('../_models/apparel/receiveApparel.model')(sequelize);
// db.ReleaseApparel     = require('../_models/apparel/releaseApparel.model')(sequelize);
// db.ApparelInventory   = require('../_models/apparel/apparelInventory.model')(sequelize);

// // Admin Supply models
// db.AdminSupply              = require('../_models/adminSupply/adminSupply.model')(sequelize);
// db.ReceiveAdminSupply       = require('../_models/adminSupply/receiveAdminSupply.model')(sequelize);
// db.ReleaseAdminSupply      = require('../_models/adminSupply/releaseAdminSupply.model')(sequelize);
// db.AdminSupplyInventory     = require('../_models/adminSupply/adminSupplyInventory.model')(sequelize);

// // Item models
// db.GenItem            = require('../_models/genItem/genItem.model')(sequelize);
// db.ReceiveGenItem     = require('../_models/genItem/receiveGenItem.model')(sequelize);
// db.ReleaseGenItem     = require('../_models/genItem/releaseGenItem.model')(sequelize);
// db.GenItemInventory   = require('../_models/genItem/genItemInventory.model')(sequelize);

// // Qr code models
// db.Qr = require('../_models/qr.model')(sequelize);

// // Request models
// db.StockRequest = require('../_models/request/stock.request.model')(sequelize);
// db.ItemRequest  = require('../_models/request/item.request.model')(sequelize);

// // Transfer models
// db.Transfer = require('../_models/transfer.model')(sequelize);

// dbAssociations();

//     await sequelize.sync({ alter: true }); 
// }  

// function dbAssociations() {
//   // ---------------- Account / Auth ----------------
//   // Account -> RefreshToken : store JWT refresh tokens for an account (cascade delete)
//   db.Account.hasMany(db.RefreshToken, { onDelete: 'CASCADE' });
//   db.RefreshToken.belongsTo(db.Account);

//   // ---------------- Account / Room ----------------
//   // [Label] Account (roomInCharge) -> Room : which account is in charge of a room
//   db.Account.hasMany(db.Room, { foreignKey: 'roomInCharge' });
//   db.Room.belongsTo(db.Account, { foreignKey: 'roomInCharge' });

//   // ---------- APPAREL / BATCH / ROOM associations ----------
//   // ReceiveApparel -> Apparel (per-unit), keep alias 'apparel' (matches prior code)
//   db.ReceiveApparel.hasMany(db.Apparel, { foreignKey: 'receiveApparelId' });
//   db.Apparel.belongsTo(db.ReceiveApparel, { foreignKey: 'receiveApparelId' });

//   // ReceiveApparel -> Room (batch belongs to room) and Room -> ReceiveApparel
//   db.ReceiveApparel.belongsTo(db.Room, { foreignKey: 'roomId' });
//   db.Room.hasMany(db.ReceiveApparel, { foreignKey: 'roomId' });

//   // Apparel may optionally belong to a Room directly (if your model has roomId)
//   // Keep these so code that queries by Apparel.roomId keeps working if the attribute exists.
//   db.Apparel.belongsTo(db.Room, { foreignKey: 'roomId' });
//   db.Room.hasMany(db.Apparel, { foreignKey: 'roomId' });

//   // ApparelInventory (aggregate) belongs to Room and Room has many ApparelInventory rows
//   db.Room.hasMany(db.ApparelInventory, { foreignKey: 'roomId' });
//   db.ApparelInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

//   // ApparelInventory <-> ReleaseApparel
//   db.ApparelInventory.hasMany(db.ReleaseApparel, { foreignKey: 'apparelInventoryId' });
//   db.ReleaseApparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId'  });

//   // ApparelInventory -> Apparel (optional relation if your model uses apparelInventoryId)
//   db.ApparelInventory.hasMany(db.Apparel, { foreignKey: 'apparelInventoryId' });
//   db.Apparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId' });

//   // ---------- ADMIN SUPPLY associations ----------
//   db.ReceiveAdminSupply.hasMany(db.AdminSupply, { foreignKey: 'receiveAdminSupplyId' });
//   db.AdminSupply.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId' });

//   db.Account.hasMany(db.ReceiveApparel, { foreignKey: 'accountId'});
//   db.ReceiveApparel.belongsTo(db.Account, { foreignKey: 'accountId'});

//   db.Account.hasMany(db.ReceiveAdminSupply, { foreignKey: 'accountId'});
//   db.ReceiveAdminSupply.belongsTo(db.Account, { foreignKey: 'accountId'});

//   db.Account.hasMany(db.ReceiveGenItem, { foreignKey: 'accountId'});
//   db.ReceiveGenItem.belongsTo(db.Account, { foreignKey: 'accountId'});

//   db.Account.hasMany(db.ReleaseApparel, { foreignKey: 'accountId'});
//   db.ReleaseApparel.belongsTo(db.Account, { foreignKey: 'accountId'});

//   db.ReleaseApparel.belongsTo(db.Room, { foreignKey: 'roomId' });
//   db.Room.hasMany(db.ReleaseApparel, { foreignKey: 'roomId' });

//   db.ReceiveGenItem.hasMany(db.GenItem, { foreignKey: 'receiveGenItemId' });
//   db.GenItem.belongsTo(db.ReceiveGenItem, { foreignKey: 'receiveGenItemId' });

//   db.AdminSupply.belongsTo(db.Room, { foreignKey: 'roomId' });
//   db.Room.hasMany(db.AdminSupply, { foreignKey: 'roomId' });



//   // ---------------- STOCK REQUEST associations ----------------
//   // StockRequest -> Account (who requested)
//   db.Account.hasMany(db.StockRequest, { foreignKey: 'acccountId' });
//   db.StockRequest.belongsTo(db.Account, { foreignKey: 'acccountId' });

//   // StockRequest -> Room (which room/stockroom requested it)
//   db.Room.hasMany(db.StockRequest, { foreignKey: 'requesterRoomId' });
//   db.StockRequest.belongsTo(db.Room, { foreignKey: 'requesterRoomId' });

//   db.StockRequest.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
//   db.ApparelInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });

//   db.StockRequest.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
//   db.AdminSupplyInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });

//   db.StockRequest.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
//   db.GenItemInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });

//   // ---------- ITEM REQUEST associations ----------
//   db.Account.hasMany(db.ItemRequest, { foreignKey: 'accountId' });
//   db.ItemRequest.belongsTo(db.Account, { foreignKey: 'accountId' });

//   db.Room.hasMany(db.ItemRequest, { foreignKey: 'requesterRoomId' });
//   db.ItemRequest.belongsTo(db.Room, { foreignKey: 'requesterRoomId' });

//   // Polymorphic-ish itemId (no FK constraints since itemId may map to different tables)
//   db.ItemRequest.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
//   db.ApparelInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

//   db.ItemRequest.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
//   db.AdminSupplyInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

//   db.ItemRequest.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
//   db.GenItemInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

//   db.Transfer.belongsTo(db.Account, { foreignKey: 'createdBy' });
//   db.Transfer.belongsTo(db.Account, { foreignKey: 'acceptedBy' });    // who accepted transfer
//   db.Transfer.belongsTo(db.Account, { foreignKey: 'returningBy' });   // who initiated return

//   // Transfer <> Room (rooms)
//   db.Transfer.belongsTo(db.Room, { foreignKey: 'fromRoomId' });
//   db.Transfer.belongsTo(db.Room, { foreignKey: 'toRoomId' });

//   db.Transfer.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
//   db.Transfer.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
//   db.Transfer.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
// }


require('dotenv').config();
const fs = require('fs');
const path = require('path');

const config            = require('config.json');
const mysql             = require('mysql2/promise');
const { Sequelize }     = require('sequelize');

module.exports = db = {};

let aivenCfg = null;
if (process.env.AIVEN_DB_HOST) {
  aivenCfg = {
    host: process.env.AIVEN_DB_HOST,
    port: Number(process.env.AIVEN_DB_PORT || 3306),
    user: process.env.AIVEN_DB_USER,
    password: process.env.AIVEN_DB_PASS,
    database: process.env.AIVEN_DB_NAME,
    ssl: { required: !!process.env.AIVEN_CA_PATH, caPath: process.env.AIVEN_CA_PATH }
  };
} else {
  // fallback to config.aiven.json (optional)
  const aivenCfgPath = path.resolve(__dirname, '..', 'config.aiven.json');
  if (fs.existsSync(aivenCfgPath)) {
    try {
      const raw = require(aivenCfgPath);
      aivenCfg = raw?.database?.aiven || null;
    } catch (e) {
      console.warn('Could not parse config.aiven.json', e.message || e);
      aivenCfg = null;
    }
  }
}

let remoteSequelize = null;
if (aivenCfg && aivenCfg.host) {
  const dialectOptions = {};
  if (aivenCfg.ssl && aivenCfg.ssl.required && aivenCfg.ssl.caPath) {
    try {
      dialectOptions.ssl = { ca: fs.readFileSync(path.resolve(aivenCfg.ssl.caPath)).toString() };
    } catch (err) {
      console.warn('AIVEN: unable to read CA file at', aivenCfg.ssl.caPath, err.message || err);
    }
  }

  try {
    remoteSequelize = new Sequelize(aivenCfg.database, aivenCfg.user, aivenCfg.password, {
      host: aivenCfg.host,
      port: aivenCfg.port,
      dialect: 'mysql',
      dialectOptions,
      logging: false,
      pool: { max: 10, min: 0, acquire: 30000, idle: 10000 }
    });
    // test connection
    (async () => {
      try {
        await remoteSequelize.authenticate();
        console.log('AIVEN: remote DB connected OK');
      } catch (err) {
        console.warn('AIVEN: remote DB connection failed:', err.message || err);
        remoteSequelize = null; // fallback to null so app continues using local only
      }
    })();
  } catch (err) {
    console.warn('AIVEN: failed to create remote Sequelize:', err.message || err);
    remoteSequelize = null;
  }
} else {
  // no aiven config found
  remoteSequelize = null;
}

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
if (remoteSequelize) {
  db.remote = {};

  try {
    // repeat the same model factory calls but pass remoteSequelize
    // Make sure to include the same model list you used for local db
    db.remote.Room             = require('./_models/room.model')(remoteSequelize);
    db.remote.Account          = require('./_models/account.model')(remoteSequelize);
    db.remote.ActivityLog      = require('./_models/activitylog.model')(remoteSequelize);
    db.remote.RefreshToken     = require('./_models/refresh-token.model')(remoteSequelize);

    db.remote.Apparel            = require('./_models/apparel/apparel.model')(remoteSequelize);
    db.remote.ReceiveApparel     = require('./_models/apparel/receiveApparel.model')(remoteSequelize);
    db.remote.ReleaseApparel     = require('./_models/apparel/releaseApparel.model')(remoteSequelize);
    db.remote.ApparelInventory   = require('./_models/apparel/apparelInventory.model')(remoteSequelize);

    db.remote.AdminSupply            = require('./_models/adminSupply/adminSupply.model')(remoteSequelize);
    db.remote.ReceiveAdminSupply     = require('./_models/adminSupply/receiveAdminSupply.model')(remoteSequelize);
    db.remote.ReleaseAdminSupply     = require('./_models/adminSupply/releaseAdminSupply.model')(remoteSequelize);
    db.remote.AdminSupplyInventory   = require('./_models/adminSupply/adminSupplyInventory.model')(remoteSequelize);

    db.remote.GenItem            = require('./_models/genItem/genItem.model')(remoteSequelize);
    db.remote.ReceiveGenItem     = require('./_models/genItem/receiveGenItem.model')(remoteSequelize);
    db.remote.ReleaseGenItem     = require('./_models/genItem/releaseGenItem.model')(remoteSequelize);
    db.remote.GenItemInventory   = require('./_models/genItem/genItemInventory.model')(remoteSequelize);

    db.remote.Qr = require('./_models/qr.model')(remoteSequelize);

    db.remote.StockRequest = require('./_models/request/stock.request.model')(remoteSequelize);
    db.remote.ItemRequest  = require('./_models/request/item.request.model')(remoteSequelize);

    db.remote.Transfer = require('./_models/transfer.model')(remoteSequelize);

    // Call associate() on models if they export it (many model files have model.associate = function(db) { .. })
    Object.keys(db.remote).forEach(k => {
      const m = db.remote[k];
      if (m && typeof m.associate === 'function') {
        try { m.associate(db.remote); } catch (e) { console.warn('[AIVEN] associate() failed for', k, e.message || e); }
      }
    });

    // If your main file defined associations manually (outside associate()), you can optionally call the same
    // association logic for db.remote here. If your associations were written as functions over a db object,
    // call that function again with db.remote. Example:
    if (typeof setupAssociations === 'function') {
      try { setupAssociations(db.remote); } catch (e) { /* ignore or warn */ }
    }

    // Optional: sync remote schema — be careful; Aiven users often lack ALTER privileges.
    if ((process.env.AIVEN_SYNC || '').toLowerCase() === 'true') {
      (async () => {
        try {
          await remoteSequelize.sync({ alter: true });
          console.log('AIVEN: remote schema synced with alter:true');
        } catch (err) {
          console.warn('AIVEN: remote sync failed (you may not have permissions).', err.message || err);
        }
      })();
    }

  } catch (err) {
    console.warn('AIVEN: failed to initialize remote models:', err.message || err);
    db.remote = null;
  }
} else {
  db.remote = null;
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

  db.Transfer.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
}