const db = require('_helpers/db-handler');
const Role = require('_helpers/role'); 
const { Transaction }     = require('sequelize');
const accountService = require('./account.service');

module.exports = {
  createTransfer,
  acceptTransfer,
  getById,
  listTransfers
};

const ADMIN_ROLES = ['superAdmin'];

async function createTransfer({ createdBy, fromRoomId, toRoomId, itemId, quantity = 1, note = null, ipAddress, browserInfo }) {
  try {
    if (!createdBy) throw { status: 401, message: 'Unauthenticated' };
    if (!Number.isInteger(quantity) || quantity <= 0) throw { status: 400, message: 'quantity must be a positive integer' };

    // Defensive: ensure rooms exist
    const fromRoom = await db.Room.findByPk(fromRoomId);
    if (!fromRoom) throw { status: 400, message: 'Invalid fromRoomId' };

    const toRoom = await db.Room.findByPk(toRoomId);
    if (!toRoom) throw { status: 400, message: 'Invalid toRoomId' };

    // Defensive: require toRoom.roomType to be stockroom or substockroom
    const tr = String(toRoom.roomType || '').toLowerCase();
    if (!['stockroom', 'substockroom'].includes(tr)) {
      throw { status: 403, message: 'Transfers are allowed only to rooms of type stockroom or substockroom' };
    }

    // Helper: check an inventory table by PK and ensure its room-field matches fromRoomId
    const roomFields = ['roomId', 'locationRoomId', 'storedRoomId', 'room_id', 'stockRoomId'];

    async function checkInventoryModel(modelName) {
      const M = db[modelName];
      if (!M) return null;
      const candidate = await M.findByPk(itemId);
      if (!candidate) return null;
      for (const f of roomFields) {
        if (typeof candidate[f] !== 'undefined' && String(candidate[f]) === String(fromRoomId)) {
          return { model: modelName, row: candidate };
        }
      }
      return null;
    }

    // 1) Try inventory tables first
    const inventoryModels = [
      { model: 'ApparelInventory', type: 'apparel' },
      { model: 'AdminSupplyInventory', type: 'supply' },
      { model: 'GenItemInventory', type: 'genItem' }
    ];

    let resolvedType = null;
    let itemRow = null;

    for (const im of inventoryModels) {
      const res = await checkInventoryModel(im.model);
      if (res) { resolvedType = im.type; itemRow = res.row; break; }
    }

    // 2) If not found, try unit/item tables (individual units) and check room fields there
    if (!resolvedType) {
      const unitModels = [
        { model: 'Apparel', type: 'apparel' },
        { model: 'AdminSupply', type: 'supply' },
        { model: 'GenItem', type: 'genItem' }
      ];

      for (const um of unitModels) {
        const M = db[um.model];
        if (!M) continue;
        const unit = await M.findByPk(itemId);
        if (!unit) continue;
        for (const f of roomFields) {
          if (typeof unit[f] !== 'undefined' && String(unit[f]) === String(fromRoomId)) {
            resolvedType = um.type;
            itemRow = unit;
            break;
          }
        }
        if (resolvedType) break;
      }
    }

    if (!resolvedType) {
      // No matching inventory or unit found that belongs to fromRoomId
      throw { status: 400, message: `Item ${itemId} not found in room ${fromRoomId}` };
    }

    // Create the transfer record and store itemType for downstream compatibility
    const transfer = await db.Transfer.create({
      createdBy,
      fromRoomId,
      toRoomId,
      itemType: resolvedType,
      itemId,
      quantity,
      note,
      status: 'pending'
    });

    try {
      await accountService.logActivity(String(createdBy), 'transfer_create', ipAddress, browserInfo, `transferId:${transfer.transferId}`);
    } catch (err) {
      console.error('activity log failed (createTransfer)', err);
    }

    return transfer;
  } catch (err) {
    // Ensure errors are thrown as objects with .status and .message where possible
    if (err && err.status && err.message) throw err;
    console.error('createTransfer error:', err && (err.stack || err));
    throw { status: 500, message: 'Server error while creating transfer' };
  }
}
// async function acceptTransfer(transferId, accepterId, accepterRole, ipAddress, browserInfo) {
//   if (!transferId) throw { status: 400, message: 'transferId required' };

