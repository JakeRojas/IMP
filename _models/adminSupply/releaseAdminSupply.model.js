/* 
    - this model will store all the released of apprels.
    - its like as receave but this one is for release feature.
    - this model will store 1 row per released item. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        releaseAdminSupplyId:       { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        roomId:                     { type: DataTypes.INTEGER,  allowNull: false },
        adminSupplyInventoryId:     { type: DataTypes.INTEGER,  allowNull:  false },
        releasedBy:                 { type: DataTypes.STRING,   allowNull:  false },
        claimedBy:                  { type: DataTypes.STRING,   allowNull:  false },
        releaseAdminSupplyQuantity: { type: DataTypes.INTEGER,  allowNull:  false },
        releasedAt:                 { type: DataTypes.DATE,     allowNull:  false, defaultValue: DataTypes.NOW },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReleaseAdminSupply', attributes);
};