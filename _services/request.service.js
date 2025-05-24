const db = require('_helpers/db-handler');

module.exports = {
  createItemRequest,
  approveItemRequest,
};

async function createItemRequest({ roomName, itemName, quantity }) {
  const newRequest = await db.ItemRequest.create({ roomName, itemName, quantity });
  return { message: 'Request submitted successfully', newRequest };
}
async function approveItemRequest({ requestId }) {
  const requestRecord = await db.ItemRequest.findByPk(requestId);
    if (!requestRecord) {
      throw new Error('Request not found');
    }
  requestRecord.status = 'approved';
    await requestRecord.save();
  return { message: 'Request approved successfully', requestRecord };
}