//   // normalize allowed admin roles (lowercase)
//   const ADMIN_ROLES = ['superadmin', 'admin', 'super_admin'];

//   const txn = await db.sequelize.transaction();
//   try {
//     // load transfer WITH txn
//     const tr = await db.Transfer.findByPk(transferId, { transaction: txn });
//     if (!tr) {
//       await txn.rollback();
//       throw { status: 404, message: 'Transfer not found' };
//     }
//     if (tr.status !== 'in_transfer') {
//       await txn.rollback();
//       throw { status: 400, message: 'Only in_transfer can be accepted' };
//     }

//     // load destination room to get roomInCharge
//     let toRoom = null;
//     if (tr.toRoomId) {
//       toRoom = await db.Room.findByPk(tr.toRoomId, { transaction: txn });
//     }
//     const roomInCharge = toRoom?.roomInCharge ?? null;

//     // normalize role and check authorization: admin OR room-in-charge
//     const roleLower = String(accepterRole || '').toLowerCase();
//     let isAdmin = ADMIN_ROLES.includes(roleLower);

//     if (!isAdmin) {
//       // try direct match first
//       if (roomInCharge && String(roomInCharge) === String(accepterId)) {
//         // allowed
//       } else {
//         // try resolving account/user to cover schema mismatch (accountId vs userId etc.)
//         let accepterMatches = false;
//         const acct = await db.Account.findByPk(accepterId, { transaction: txn }).catch(() => null);
//         if (acct) {
//           if (String(acct.accountId) === String(roomInCharge) || String(acct.id) === String(roomInCharge)) accepterMatches = true;
//         }
//         if (!accepterMatches && db.User) {
//           const user = await db.User.findByPk(accepterId, { transaction: txn }).catch(() => null);
//           if (user && (String(user.userId ?? user.id) === String(roomInCharge))) accepterMatches = true;
//         }

//         if (!accepterMatches) {
//           await txn.rollback();
//           throw {
//             status: 403,
//             message: `Only the room-in-charge or an admin can accept this transfer. accepterId=${accepterId}, role=${accepterRole}, roomInCharge=${roomInCharge}`
//           };
//         }
//       }
//     }

//     // Authorized — now perform inventory move + receive creation in same transaction

//     // 1) get inventory model for itemType
//     const model = inventoryModelFor(tr.itemType);
//     if (!model) {
//       await txn.rollback();
//       throw { status: 400, message: 'unknown itemType' };
//     }

//     // 2) find source inventory
//     let srcInv = null;
//     if (tr.itemId) {
//       srcInv = await model.findByPk(tr.itemId, { transaction: txn }).catch(() => null);
//     }
//     if (!srcInv) {
//       srcInv = await model.findOne({ where: { id: tr.itemId, roomId: tr.fromRoomId }, transaction: txn }).catch(() => null);
//     }
//     if (!srcInv) {
//       await txn.rollback();
//       throw { status: 404, message: 'Source inventory not found' };
//     }

//     // 3) check available qty
//     const available = getQuantity(srcInv);
//     if (available < tr.quantity) {
//       await txn.rollback();
//       throw { status: 400, message: 'Insufficient quantity in source' };
//     }

//     // 4) decrement source and increment destination using helpers (they save with transaction)
//     await adjustInventory(srcInv, -Number(tr.quantity), txn);

//     const destInv = await findOrCreateMatchingInventory(model, srcInv, tr.toRoomId, { transaction: txn });
//     await adjustInventory(destInv, Number(tr.quantity), txn);

//     // 5) update transfer record (inside txn)
//     await tr.update({ status: 'transfer_accepted', acceptedBy: accepterId || null, acceptedAt: new Date() }, { transaction: txn });

//     // 6) create receive batch & unit records (helper expects txn)
//     const typeNorm = String(tr.itemType || '').toLowerCase();
//     await createReceiveBatchAndUnits(typeNorm, destInv, Number(tr.quantity), tr, accepterId, txn);

