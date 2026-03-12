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

let config = {};
try {
  config = require('../config.json');
} catch (e) {
  // config.json not found
}
const mysql = require('mysql2/promise');
const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const db = {};
module.exports = db;

// Environment-aware DB config (env vars override config.json for deployment)
const DB_HOST = process.env.DB_HOST || (config.database && config.database.host) || 'localhost';
const DB_PORT = process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : (config.database && config.database.port) || 3306;
const DB_USER = process.env.DB_USER || (config.database && config.database.user) || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || (config.database && config.database.password) || 'root';
const DB_NAME = process.env.DB_NAME || (config.database && config.database.database) || 'IMP_db';

let sequelize; // declared in module scope so it's available after initialization

initialize();

async function initialize() {
  let currentHost = DB_HOST;
  let currentPort = DB_PORT;
  let currentUser = DB_USER;
  let currentPassword = DB_PASSWORD;
  let currentDbName = DB_NAME;
  let currentSsl = null;

  // Initial SSL preparation
  if (process.env.DB_CA_PATH) {
    try {
      const caPath = path.resolve(process.env.DB_CA_PATH);
      if (fs.existsSync(caPath)) {
        currentSsl = { ca: fs.readFileSync(caPath) };
        console.log(`Using CA certificate from: ${caPath}`);
      } else {
        console.warn(`CA certificate file not found at: ${caPath}`);
        currentSsl = { rejectUnauthorized: false };
      }
    } catch (err) {
      console.error('Error reading CA certificate:', err);
      currentSsl = { rejectUnauthorized: false };
    }
  } else if (process.env.DB_SSL === 'REQUIRED' || process.env.DB_SSL === 'true') {
    currentSsl = { rejectUnauthorized: false };
  }

  try {
    await attemptConnection(currentHost, currentPort, currentUser, currentPassword, currentDbName, currentSsl);
  } catch (err) {
    const isNetworkError = err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED';

    if (isNetworkError && currentHost !== 'localhost') {
      console.warn(`\n[OFFLINE MODE] Primary database at ${currentHost} is unreachable (Error: ${err.code}).`);
      console.warn(`Attempting fallback to local MySQL on localhost:3306...`);

      // Fallback settings
      currentHost = 'localhost';
      currentPort = 3306;
      currentUser = 'root';
      currentPassword = 'root';
      currentDbName = 'imp_db'; // Using the local database name discovered
      currentSsl = null; // No SSL needed for local usually

      try {
        await attemptConnection(currentHost, currentPort, currentUser, currentPassword, currentDbName, currentSsl);
        console.log(`\n[SUCCESS] Connected to local fallback database: ${currentDbName}`);
      } catch (fallbackErr) {
        console.error('\n[CRITICAL] Both primary and local fallback database connections failed.');
        console.error('Local Fallback Error:', fallbackErr.message);
        process.exit(1);
      }
    } else {
      console.error('Database initialization FAILED:', err && err.stack ? err.stack : err);
      process.exit(1);
    }
  }
}

