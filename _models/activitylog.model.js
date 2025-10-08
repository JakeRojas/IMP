const { DataTypes } = require('sequelize');

module.exports = model;

function model(sequelize) {
    const attributes = {
        activityLogId:  { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        accountId:      { type: DataTypes.INTEGER,  allowNull: false },
        actionType:     { type: DataTypes.STRING,   allowNull: false },
        actionDetails:  { type: DataTypes.TEXT,     allowNull: true },
        timestamp:      { type: DataTypes.DATE,     defaultValue: DataTypes.NOW },
    };

    const options = {
        timestamps: false 
        
    };

    return sequelize.define('ActivityLog', attributes, options);
}