//     // commit and return (fresh tr)
//     await txn.commit();

//     try {
//       await accountService.logActivity(String(accepterId), 'transfer_create', ipAddress, browserInfo, `transferId:${transferId}`);
//     } catch (err) {
//       console.error('activity log failed (createTransfer)', err);
//     }

//     // reload the transfer with any associations if you need them
//     return await db.Transfer.findByPk(tr.transferId || tr.id);
//   } catch (err) {
//     // rollback if not already rolled back
//     try { if (txn) await txn.rollback(); } catch (_) { /* ignore */ }
//     throw err;
//   }
// }
async function acceptTransfer(transferId, accepterId, accepterRole, ipAddress, browserInfo) {
  if (!transferId) throw { status: 400, message: 'transferId required' };

  const ADMIN_ROLES = ['superadmin', 'admin', 'super_admin'];
  const txn = await db.sequelize.transaction();
  try {
    const tr = await db.Transfer.findByPk(transferId, { transaction: txn });
    if (!tr) {
      await txn.rollback();
      throw { status: 404, message: 'Transfer not found' };
    }

    // allow both pending and in_transfer to be accepted
    if (!['in_transfer', 'pending'].includes(String(tr.status || '').toLowerCase())) {
      await txn.rollback();
      throw { status: 400, message: 'Only pending or in_transfer can be accepted' };
    }

    // load toRoom to check roomInCharge
    let toRoom = null;
    if (tr.toRoomId) toRoom = await db.Room.findByPk(tr.toRoomId, { transaction: txn });
    const roomInCharge = toRoom?.roomInCharge ?? null;

    // normalize role; admin or room in charge allowed
    const roleLower = String(accepterRole || '').toLowerCase();
    const isAdmin = ADMIN_ROLES.includes(roleLower);

    if (!isAdmin) {
      // try matching accepterId === roomInCharge, or resolve via Account/User tables
      let accepterMatches = false;
      if (roomInCharge && String(roomInCharge) === String(accepterId)) accepterMatches = true;

      const acct = await db.Account.findByPk(accepterId, { transaction: txn }).catch(() => null);
      if (acct && (String(acct.accountId) === String(roomInCharge) || String(acct.id) === String(roomInCharge))) accepterMatches = true;

      if (!accepterMatches && db.User) {
        const user = await db.User.findByPk(accepterId, { transaction: txn }).catch(() => null);
        if (user && (String(user.userId ?? user.id) === String(roomInCharge))) accepterMatches = true;
      }

      if (!accepterMatches) {
        await txn.rollback();
        throw { status: 403, message: `Only room-in-charge or admin can accept this transfer (accepterId=${accepterId})` };
      }
    }

    // perform inventory adjustments (existing logic)...
    // (keep the existing inventory move code here unchanged)

    await tr.update({ status: 'transfer_accepted', acceptedBy: accepterId || null, acceptedAt: new Date() }, { transaction: txn });
    await txn.commit();

    // best-effort log (use your account service logger)
    try {
      await accountService.logActivity(String(accepterId), 'transfer_accept', ipAddress, browserInfo, `transferId:${tr.transferId || tr.id}`);
    } catch (e) {
      console.error('activity log failed (acceptTransfer)', e);
    }

    return tr;
  } catch (err) {
    if (txn && !txn.finished) await txn.rollback().catch(()=>{});
    throw err;
  }
}

/* ---------- helpers ---------- */

function getQuantity(inv) {
  if (!inv) return 0;
  if (typeof inv.totalQuantity !== 'undefined') return Number(inv.totalQuantity || 0);
  if (typeof inv.supplyQuantity !== 'undefined') return Number(inv.supplyQuantity || 0);
  if (typeof inv.quantity !== 'undefined') return Number(inv.quantity || 0);
  // fallback to sequelize getter if present
  try { return Number(inv.getDataValue && inv.getDataValue('quantity') || 0); } catch (_) { return 0; }
}