async function attemptConnection(host, port, user, password, database, ssl) {
  const connOptions = { host, port, user, password };
  if (ssl) connOptions.ssl = ssl;

  console.log(`Attempting MySQL connection to ${host}:${port} as ${user}...`);
  const connection = await mysql.createConnection(connOptions);

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`);
  await connection.end();

  const sequelizeOptions = {
    host: host,
    dialect: 'mysql',
    port: port,
    logging: false,
  };

  if (ssl) {
    sequelizeOptions.dialectOptions = { ssl: ssl };
  }

  sequelize = new Sequelize(database, user, password, sequelizeOptions);

  db.sequelize = sequelize;
  db.Sequelize = Sequelize;

  // Initialize models and add them to the exported `db` object
  db.Room = require('../_models/room.model')(sequelize);
  db.Account = require('../_models/account.model')(sequelize);
  db.ActivityLog = require('../_models/activitylog.model')(sequelize);
  db.RefreshToken = require('../_models/refresh-token.model')(sequelize);
  db.RoomAccess = require('../_models/room-access.model')(sequelize);

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

  // IT models
  db.It = require('../_models/it/it.model')(sequelize);
  db.ReceiveIt = require('../_models/it/receiveIt.model')(sequelize);
  db.ReleaseIt = require('../_models/it/releaseIt.model')(sequelize);
  db.ItInventory = require('../_models/it/itInventory.model')(sequelize);

  // Qr code models
  db.Qr = require('../_models/qr.model')(sequelize);

  // Request models
  db.StockRequest = require('../_models/request/stock.request.model')(sequelize);
  db.ItemRequest = require('../_models/request/item.request.model')(sequelize);
  db.ItemRequestDetail = require('../_models/request/item.request.detail.model')(sequelize);

  // Transfer models
  db.Transfer = require('../_models/transfer.model')(sequelize);
  db.Borrow = require('../_models/borrow.model')(sequelize);

  // If any models define associations, call them now
  Object.keys(db).forEach((modelName) => {
    if (db[modelName] && typeof db[modelName].associate === 'function') {
      db[modelName].associate(db);
    }
  });

  dbAssociations();

  // Sync models to DB
  if (process.env.NODE_ENV !== 'production') {
    await sequelize.sync();
    console.log('Sequelize sync finished.');
  } else {
    await sequelize.sync();
    console.log('Sequelize sync finished on Production.');
  }

  console.log('Database initialized successfully.');
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

  // Account <-> Room Access (many-to-many for viewing only)
  db.Account.belongsToMany(db.Room, { through: db.RoomAccess, foreignKey: 'accountId', otherKey: 'roomId', as: 'accessibleRooms' });
  db.Room.belongsToMany(db.Account, { through: db.RoomAccess, foreignKey: 'roomId', otherKey: 'accountId', as: 'viewers' });

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

  // AdminSupplyInventory <-> ReleaseAdminSupply
  db.AdminSupplyInventory.hasMany(db.ReleaseAdminSupply, { foreignKey: 'adminSupplyInventoryId' });
  db.ReleaseAdminSupply.belongsTo(db.AdminSupplyInventory, { foreignKey: 'adminSupplyInventoryId' });

  // GenItemInventory <-> ReleaseGenItem
  db.GenItemInventory.hasMany(db.ReleaseGenItem, { foreignKey: 'genItemInventoryId' });
  db.ReleaseGenItem.belongsTo(db.GenItemInventory, { foreignKey: 'genItemInventoryId' });
















  // ---------- ADMIN SUPPLY associations ----------
  // db.ReceiveAdminSupply.hasMany(db.AdminSupply, { foreignKey: 'receiveAdminSupplyId' });
  // db.AdminSupply.belongsTo(db.ReceiveAdminSupply, { foreignKey: 'receiveAdminSupplyId' });

  // db.Account.hasMany(db.ReceiveAdminSupply, { foreignKey: 'accountId'});
  // db.ReceiveAdminSupply.belongsTo(db.Account, { foreignKey: 'accountId'});

  db.ReceiveGenItem.hasMany(db.GenItem, { foreignKey: 'receiveGenItemId' });
  db.GenItem.belongsTo(db.ReceiveGenItem, { foreignKey: 'receiveGenItemId' });

  // GenItemInventory (aggregate) belongs to Room
  db.Room.hasMany(db.GenItemInventory, { foreignKey: 'roomId' });
  db.GenItemInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

  // GenItemInventory <-> GenItem
  db.GenItemInventory.hasMany(db.GenItem, { foreignKey: 'genItemInventoryId' });
  db.GenItem.belongsTo(db.GenItemInventory, { foreignKey: 'genItemInventoryId' });

  // GenItemInventory <-> ReleaseGenItem
  db.GenItemInventory.hasMany(db.ReleaseGenItem, { foreignKey: 'genItemInventoryId' });
  db.ReleaseGenItem.belongsTo(db.GenItemInventory, { foreignKey: 'genItemInventoryId' });

  // ReceiveGenItem <-> Room
  db.ReceiveGenItem.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReceiveGenItem, { foreignKey: 'roomId' });

  // ReceiveGenItem <-> GenItemInventory
  db.GenItemInventory.hasMany(db.ReceiveGenItem, { foreignKey: 'genItemInventoryId' });
  db.ReceiveGenItem.belongsTo(db.GenItemInventory, { foreignKey: 'genItemInventoryId' });

  // Account -> ReceiveGenItem
  db.Account.hasMany(db.ReceiveGenItem, { foreignKey: 'accountId' });
  db.ReceiveGenItem.belongsTo(db.Account, { foreignKey: 'accountId' });

  // ReleaseGenItem <-> Room
  db.ReleaseGenItem.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReleaseGenItem, { foreignKey: 'roomId' });

  // Account -> ReleaseGenItem
  db.Account.hasMany(db.ReleaseGenItem, { foreignKey: 'accountId' });
  db.ReleaseGenItem.belongsTo(db.Account, { foreignKey: 'accountId' });

  // ---------- IT associations ----------
  db.ReceiveIt.hasMany(db.It, { foreignKey: 'receiveItId' });
  db.It.belongsTo(db.ReceiveIt, { foreignKey: 'receiveItId' });

  // ItInventory (aggregate) belongs to Room
  db.Room.hasMany(db.ItInventory, { foreignKey: 'roomId' });
  db.ItInventory.belongsTo(db.Room, { foreignKey: 'roomId' });

  // ItInventory <-> It
  db.ItInventory.hasMany(db.It, { foreignKey: 'itInventoryId' });
  db.It.belongsTo(db.ItInventory, { foreignKey: 'itInventoryId' });

  // ItInventory <-> ReleaseIt
  db.ItInventory.hasMany(db.ReleaseIt, { foreignKey: 'itInventoryId' });
  db.ReleaseIt.belongsTo(db.ItInventory, { foreignKey: 'itInventoryId' });

  // ReceiveIt <-> Room
  db.ReceiveIt.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReceiveIt, { foreignKey: 'roomId' });

  // ReceiveIt <-> ItInventory
  db.ItInventory.hasMany(db.ReceiveIt, { foreignKey: 'itInventoryId' });
  db.ReceiveIt.belongsTo(db.ItInventory, { foreignKey: 'itInventoryId' });

  // Account -> ReceiveIt
  db.Account.hasMany(db.ReceiveIt, { foreignKey: 'accountId' });
  db.ReceiveIt.belongsTo(db.Account, { foreignKey: 'accountId' });

  // ReleaseIt <-> Room
  db.ReleaseIt.belongsTo(db.Room, { foreignKey: 'roomId' });
  db.Room.hasMany(db.ReleaseIt, { foreignKey: 'roomId' });

  // Account -> ReleaseIt
  db.Account.hasMany(db.ReleaseIt, { foreignKey: 'accountId' });
  db.ReleaseIt.belongsTo(db.Account, { foreignKey: 'accountId' });

  // ---------- QR Code Associations (Polymorphic-ish, linking to units) ----------
  db.Apparel.hasOne(db.Qr, { foreignKey: 'unitId', constraints: false, scope: { itemType: 'apparel' } });
  db.AdminSupply.hasOne(db.Qr, { foreignKey: 'unitId', constraints: false, scope: { itemType: 'supply' } });
  db.GenItem.hasOne(db.Qr, { foreignKey: 'unitId', constraints: false, scope: { itemType: 'genItem' } });
  db.It.hasOne(db.Qr, { foreignKey: 'unitId', constraints: false, scope: { itemType: 'it' } });

  db.Qr.belongsTo(db.Apparel, { foreignKey: 'unitId', constraints: false });
  db.Qr.belongsTo(db.AdminSupply, { foreignKey: 'unitId', constraints: false });
  db.Qr.belongsTo(db.GenItem, { foreignKey: 'unitId', constraints: false });
  db.Qr.belongsTo(db.It, { foreignKey: 'unitId', constraints: false });



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

  db.StockRequest.belongsTo(db.ItInventory, { foreignKey: 'itemId', constraints: false });
  db.ItInventory.hasMany(db.StockRequest, { foreignKey: 'itemId', constraints: false });



  // ---------- ITEM REQUEST associations ----------
  db.Account.hasMany(db.ItemRequest, { foreignKey: 'accountId' });
  db.ItemRequest.belongsTo(db.Account, { foreignKey: 'accountId' });

  db.Room.hasMany(db.ItemRequest, { foreignKey: 'requesterRoomId', as: 'requesterRequests' });
  db.ItemRequest.belongsTo(db.Room, { foreignKey: 'requesterRoomId', as: 'Room' }); // Keep 'Room' as default for now to avoid breaking existing code

  db.Room.hasMany(db.ItemRequest, { foreignKey: 'requestToRoomId', as: 'incomingRequests' });
  db.ItemRequest.belongsTo(db.Room, { foreignKey: 'requestToRoomId', as: 'requestToRoom' });

  // Multiple items support
  db.ItemRequest.hasMany(db.ItemRequestDetail, { foreignKey: 'itemRequestId', as: 'items' });
  db.ItemRequestDetail.belongsTo(db.ItemRequest, { foreignKey: 'itemRequestId' });

  // Polymorphic joins for Details
  db.ItemRequestDetail.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.ItemRequestDetail.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.ItemRequestDetail.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
  db.ItemRequestDetail.belongsTo(db.ItInventory, { foreignKey: 'itemId', constraints: false });

  // Polymorphic-ish itemId (legacy support for single item on main row)
  db.ItemRequest.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.ApparelInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

  db.ItemRequest.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.AdminSupplyInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

  db.ItemRequest.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
  db.GenItemInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });

  db.ItemRequest.belongsTo(db.ItInventory, { foreignKey: 'itemId', constraints: false });
  db.ItInventory.hasMany(db.ItemRequest, { foreignKey: 'itemId', constraints: false });



  // ---------- TRANSFER associations ----------
  db.Transfer.belongsTo(db.Account, { foreignKey: 'createdBy', as: 'creator' });
  db.Transfer.belongsTo(db.Account, { foreignKey: 'acceptedBy', as: 'accepter' });
  db.Transfer.belongsTo(db.Account, { foreignKey: 'receivedBy', as: 'receiver' });
  db.Transfer.belongsTo(db.Account, { foreignKey: 'returningBy', as: 'returner' });

  // Transfer <> Room (rooms)
  db.Transfer.belongsTo(db.Room, { foreignKey: 'fromRoomId', as: 'fromRoom' });
  db.Transfer.belongsTo(db.Room, { foreignKey: 'toRoomId', as: 'toRoom' });

  db.Transfer.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false });
  db.Transfer.belongsTo(db.ItInventory, { foreignKey: 'itemId', constraints: false });



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
  db.Borrow.belongsTo(db.ApparelInventory, { foreignKey: 'itemId', constraints: false, as: 'apparel' });
  db.ApparelInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });

  db.Borrow.belongsTo(db.AdminSupplyInventory, { foreignKey: 'itemId', constraints: false, as: 'adminSupply' });
  db.AdminSupplyInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });

  db.Borrow.belongsTo(db.GenItemInventory, { foreignKey: 'itemId', constraints: false, as: 'generalItem' });
  db.GenItemInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });

  db.Borrow.belongsTo(db.ItInventory, { foreignKey: 'itemId', constraints: false, as: 'it' });
  db.ItInventory.hasMany(db.Borrow, { foreignKey: 'itemId', constraints: false });
}