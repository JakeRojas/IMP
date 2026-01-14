// const config            = require('config.json');
// const mysql             = require('mysql2/promise');
// const { Sequelize }     = require('sequelize');

// const fs = require('fs');
// const path = require('path');

// module.exports = db = {};

// initialize();
// async function initialize() { 
//     // const { host, port, user, password, database } = config.database;
//     // const connection = await mysql.createConnection({ host, port, user, password });
//     // await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
//     // await connection.end();
//     // const sequelize = new Sequelize(database, user, password, { host: 'localhost', dialect: 'mysql' });

const config = require('config.json');
const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

module.exports = db = {};

// Environment-aware DB config (env vars override config.json for deployment)
const DB_HOST = process.env.DB_HOST || (config.database && config.database.host) || 'localhost';
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : (config.database && config.database.port) || 3306;
const DB_USER = process.env.DB_USER || (config.database && config.database.user) || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || (config.database && config.database.password) || 'root';
const DB_NAME = process.env.DB_NAME || (config.database && config.database.database) || 'IMP_db';

let sequelize; // declared in module scope so it's available after initialization

initialize();

async function initialize() {
  try {
    const connOptions = {
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
    };

    let sslConfig = null;
    if (process.env.DB_CA_PATH) {
      try {
        const caPath = path.resolve(process.env.DB_CA_PATH);
        if (fs.existsSync(caPath)) {
          sslConfig = { ca: fs.readFileSync(caPath) };
          console.log(`Using CA certificate from: ${caPath}`);
        } else {
          console.warn(`CA certificate file not found at: ${caPath}`);
          // Fallback to simple SSL if required but path is wrong? 
          sslConfig = { rejectUnauthorized: false };
        }
      } catch (err) {
        console.error('Error reading CA certificate:', err);
        sslConfig = { rejectUnauthorized: false };
      }
    } else if (process.env.DB_SSL === 'REQUIRED' || process.env.DB_SSL === 'true') {
      sslConfig = { rejectUnauthorized: false };
    }

    if (sslConfig) {
      connOptions.ssl = sslConfig;
    }

    console.log(`Attempting MySQL connection to ${DB_HOST}:${DB_PORT} as ${DB_USER}`);

    const connection = await mysql.createConnection(connOptions);

    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
    await connection.end();

    const sequelizeOptions = {
      host: DB_HOST,
      dialect: 'mysql',
      port: DB_PORT,
      logging: false,
    };

    if (sslConfig) {
      sequelizeOptions.dialectOptions = { ssl: sslConfig };
    }

    sequelize = new Sequelize(DB_NAME, DB_USER, DB_PASSWORD, sequelizeOptions);

    db.sequelize = sequelize;
    db.Sequelize = Sequelize;

    // Initialize models and add them to the exported `db` object
    db.Room = require('../_models/room.model')(sequelize);
    db.Account = require('../_models/account.model')(sequelize);
    db.ActivityLog = require('../_models/activitylog.model')(sequelize);
    db.RefreshToken = require('../_models/refresh-token.model')(sequelize);

    // Apparel models
    db.Apparel = require('../_models/apparel/apparel.model')(sequelize);
    db.ReceiveApparel = require('../_models/apparel/receiveApparel.model')(sequelize);
    db.ReleaseApparel = require('../_models/apparel/releaseApparel.model')(sequelize);
    db.ApparelInventory = require('../_models/apparel/apparelInventory.model')(sequelize);

    // Admin Supply models
    db.AdminSupply = require('../_models/adminSupply/adminSupply.model')(sequelize);
    db.ReceiveAdminSupply = require('../_models/adminSupply/receiveAdminSupply.model')(sequelize);
    db.ReleaseAdminSupply = require('../_models/adminSupply/releaseAdminSupply.model')(sequelize);
    db.AdminSupplyInventory = require('../_models/adminSupply/adminSupplyInventory.model')(sequelize);

    // Item models
    db.GenItem = require('../_models/genItem/genItem.model')(sequelize);
    db.ReceiveGenItem = require('../_models/genItem/receiveGenItem.model')(sequelize);
    db.ReleaseGenItem = require('../_models/genItem/releaseGenItem.model')(sequelize);
    db.GenItemInventory = require('../_models/genItem/genItemInventory.model')(sequelize);

    // Qr code models
    db.Qr = require('../_models/qr.model')(sequelize);

    // Request models
    db.StockRequest = require('../_models/request/stock.request.model')(sequelize);
    db.ItemRequest = require('../_models/request/item.request.model')(sequelize);

    // Transfer models
    db.Transfer = require('../_models/transfer.model')(sequelize);
    db.Borrow = require('../_models/borrow.model')(sequelize);

    // If any models define associations, call them now
    Object.keys(db).forEach((modelName) => {
      if (db[modelName] && typeof db[modelName].associate === 'function') {
        db[modelName].associate(db);
      }
    });

    // Sync models to DB when in non-production for convenience.
    // WARNING: avoid alter:true in real production; prefer migrations.
    if (process.env.NODE_ENV !== 'production') {
      await sequelize.sync({ alter: true });
      console.log('Sequelize sync finished (alter: true).');
    }

    console.log('Database initialized successfully.');
  } catch (err) {
    console.error('Database initialization FAILED:', err && err.stack ? err.stack : err);
    // Fail fast so deploy logs show the error. Change to retry logic if desired.
    process.exit(1);
  }

  dbAssociations();

  await sequelize.sync({ alter: true });
  console.log('Sequelize synced.');
}

