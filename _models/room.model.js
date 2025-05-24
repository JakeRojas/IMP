const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    roomName: { type: DataTypes.STRING, allowNull: false },
    roomFloor: { type: DataTypes.STRING, allowNull: false },
    roomInCharge: { type: DataTypes.INTEGER, allowNull: false }
  };

  return sequelize.define('Room', attributes);
};