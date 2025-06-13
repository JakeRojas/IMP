const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    id: { type: DataTypes.INTEGER,primaryKey: true, autoIncrement: true}, 
    roomId: { type: DataTypes.INTEGER, allowNull: false },
    itemId: { type: DataTypes.INTEGER, allowNull: false },
    registeredAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    newStatus: { type: DataTypes.ENUM('active', 'damage', 'missing'), allowNull: false, defaultValue: 'active'}
  }
  
  return sequelize.define('RoomInventory', attributes);
};