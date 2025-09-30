const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    roomId:         { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
    roomName:       { type: DataTypes.STRING,   allowNull: false },
    roomFloor:      { type: DataTypes.STRING,   allowNull: false },
    roomType:       { type: DataTypes.ENUM(
                        'stockroom', 'subStockroom', 
                        'office', 'classroom', 'openarea'
                        ), 
                      allowNull: false, defaultValue: 'classroom' },
    stockroomType:  { type: DataTypes.ENUM(
                        'apparel', 'supply', 'general'
                        ), 
                      allowNull: true },
    roomInCharge:   { type: DataTypes.INTEGER,  allowNull: false }
  };

  return sequelize.define('Room', attributes);
};