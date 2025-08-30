/* 
    - this model will store all the received bathes of apprel one row per batch.
    - ex.: if db.ReceiveApprel received 5 quantitys of one specific item and will store as one row, 
    - this model will store the 5 quantities into 1 row. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        receiveGenItemId:   { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        roomId:             { type: DataTypes.INTEGER,  allowNull: false },
        receivedFrom:       { type: DataTypes.STRING,   allowNull: false },
        receivedBy:         { type: DataTypes.INTEGER,  allowNull: false },
        genItemName:        { type: DataTypes.STRING,   allowNull: false },
        genItemSize:        { type: DataTypes.STRING,   allowNull: true },
        genItemQuantity:    { type: DataTypes.INTEGER,  allowNull: false },
        genItemType:        { type: DataTypes.ENUM(
                                'it', 'maintenance', 'unknownType'
                                ), 
                                allowNull: false 
                            },
        receivedAt:         { type: DataTypes.DATE,     allowNull: false, defaultValue: DataTypes.NOW },
        updated:            { type: DataTypes.DATE },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReceiveGenItem', attributes);
};