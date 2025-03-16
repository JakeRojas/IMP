const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    roomName: { type: DataTypes.STRING, allowNull: false },
    itemName: { type: DataTypes.STRING, allowNull: false },
    quantity: { type: DataTypes.INTEGER, allowNull: false },
    status: { 
      type: DataTypes.ENUM('pending', 'approved'), 
      allowNull: false, 
      defaultValue: 'pending' 
    },
  };

  return sequelize.define('ItemRequest', attributes, { timestamps: true });
};