function dbAssociations() {
  // ---------------- Account / Auth ----------------
  // Account -> RefreshToken : store JWT refresh tokens for an account (cascade delete)
  db.Account.hasMany(db.RefreshToken, { onDelete: 'CASCADE' });
  db.RefreshToken.belongsTo(db.Account);

  // ---------------- Account / ActivityLog ----------------
  db.Account.hasMany(db.ActivityLog, { foreignKey: 'accountId' });
  db.ActivityLog.belongsTo(db.Account, { foreignKey: 'accountId' });

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
  db.ReleaseApparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId' });

  // ApparelInventory -> Apparel (optional relation if your model uses apparelInventoryId)
  db.ApparelInventory.hasMany(db.Apparel, { foreignKey: 'apparelInventoryId' });
  db.Apparel.belongsTo(db.ApparelInventory, { foreignKey: 'apparelInventoryId' });

  db.Account.hasMany(db.ReceiveApparel, { foreignKey: 'accountId' });
  db.ReceiveApparel.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.Account.hasMany(db.ReleaseApparel, { foreignKey: 'accountId' });
  db.ReleaseApparel.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.ReleaseApparel.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReleaseApparel, { foreignKey: 'roomId' });

  // ---------- ADMIN SUPPLY / BATCH / ROOM associations ----------
  // ReceiveApparel -> Apparel (per-unit), keep alias 'apparel' (matches prior code)
  db.ReceiveAdminSupply.hasMany(db.AdminSupply, { foreignKey: 'receiveAdminSupplyId' });
  db.AdminSupply.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId' });

  // ReceiveApparel -> Room (batch belongs to room) and Room -> ReceiveApparel
  db.ReceiveAdminSupply.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReceiveAdminSupply, { foreignKey: 'roomId' });

  // Apparel may optionally belong to a Room directly (if your model has roomId)
  // Keep these so code that queries by Apparel.roomId keeps working if the attribute exists.
  db.AdminSupply.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.AdminSupply, { foreignKey: 'roomId' });

  // ApparelInventory (aggregate) belongs to Room and Room has many ApparelInventory rows
  db.Room.hasMany(db.AdminSupplyInventory, { foreignKey: 'roomId' });
  db.AdminSupplyInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

  // ApparelInventory <-> ReleaseApparel
  db.AdminSupplyInventory.hasMany(db.ReceiveAdminSupply, { foreignKey: 'adminSupplyInventoryId' });
  db.ReceiveAdminSupply.belongsTo(db.AdminSupplyInventory, { foreignKey: 'adminSupplyInventoryId' });

  // ApparelInventory -> Apparel (optional relation if your model uses apparelInventoryId)
  db.AdminSupplyInventory.hasMany(db.AdminSupply, { foreignKey: 'adminSupplyInventoryId' });
  db.AdminSupply.belongsTo(db.AdminSupplyInventory, { foreignKey: 'adminSupplyInventoryId' });

  db.Account.hasMany(db.ReceiveAdminSupply, { foreignKey: 'accountId' });
  db.ReceiveAdminSupply.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.Account.hasMany(db.ReleaseAdminSupply, { foreignKey: 'accountId' });
  db.ReleaseAdminSupply.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.ReleaseAdminSupply.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReleaseAdminSupply, { foreignKey: 'roomId' });
















  // ---------- ADMIN SUPPLY associations ----------
  // db.ReceiveAdminSupply.hasMany(db.AdminSupply, { foreignKey: 'receiveAdminSupplyId' });
  // db.AdminSupply.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId' });

  // db.Account.hasMany(db.ReceiveAdminSupply, { foreignKey: 'accountId'});
  // db.ReceiveAdminSupply.belongsTo(db.Account, { foreignKey: 'accountId'});

  db.Account.hasMany(db.ReceiveGenItem, { foreignKey: 'accountId' });
  db.ReceiveGenItem.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.ReceiveGenItem.hasMany(db.GenItem, { foreignKey: 'receiveGenItemId' });
  db.GenItem.belongsTo(db.ReceiveGenItem, { foreignKey: 'receiveGenItemId' });

  // db.AdminSupply.belongsTo(db.Room, { foreignKey: 'roomId' });
  // db.Room.hasMany(db.AdminSupply, { foreignKey: 'roomId' });



  // ---------------- STOCK REQUEST associations ----------------
  // StockRequest -> Account (who requested)
  db.Account.hasMany(db.StockRequest, { foreignKey: 'accountId' });
  db.StockRequest.belongsTo(db.Account, { foreignKey: 'accountId' });

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



  // ---------- TRANSFER associations ----------
  db.Transfer.belongsTo(db.Account, { foreignKey: 'createdBy' });
  db.Transfer.belongsTo(db.Account, { foreignKey: 'acceptedBy' });    // who accepted transfer
  db.Transfer.belongsTo(db.Account, { foreignKey: 'returningBy' });   // who initiated return

  // Transfer <> Room (rooms)
  db.Transfer.belongsTo(db.Room, { foreignKey: 'fromRoomId', as: 'fromRoom' });
  db.Transfer.belongsTo(db.Room, { foreignKey: 'toRoomId', as: 'toRoom' });

  db.Transfer.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });



  // ---------- BORROW associations ----------
  // requester -> Borrow
  db.Account.hasMany(db.Borrow, { foreignKey: 'requesterId' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'requesterId', as: 'requester' });

  db.Account.hasMany(db.Borrow, { foreignKey: 'approvedBy' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'approvedBy', as: 'approver' });

  db.Account.hasMany(db.Borrow, { foreignKey: 'declinedBy' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'declinedBy', as: 'decliner' });

  db.Account.hasMany(db.Borrow, { foreignKey: 'cancelledBy' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'cancelledBy', as: 'canceller' });

  db.Account.hasMany(db.Borrow, { foreignKey: 'acquiredBy' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'acquiredBy', as: 'acquirer' });

  db.Account.hasMany(db.Borrow, { foreignKey: 'returnedBy' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'returnedBy', as: 'returner' });

  db.Account.hasMany(db.Borrow, { foreignKey: 'acceptedBy' });
  db.Borrow.belongsTo(db.Account, { foreignKey: 'acceptedBy', as: 'acceptor' });

  // room -> Borrow (owner room)
  db.Room.hasMany(db.Borrow, { foreignKey: 'roomId' });
  db.Borrow.belongsTo(db.Room, { foreignKey: 'roomId', as: 'room' });

  // polymorphic item joins (no FK constraints)
  db.Borrow.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.ApparelInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });

  db.Borrow.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.AdminSupplyInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });

  db.Borrow.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
  db.GenItemInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });
}