async function adjustInventory(inv, delta, txn) {
  if (!inv) throw { status: 500, message: 'Invalid inventory' };
  if (!Number.isFinite(Number(delta))) throw { status: 500, message: 'Invalid delta to adjustInventory' };
  const d = Number(delta);

  if (typeof inv.totalQuantity !== 'undefined') {
    inv.totalQuantity = Math.max(0, (inv.totalQuantity || 0) + d);
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.totalQuantity);
    await inv.save({ transaction: txn });
    return inv;
  }

  if (typeof inv.supplyQuantity !== 'undefined') {
    inv.supplyQuantity = Math.max(0, (inv.supplyQuantity || 0) + d);
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.supplyQuantity);
    await inv.save({ transaction: txn });
    return inv;
  }

  if (typeof inv.quantity !== 'undefined') {
    inv.quantity = Math.max(0, (inv.quantity || 0) + d);
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.quantity);
    await inv.save({ transaction: txn });
    return inv;
  }

  // fallback using generic setters
  try {
    const curr = Number(inv.getDataValue && inv.getDataValue('quantity') || 0);
    inv.setDataValue('quantity', Math.max(0, curr + d));
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.getDataValue('quantity'));
    await inv.save({ transaction: txn });
    return inv;
  } catch (err) {
    throw { status: 500, message: 'Unable to adjust inventory', detail: err.message || err };
  }
}

async function createReceiveBatchAndUnits(typeNorm, destInv, qty, tr, accepterId, txn) {
  if (!qty || qty <= 0) return; // nothing to create

  // apparel
  if (typeNorm === 'apparel') {
    const batch = await db.ReceiveApparel.create({
      roomId:          destInv.roomId,
      receivedFrom:    `Transfer #${tr.transferId}`,
      receivedBy:      accepterId || null,
      apparelName:     destInv.apparelName,
      apparelLevel:    destInv.apparelLevel,
      apparelType:     destInv.apparelType,
      apparelFor:      destInv.apparelFor,
      apparelSize:     destInv.apparelSize,
      apparelQuantity: qty
    }, { transaction: txn });

    if (db.Apparel) {
      const units = Array(qty).fill().map(() => ({
        receiveApparelId: batch.receiveApparelId,
        apparelInventoryId: destInv.apparelInventoryId ?? destInv.id,
        roomId: destInv.roomId,
        status: 'good'
      }));
      await db.Apparel.bulkCreate(units, { transaction: txn });
    }
    return;
  }

  // supplies (AdminSupply)
  if (typeNorm.includes('supply')) {
    const batch = await db.ReceiveAdminSupply.create({
      roomId:         destInv.roomId,
      receivedFrom:   `Transfer #${tr.transferId}`,
      receivedBy:     accepterId || null,
      supplyName:     destInv.supplyName,
      supplyQuantity: qty,
      supplyMeasure:  destInv.supplyMeasure
    }, { transaction: txn });

    if (db.AdminSupply) {
      const units = Array(qty).fill().map(() => ({
        receiveAdminSupplyId: batch.receiveAdminSupplyId,
        adminSupplyInventoryId: destInv.adminSupplyInventoryId ?? destInv.id,
        roomId: destInv.roomId,
        status: 'in_stock'
      }));
      await db.AdminSupply.bulkCreate(units, { transaction: txn });
    }
    return;
  }

  // gen items
  if (typeNorm.includes('gen')) {
    const batch = await db.ReceiveGenItem.create({
      roomId:          destInv.roomId,
      receivedFrom:    `Transfer #${tr.transferId}`,
      receivedBy:      accepterId || null,
      genItemName:     destInv.genItemName,
      genItemSize:     destInv.genItemSize ?? null,
      genItemQuantity: qty,
      genItemType:     destInv.genItemType
    }, { transaction: txn });

    if (db.GenItem) {
      const units = Array(qty).fill().map(() => ({
        receiveGenItemId: batch.receiveGenItemId,
        roomId: destInv.roomId,
        status: 'in_stock'
      }));
      await db.GenItem.bulkCreate(units, { transaction: txn });
    }
    return;
  }

  // unsupported type -> no-op
  return;
}

