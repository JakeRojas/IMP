const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    roomName: { type: DataTypes.STRING, allowNull: false },
    roomFloor: { type: DataTypes.STRING, allowNull: false },
    roomType: { type: DataTypes.ENUM('stockroom', 'office', 'classroom', 'comfortroom', 'openarea'), allowNull: false },
    stockroomType: { type: DataTypes.ENUM('apparel', 'supply', 'it', 'maintenance' ), allowNull: true },
    roomInCharge: { type: DataTypes.INTEGER, allowNull: false }
  };

  return sequelize.define('Room', attributes);
};