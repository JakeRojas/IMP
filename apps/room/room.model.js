const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    roomName: { type: DataTypes.STRING, allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    status: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' }
  };

  return sequelize.define('RoomInventory', attributes);
};