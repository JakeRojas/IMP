const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
  const attributes = {
    borrowId:        { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    requesterId:     { type: DataTypes.INTEGER, allowNull: false },
    roomId:          { type: DataTypes.INTEGER, allowNull: false },

    // item info
    itemId:          { type: DataTypes.INTEGER, allowNull: true },  // inventory id (nullable)
    itemType:        { 
      type: DataTypes.ENUM('apparel','supply','genItem'), 
      allowNull: true 
    },

    quantity:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    // workflow statuses
    status: {
      type: DataTypes.ENUM(
        'waiting_for_approval',
        'approved',
        'declined',
        'acquired',
        'cancelled',
        'in_return',
        'return_accepted'
      ),
      allowNull: false,
      defaultValue: 'waiting_for_approval'
    },

    // approvals (owner actions)
    approvedBy:      { type: DataTypes.INTEGER, allowNull: true },
    approvedAt:      { type: DataTypes.DATE, allowNull: true },

    declinedBy:      { type: DataTypes.INTEGER, allowNull: true },
    declinedAt:      { type: DataTypes.DATE, allowNull: true },
    declineReason:   { type: DataTypes.TEXT, allowNull: true },

    // borrower actions
    acquiredBy:      { type: DataTypes.INTEGER, allowNull: true },
    acquiredAt:      { type: DataTypes.DATE, allowNull: true },

    cancelledBy:     { type: DataTypes.INTEGER, allowNull: true },
    cancelledAt:     { type: DataTypes.DATE, allowNull: true },

    returnedBy:      { type: DataTypes.INTEGER, allowNull: true }, // borrower marked as returned
    returnedAt:      { type: DataTypes.DATE, allowNull: true },

    // owner accepts returned items
    acceptedBy:      { type: DataTypes.INTEGER, allowNull: true },
    acceptedAt:      { type: DataTypes.DATE, allowNull: true },

    // generic note field
    note:            { type: DataTypes.TEXT, allowNull: true }
  };

  const options = {
    timestamps: true,
  };

  return sequelize.define('Borrow', attributes, options);
}