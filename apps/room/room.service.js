const db = require('_helpers/db-handler');

module.exports = {
  monitorRoomsInventory,
  borrowItemBetweenRooms,
};

// Retrieve all room inventories with items details
async function monitorRoomsInventory() {
  return await db.RoomInventory.findAll();
}

// Borrow items from one room and add them to another
async function borrowItemBetweenRooms({ fromRoom, toRoom, borrowedBy, itemId, quantity }) {
  // Use a transaction to ensure data consistency
  const transaction = await db.sequelize.transaction();
  try {
    // Find the inventory record for the source room and item
    const sourceRecord = await db.RoomInventory.findOne({
      where: { roomName: fromRoom, borrowedBy, itemId },
      transaction,
    });

    if (!sourceRecord || sourceRecord.quantity < quantity) {
      throw new Error('Not enough items available in the source room');
    }

    // Deduct quantity from source room
    sourceRecord.quantity -= quantity;
    await sourceRecord.save({ transaction });

    // Check if a record exists for the destination room and item
    let destinationRecord = await db.RoomInventory.findOne({
      where: { roomName: toRoom, borrowedBy, itemId },
      transaction,
    });

    if (destinationRecord) {
      // Add borrowed quantity to the destination record
      destinationRecord.quantity += quantity;
      await destinationRecord.save({ transaction });
    } else {
      // Otherwise, create a new record in the destination room
      destinationRecord = await db.RoomInventory.create(
        {
          roomName: toRoom,
          itemId,
          borrowedBy,
          quantity: quantity,
        },
        { transaction }
      );
    }

    await transaction.commit();
    return { message: 'Items successfully borrowed', source: sourceRecord, destination: destinationRecord };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}