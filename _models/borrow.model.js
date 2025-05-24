const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    status: {
      type: DataTypes.ENUM('pending','approved','declined'),
      defaultValue: 'pending'
    },
    requestedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    scheduledAt: { type: DataTypes.DATE, allowNull: false }
  };

  return sequelize.define('ItemBorrow', attributes, { timestamps: true });
};