const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    stockRequestId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountId: { type: DataTypes.INTEGER, allowNull: false },
    requesterRoomId: { type: DataTypes.INTEGER, allowNull: true },
    itemId: { type: DataTypes.INTEGER, allowNull: true },
    itemType: { type: DataTypes.ENUM('apparel','supply','genItem'), allowNull: false, defaultValue: 'apparel' },
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: { 
      type: DataTypes.ENUM('pending','approved','failed_request','disapproved','fulfilled'),
      defaultValue: 'pending'
    },
    note: { type: DataTypes.STRING(500), allowNull: true },
  };  

  const options = {
    timestamps: false
  };

  return sequelize.define('StockRequest', attributes);
};