const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    stockRequestId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    acccountId: { type: DataTypes.INTEGER, allowNull: false }, // keep same spelling as you provided; change to accountId if desired
    requesterRoomId: { type: DataTypes.INTEGER, allowNull: true },
    itemId: { type: DataTypes.INTEGER, allowNull: true }, // id of apparel/admin supply/gen item unit or inventory row
    itemType: { type: DataTypes.ENUM('apparel','supply','genItem'), allowNull: false, defaultValue: 'apparel' },
    quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
    status: { 
      type: DataTypes.ENUM('pending','approved','failed_request','disapproved','fulfilled'),
      defaultValue: 'pending'
    },
    note: { type: DataTypes.STRING(500), allowNull: true },
  };  

  const options = {
    timestamps: false
  };

  return sequelize.define('StockRequest', attributes);
};




  //   id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  //   requesterId: { type: DataTypes.INTEGER, allowNull: false }, // Account who created request
  //   requesterRoomId: { type: DataTypes.INTEGER, allowNull: true }, // optional room of requester
  //   target: { type: DataTypes.STRING, allowNull: true }, // optional: 'stockroom' | 'administration'
  //   autoCreated: { type: DataTypes.BOOLEAN, defaultValue: false }, // for auto requests
  //   status: { 
  //     type: DataTypes.ENUM('pending','cancelled','approved','out_of_stock','fulfilled','rejected'),
  //     defaultValue: 'pending'
  //   },
  //   note: { type: DataTypes.TEXT, allowNull: true },
  //   createdAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  //   updatedAt: { type: DataTypes.DATE }
  // }