// ---- add these helpers if they don't exist already in this file ----
function computeInventoryStatus(remaining) {
  if (remaining <= 1) return 'out_of_stock';
  if (remaining < 10) return 'low_stock';
  return 'high_stock';
}

async function updateInventory(inv, qtyChange, opts = {}) {
  if (!inv) return;
  if (!Number.isFinite(Number(qtyChange))) {
    throw { status: 500, message: 'Invalid qtyChange to updateInventory' };
  }
  const delta = Number(qtyChange);
  const transaction = opts.transaction;

  if (typeof inv.totalQuantity !== 'undefined') {
    inv.totalQuantity = Math.max(0, (inv.totalQuantity || 0) + delta);
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.totalQuantity);
    await inv.save({ transaction });
    return;
  }

  if (typeof inv.supplyQuantity !== 'undefined') {
    inv.supplyQuantity = Math.max(0, (inv.supplyQuantity || 0) + delta);
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.supplyQuantity);
    await inv.save({ transaction });
    return;
  }

  if (typeof inv.quantity !== 'undefined') {
    inv.quantity = Math.max(0, (inv.quantity || 0) + delta);
    if (typeof inv.status !== 'undefined') inv.status = computeInventoryStatus(inv.quantity);
    await inv.save({ transaction });
    return;
  }

  // fallback for weird models
  try {
    const current = Number(inv.getDataValue('quantity') || 0);
    inv.setDataValue('quantity', Math.max(0, current + delta));
    await inv.save({ transaction });
  } catch (err) {
    throw { status: 500, message: 'Unable to update inventory quantity', detail: err.message || err };
  }
}

function pickQuantity(inv) {
  if (!inv) return 0;
  if (typeof inv.totalQuantity !== 'undefined') return inv.totalQuantity || 0;
  if (typeof inv.supplyQuantity !== 'undefined') return inv.supplyQuantity || 0;
  if (typeof inv.quantity !== 'undefined') return inv.quantity || 0;
  return 0;
}

function inventoryModelFor(itemType) {
  if (itemType === 'apparel') return db.ApparelInventory;
  if (itemType === 'supply') return db.AdminSupplyInventory;
  if (itemType === 'genItem') return db.GenItemInventory;
  return null;
}
async function findOrCreateMatchingInventory(model, exampleInv, roomId, opts = {}) {
  const transaction = opts.transaction;
  // apparel
  if (model === db.ApparelInventory) {
    const where = {
      roomId,
      apparelName: exampleInv.apparelName,
      apparelLevel: exampleInv.apparelLevel,
      apparelType: exampleInv.apparelType,
      apparelFor: exampleInv.apparelFor,
      apparelSize: exampleInv.apparelSize
    };
    const [inv] = await db.ApparelInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction });
    return inv;
  }
  // admin supply
  if (model === db.AdminSupplyInventory) {
    const where = { roomId, supplyName: exampleInv.supplyName, supplyMeasure: exampleInv.supplyMeasure };
    const [inv] = await db.AdminSupplyInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction });
    return inv;
  }
  // gen item
  if (model === db.GenItemInventory) {
    const where = { roomId, genItemName: exampleInv.genItemName, genItemType: exampleInv.genItemType, genItemSize: exampleInv.genItemSize };
    const [inv] = await db.GenItemInventory.findOrCreate({ where, defaults: Object.assign({ totalQuantity: 0 }, where), transaction });
    return inv;
  }

  const [fallback] = await model.findOrCreate({ where: { roomId }, defaults: { totalQuantity: 0, roomId }, transaction });
  return fallback;
}

async function getById(id) {
  return db.Transfer.findByPk(id);
}
async function listTransfers({ where = {}, limit = 200, offset = 0 } = {}) {
  return db.Transfer.findAll({
    where,
    order: [['transferId','DESC']],
    limit,
    offset,
    include: [
      { model: db.Room, as: 'fromRoom', attributes: ['roomId','roomName','roomInCharge'], required: false },
      { model: db.Room, as: 'toRoom', attributes: ['roomId','roomName','roomInCharge'], required: false }
    ]
  });
}