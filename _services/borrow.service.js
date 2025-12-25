const db = require('_helpers/db-handler');
const Role = require('_helpers/role');
const accountService = require('./account.service');

module.exports = {
  createBorrow,
  listBorrows,
  getById,
  cancelBorrow,
  approveBorrow,
  declineBorrow,
  acquireBorrow,
  returnBorrow,
  acceptReturn,
};

async function createBorrow(payload, ipAddress, browserInfo) {
  const { requesterId, roomId, quantity = 1 } = payload;
  if (!requesterId || !roomId) throw { status: 400, message: 'Missing required fields' };
  const q = parseInt(quantity, 10);
  if (!Number.isInteger(q) || q <= 0) throw { status: 400, message: 'quantity must be positive' };

  const created = await db.Borrow.create({
    requesterId,
    roomId,
    itemId: payload.itemId || null,
    quantity: q,
    note: payload.note || null,
    status: 'waiting_for_approval'
  });

  try {
    await accountService.logActivity(String(requesterId), 'borrow_create', ipAddress, browserInfo, `borrowId:${created.borrowId}`);
  } catch (err) {
    console.error('activity log failed (createBorrow)', err);
  }

  return created;
}
async function listBorrows({ where = {}, limit = 200, offset = 0 } = {}) {
  const rows = await db.Borrow.findAll({
    where,
    order: [['borrowId', 'DESC']],
    limit,
    offset,
    include: [
      { model: db.Account, as: 'requester', attributes: ['accountId', 'firstName', 'lastName'], required: false },
      // { model: db.Room, foreignKey: 'roomId' },
      { model: db.Room, as: 'room', attributes: ['roomId', 'roomName', 'roomInCharge'], required: false },

      // polymorphic-ish item relations (no FK constraints)
      // { model: db.ApparelInventory, foreignKey: 'itemId', constraints: false },
      // { model: db.AdminSupplyInventory, foreignKey: 'itemId', constraints: false },
      // { model: db.GenItemInventory, foreignKey: 'itemId', constraints: false },
    ]
  });

  return rows;
}
async function getById(id) {
  if (!id) throw { status: 400, message: 'id required' };
  const n = parseInt(id, 10);
  if (!Number.isInteger(n) || n <= 0) throw { status: 400, message: 'invalid id' };

  const r = await db.Borrow.findByPk(n, {
    include: [
      { model: db.Account, as: 'requester', foreignKey: 'requesterId' },
      { model: db.Room, as: 'room', foreignKey: 'roomId' },
      { model: db.ApparelInventory, foreignKey: 'itemId', as: 'apparel', constraints: false },
      { model: db.AdminSupplyInventory, foreignKey: 'itemId', as: 'adminSupply', constraints: false },
      { model: db.GenItemInventory, foreignKey: 'itemId', as: 'generalItem', constraints: false },
    ]
  });

  if (!r) throw { status: 404, message: 'Borrow not found' };
  return r;
}

async function _getCallerId(user) {
  // flexible - return the first available id-like property as string
  const id = user?.accountId ?? user?.id ?? user?.userId ?? null;
  return id == null ? null : String(id);
}
async function getInventoryModelForItemId(db, id, transaction) {
  if (!id) return null;

  // Try each model; return the first that contains a row with this PK.
  const models = [
    { key: 'apparel', model: db.ApparelInventory },
    { key: 'supply',  model: db.AdminSupplyInventory },
    { key: 'genitem', model: db.GenItemInventory }
  ];

  for (const m of models) {
    if (!m.model) continue;
    // use transaction and lock if provided
    const opts = transaction ? { transaction, lock: transaction.LOCK.UPDATE } : {};
    const row = await m.model.findByPk(id, opts);
    if (row) {
      return { key: m.key, model: m.model, row };
    }
  }
  return null;
}
async function cancelBorrow(borrowId, user, ipAddress, browserInfo) {
  const n = Number(borrowId);
  if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

  const b = await db.Borrow.findByPk(n, { include: [{ model: db.Room }] });
  if (!b) throw { status: 404, message: 'Borrow not found' };

  // only requester can cancel
  if (String(b.requesterId) !== String(user.accountId)) {
    throw { status: 403, message: 'Only requester can cancel this borrow' };
  }

  // allow cancel only in these states (adjust if you want more)
  if (!['waiting_for_approval', 'approved'].includes(b.status)) {
    throw { status: 400, message: `Cannot cancel borrow in status '${b.status}'` };
  }

  b.status = 'cancelled';
  b.cancelledBy = user.accountId;
  b.cancelledAt = new Date();

  await b.save();

  try {
    await accountService.logActivity(String(user.accountId), 'borrow_cancel', ipAddress, browserInfo, `borrowId:${b.borrowId}`);
  } catch (err) {
    console.error('activity log failed (cancelBorrow)', err);
  }

  return b;
}

