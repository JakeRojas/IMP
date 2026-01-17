const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    stockRequestId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    requesterRoomId: { type: DataTypes.INTEGER, allowNull: true },
    itemType: { type: DataTypes.STRING(50), allowNull: true },
    itemId: { type: DataTypes.INTEGER, allowNull: true },
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: {
      type: DataTypes.ENUM('pending', 'approved', 'failed_request', 'disapproved', 'fulfilled'),
      defaultValue: 'pending'
    },
    note: { type: DataTypes.STRING(500), allowNull: true },
    otherItemName: { type: DataTypes.STRING(255), allowNull: true },
  };

  const options = {
    timestamps: false
  };

  return sequelize.define('StockRequest', attributes);
};