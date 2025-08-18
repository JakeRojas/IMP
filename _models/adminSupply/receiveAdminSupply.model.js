const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        receiveAdminSupplyId:   { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        receivedFrom:           { type: DataTypes.STRING,   allowNull: false },
        receivedBy:             { type: DataTypes.INTEGER,  allowNull: false },
        supplyName:             { type: DataTypes.STRING,   allowNull: false },
        supplyQuantity:         { type: DataTypes.INTEGER,  allowNull: false },
        supplyMeasure:          { type: DataTypes.ENUM(
                                    'pc', 'box', 'bottle', 'pack', 'ream', 
                                    'meter', 'roll', 'gallon', 'unit', 'educ', 
                                    'teachers'
                                    ), 
                                    allowNull: false 
                                },
        receivedAt:             { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated:                { type: DataTypes.DATE },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReceiveAdminSupply', attributes);
};