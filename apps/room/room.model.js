const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    floorNo: { type: DataTypes.STRING, allowNull: false },
    roomName: { type: DataTypes.STRING, allowNull: false },
    roomStatus: { type: DataTypes.ENUM('active', 'inactive'), defaultValue: 'active' }
  };

  return sequelize.define('RoomInventory', attributes);
};