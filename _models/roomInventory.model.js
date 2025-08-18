const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    roomInventoryId:  { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    roomId:           { type: DataTypes.INTEGER, allowNull: false },
    itemId:           { type: DataTypes.INTEGER, allowNull: false },
    quantity:         { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  };

  const options = {
    timestamps: false,
  };
  
  return sequelize.define('RoomInventory', attributes);
};