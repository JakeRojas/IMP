const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    itemRequestId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    accountId:     { type: DataTypes.INTEGER, allowNull: false }, // requester (teacher / room-in-charge)
    requesterRoomId:{ type: DataTypes.INTEGER, allowNull: true }, // optional: which room made the request
    itemId:        { type: DataTypes.INTEGER, allowNull: true }, // polymorphic id -> inventory id or unit id
    itemType:      { type: DataTypes.ENUM('apparel','supply','genItem'), allowNull: false, defaultValue: 'apparel' },
    quantity:      { type: DataTypes.INTEGER, defaultValue: 1 },
    status:        {
      type: DataTypes.ENUM('pending','accepted','released','declined','out_of_stock','fulfilled'),
      defaultValue: 'pending'
    },
    note:          { type: DataTypes.STRING(500), allowNull: true },
    acceptedBy:    { type: DataTypes.INTEGER, allowNull: true },
    acceptedAt:    { type: DataTypes.DATE, allowNull: true },
    fulfilledBy:   { type: DataTypes.INTEGER, allowNull: true },
    fulfilledAt:   { type: DataTypes.DATE, allowNull: true }
  }

  const options = {
    timestamps: false
  };

  return sequelize.define('ItemRequest', attributes);
};