async function approveBorrow(borrowId, user, ipAddress, browserInfo) {
  const n = Number(borrowId);
  if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

  // load borrow (no includes required)
  const b = await db.Borrow.findByPk(n);
  if (!b) throw { status: 404, message: 'Borrow not found' };

  if (b.status !== 'waiting_for_approval') {
    throw { status: 400, message: 'Only requests waiting for approval can be approved' };
  }

  // requester cannot approve
  if (String(b.requesterId) === String((user?.accountId ?? user?.id ?? user?.userId))) {
    throw { status: 403, message: 'Requester cannot approve their own borrow' };
  }

  // get caller id reliably
  const callerId = await _getCallerId(user);
  if (!callerId) throw { status: 401, message: 'Invalid user identity' };

  // only superadmin OR the room in-charge (by ID) can approve
  const userRole = String(user.role ?? '').toLowerCase();
  const isSuperAdmin = userRole === 'superadmin';

  // fetch room explicitly to ensure roomInCharge is available (avoids include/as mismatch)
  const room = await db.Room.findByPk(b.roomId);
  if (!room) throw { status: 500, message: 'Associated room not found for this borrow' };

  const roomInChargeId = room.roomInCharge == null ? null : String(room.roomInCharge);

  if (!isSuperAdmin && callerId !== roomInChargeId) {
    throw { status: 403, message: 'Not authorized to approve this borrow' };
  }

  b.status = 'approved';
  b.approvedBy = callerId;
  b.approvedAt = new Date();

  await b.save();

  try {
    await accountService.logActivity(String(callerId), 'borrow_approve', ipAddress, browserInfo, `borrowId:${b.borrowId}`);
  } catch (err) {
    console.error('activity log failed (approveBorrow)', err);
  }

  return b;
}
async function declineBorrow(borrowId, user, opts = {}, ipAddress, browserInfo) {
  const reason = opts.reason ?? null;
  const n = Number(borrowId);
  if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

  const b = await db.Borrow.findByPk(n);
  if (!b) throw { status: 404, message: 'Borrow not found' };

  if (b.status !== 'waiting_for_approval') {
    throw { status: 400, message: 'Only requests waiting for approval can be declined' };
  }

  // requester cannot decline
  if (String(b.requesterId) === String((user?.accountId ?? user?.id ?? user?.userId))) {
    throw { status: 403, message: 'Requester cannot decline their own borrow' };
  }

  const callerId = await _getCallerId(user);
  if (!callerId) throw { status: 401, message: 'Invalid user identity' };

  const userRole = String(user.role ?? '').toLowerCase();
  const isSuperAdmin = userRole === 'superadmin';

  // fetch room explicitly
  const room = await db.Room.findByPk(b.roomId);
  if (!room) throw { status: 500, message: 'Associated room not found for this borrow' };

  const roomInChargeId = room.roomInCharge == null ? null : String(room.roomInCharge);

  if (!isSuperAdmin && callerId !== roomInChargeId) {
    throw { status: 403, message: 'Not authorized to decline this borrow' };
  }

  b.status = 'declined';
  b.declinedBy = callerId;
  b.declinedAt = new Date();
  b.declineReason = reason;

  await b.save();

  try {
    await accountService.logActivity(String(callerId), 'borrow_decline', ipAddress, browserInfo, `borrowId:${b.borrowId}${reason ? `, reason:${reason}` : ''}`);
  } catch (err) {
    console.error('activity log failed (declineBorrow)', err);
  }

  return b;
}

// async function acquireBorrow(borrowId, user) {
//   const n = Number(borrowId);
//   if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

//   return await db.sequelize.transaction(async (t) => {
//     const borrow = await db.Borrow.findByPk(n, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!borrow) throw { status: 404, message: 'Borrow not found' };

//     if (borrow.status !== 'approved') throw { status: 400, message: "Only 'approved' borrows can be acquired" };

