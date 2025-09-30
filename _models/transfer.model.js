const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
    const attributes = {
        transferId:      { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    fromRoomId:      { type: DataTypes.INTEGER, allowNull: false },
    toRoomId:        { type: DataTypes.INTEGER, allowNull: false },
    createdBy:       { type: DataTypes.INTEGER, allowNull: false }, // accountId who initiated
    itemType:        { type: DataTypes.STRING, allowNull: false }, // 'apparel'|'supply'|'genItem'
    itemId:          { type: DataTypes.INTEGER, allowNull: true },  // inventoryId or null
    quantity:        { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },

    status:          { type: DataTypes.STRING, allowNull: false, defaultValue: 'in_transfer' },
    acceptedBy:      { type: DataTypes.INTEGER, allowNull: true },
    acceptedAt:      { type: DataTypes.DATE, allowNull: true },

    returningBy:     { type: DataTypes.INTEGER, allowNull: true },
    returnedAt:      { type: DataTypes.DATE, allowNull: true },

    note:            { type: DataTypes.TEXT, allowNull: true },

    //createdAt:       { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt:       { type: DataTypes.DATE, allowNull: true }
    };

    const options = { 
        timestamps: false
    };

    return sequelize.define('Transfer', attributes, options);
    
}