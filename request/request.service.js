const db = require('_helpers/db-handler');

module.exports = {
  createItemRequest,
  approveItemRequest,
};

// Create a new item request with a pending status
async function createItemRequest({ roomName, itemName, quantity }) {
  const newRequest = await db.ItemRequest.create({ roomName, itemName, quantity });
  return { message: 'Request submitted successfully', newRequest };
}

// Approve an existing item request by updating its status to approved
async function approveItemRequest({ requestId }) {
  const requestRecord = await db.ItemRequest.findByPk(requestId);
  if (!requestRecord) {
    throw new Error('Request not found');
  }
  requestRecord.status = 'approved';
  await requestRecord.save();
  return { message: 'Request approved successfully', requestRecord };
}