//     const callerId = (user?.accountId ?? user?.id ?? user?.userId);
//     if (!callerId) throw { status: 401, message: 'Invalid user identity' };
//     if (String(borrow.requesterId) !== String(callerId)) throw { status: 403, message: 'Only the requester can acquire this borrow' };

//     const itemId = borrow.itemId;
//     if (!itemId) throw { status: 400, message: 'Borrow has no itemId' };

//     const invInfo = await getInventoryModelForItemId(db, itemId, t);
//     if (!invInfo) throw { status: 400, message: 'Inventory item not found in any inventory table' };

//     const inv = invInfo.row;
//     const qty = Number(borrow.quantity || 0);
//     if (!Number.isFinite(qty) || qty <= 0) throw { status: 400, message: 'Invalid borrow quantity' };

//     const available = Number(inv.totalQuantity || 0);
//     if (available < qty) throw { status: 400, message: `Insufficient stock: available ${available}, required ${qty}` };

//     inv.totalQuantity = Math.max(0, available - qty);
//     await inv.save({ transaction: t });

//     borrow.status = 'acquired';
//     borrow.acquiredBy = String(callerId);
//     borrow.acquiredAt = new Date();
//     await borrow.save({ transaction: t });

//     return borrow;
//   });
// }
async function acquireBorrow(borrowId, user, ipAddress, browserInfo) {
  const n = Number(borrowId);
  if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

  const result = await db.sequelize.transaction(async (t) => {
    const borrow = await db.Borrow.findByPk(n, { transaction: t, lock: t.LOCK.UPDATE });
    if (!borrow) throw { status: 404, message: 'Borrow not found' };
    if (borrow.status !== 'approved') throw { status: 400, message: "Only 'approved' borrows can be acquired" };

    const callerId = (user?.accountId ?? user?.id ?? user?.userId);
    if (!callerId) throw { status: 401, message: 'Invalid user identity' };
    if (String(borrow.requesterId) !== String(callerId)) throw { status: 403, message: 'Only the requester can acquire this borrow' };

    const itemId = borrow.itemId;
    if (!itemId) throw { status: 400, message: 'Borrow has no itemId' };

    const invInfo = await getInventoryModelForItemId(db, itemId, t);
    if (!invInfo) throw { status: 400, message: 'Inventory item not found in any inventory table' };

    const inv = invInfo.row;
    const qty = Number(borrow.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) throw { status: 400, message: 'Invalid borrow quantity' };

    const available = Number(inv.totalQuantity || 0);
    if (available < qty) throw { status: 400, message: `Insufficient stock: available ${available}, required ${qty}` };

    inv.totalQuantity = Math.max(0, available - qty);
    await inv.save({ transaction: t });

    borrow.status = 'acquired';
    borrow.acquiredBy = String(callerId);
    borrow.acquiredAt = new Date();
    await borrow.save({ transaction: t });

    return borrow;
  });

  // log activity (best-effort) — use acquiredBy from result
  try {
    await accountService.logActivity(String(result.acquiredBy), 'borrow_acquire', ipAddress, browserInfo, `borrowId:${result.borrowId}`);
  } catch (err) {
    console.error('activity log failed (acquireBorrow)', err);
  }

  return result;
}
async function returnBorrow(borrowId, user, opts = {}, ipAddress, browserInfo) {
  const note = opts.note ?? null;
  const n = Number(borrowId);
  if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

  // load borrow
  const b = await db.Borrow.findByPk(n);
  if (!b) throw { status: 404, message: 'Borrow not found' };

  // only allow return when it was acquired
  if (b.status !== 'acquired') {
    throw { status: 400, message: "Only 'acquired' borrows can be returned" };
  }

  // get caller id
  const callerId = await _getCallerId(user);
  if (!callerId) throw { status: 401, message: 'Invalid user identity' };

  // allow only requester OR the one who acquired (acquiredBy)
  const isRequester = String(b.requesterId) === String(callerId);
  const isAcquirer  = b.acquiredBy != null && String(b.acquiredBy) === String(callerId);

  if (!isRequester && !isAcquirer) {
    throw { status: 403, message: 'Only the requester or the acquirer can return this borrow' };
  }

  // perform return update
  b.status = 'in_return';
  b.returnedBy = callerId;
  b.returnedAt = new Date();
  if (note) b.returnNote = String(note).slice(0, 1000); // limit note size

  await b.save();

  try {
    await accountService.logActivity(String(callerId), 'borrow_return', ipAddress, browserInfo, `borrowId:${b.borrowId}${note ? `, note:${note}` : ''}`);
  } catch (err) {
    console.error('activity log failed (returnBorrow)', err);
  }

  return b;
}

