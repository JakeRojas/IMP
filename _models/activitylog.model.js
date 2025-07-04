const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
    const attributes = {
        AccountId: { type: DataTypes.INTEGER, allowNull: false },
        // entity: { type: DataTypes.STRING, allowNull: true },
        // entityId: { type: DataTypes.INTEGER, allowNull: true },
        actionType: { type: DataTypes.STRING, allowNull: false },
        actionDetails: { type: DataTypes.TEXT, allowNull: true },
        timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    };

    const options = {
        timestamps: false 
        
    };

    return sequelize.define('ActivityLog', attributes, options);
}