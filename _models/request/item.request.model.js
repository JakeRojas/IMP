const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    itemRequestId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    requestToRoomId: { type: DataTypes.INTEGER, allowNull: true },
    requesterRoomId: { type: DataTypes.INTEGER, allowNull: true },
    itemId: { type: DataTypes.INTEGER, allowNull: true },
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: {
      type: DataTypes.ENUM('pending', 'accepted', 'released', 'declined', 'out_of_stock', 'fulfilled'),
      defaultValue: 'pending'
    },
    note: { type: DataTypes.STRING(500), allowNull: true },
    otherItemName: { type: DataTypes.STRING(255), allowNull: true },
    acceptedBy: { type: DataTypes.INTEGER, allowNull: true },
    acceptedAt: { type: DataTypes.DATE, allowNull: true },
    fulfilledBy: { type: DataTypes.INTEGER, allowNull: true },
    fulfilledAt: { type: DataTypes.DATE, allowNull: true }
  }

  const options = {
    timestamps: false
  };

  return sequelize.define('ItemRequest', attributes);
};