// async function acceptReturn(borrowId, user, ipAddress, browserInfo) {
//   const n = Number(borrowId);
//   if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

//   return await db.sequelize.transaction(async (t) => {
//     const borrow = await db.Borrow.findByPk(n, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!borrow) throw { status: 404, message: 'Borrow not found' };

//     if (borrow.status !== 'in_return') throw { status: 400, message: "Only 'in_return' borrows can be accepted" };

//     const callerId = (user?.accountId ?? user?.id ?? user?.userId);
//     if (!callerId) throw { status: 401, message: 'Invalid user identity' };

//     // verify room in-charge, same as before
//     const room = await db.Room.findByPk(borrow.roomId, { transaction: t, lock: t.LOCK.UPDATE });
//     if (!room) throw { status: 500, message: 'Associated room not found' };
//     if (String(room.roomInCharge) !== String(callerId)) throw { status: 403, message: 'Only the room in charge can accept returned items' };

//     const itemId = borrow.itemId;
//     if (!itemId) throw { status: 400, message: 'Borrow has no itemId' };

//     const invInfo = await getInventoryModelForItemId(db, itemId, t);
//     if (!invInfo) throw { status: 400, message: 'Inventory item not found in any inventory table' };

//     const inv = invInfo.row;
//     const qty = Number(borrow.quantity || 0);
//     if (!Number.isFinite(qty) || qty <= 0) throw { status: 400, message: 'Invalid borrow quantity' };

//     inv.totalQuantity = (Number(inv.totalQuantity || 0) + qty);
//     await inv.save({ transaction: t });

//     borrow.status = 'return_accepted';
//     borrow.acceptedBy = String(callerId);
//     borrow.acceptedAt = new Date();
//     await borrow.save({ transaction: t });

//     try {
//       await accountService.logActivity(String(result.acceptedBy), 'borrow_accept_return', '', '', `borrowId:${result.borrowId}`);
//     } catch (err) {
//       console.error('activity log failed (acceptReturn)', err);
//     }

//     return borrow;
//   });
// }
async function acceptReturn(borrowId, user, ipAddress, browserInfo) {
  const n = Number(borrowId);
  if (!Number.isFinite(n) || n <= 0) throw { status: 400, message: 'Invalid id' };

  const result = await db.sequelize.transaction(async (t) => {
    const borrow = await db.Borrow.findByPk(n, { transaction: t, lock: t.LOCK.UPDATE });
    if (!borrow) throw { status: 404, message: 'Borrow not found' };
    if (borrow.status !== 'in_return') throw { status: 400, message: "Only 'in_return' borrows can be accepted" };

    const callerId = (user?.accountId ?? user?.id ?? user?.userId);
    if (!callerId) throw { status: 401, message: 'Invalid user identity' };

    const room = await db.Room.findByPk(borrow.roomId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!room) throw { status: 500, message: 'Associated room not found' };
    if (String(room.roomInCharge) !== String(callerId)) throw { status: 403, message: 'Only the room in charge can accept returned items' };

    const itemId = borrow.itemId;
    if (!itemId) throw { status: 400, message: 'Borrow has no itemId' };

    const invInfo = await getInventoryModelForItemId(db, itemId, t);
    if (!invInfo) throw { status: 400, message: 'Inventory item not found in any inventory table' };

    const inv = invInfo.row;
    const qty = Number(borrow.quantity || 0);
    if (!Number.isFinite(qty) || qty <= 0) throw { status: 400, message: 'Invalid borrow quantity' };

    inv.totalQuantity = (Number(inv.totalQuantity || 0) + qty);
    await inv.save({ transaction: t });

    borrow.status = 'return_accepted';
    borrow.acceptedBy = String(callerId);
    borrow.acceptedAt = new Date();
    await borrow.save({ transaction: t });

    return borrow;
  });

  try {
    await accountService.logActivity(String(result.acceptedBy), 'borrow_accept_return', ipAddress, browserInfo, `borrowId:${result.borrowId}`);
  } catch (err) {
    console.error('activity log failed (acceptReturn)', err);
  }

  return result;
}
