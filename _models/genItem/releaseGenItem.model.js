/* 
    - this model will store all the released of apprels.
    - its like as receave but this one is for release feature.
    - this model will store 1 row per released item. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        releaseGenItemId:       { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        roomId:                 { type: DataTypes.INTEGER,  allowNull: false },
        genItemInventoryId:     { type: DataTypes.INTEGER,  allowNull:  false },
        releasedBy:             { type: DataTypes.STRING,   allowNull:  false },
        claimedBy:              { type: DataTypes.STRING,   allowNull:  false },
        releaseItemQuantity:    { type: DataTypes.INTEGER,  allowNull:  false },
        genItemType:            { type: DataTypes.ENUM(
                                    'it', 'maintenance', 'unknownType'
                                    ), 
                                    allowNull: false 
                                },
        releasedAt:             { type: DataTypes.DATE,     allowNull:  false, defaultValue: DataTypes.NOW },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReleaseGenItem', attributes, options);
};