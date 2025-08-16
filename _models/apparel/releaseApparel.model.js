/* 
    - this model will store all the released of apprels.
    - its like as receave but this one is for release feature.
    - this model will store 1 row per released item. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        releaseApparelId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        apparelInventoryId: { type: DataTypes.INTEGER, allowNull: false }, // FK to the receive batch
        releasedBy: { type: DataTypes.STRING, allowNull: false },
        claimedBy: { type: DataTypes.STRING, allowNull: false },
        releaseQuantity: { type: DataTypes.INTEGER, allowNull: false },
        releasedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReleaseApparel', attributes, options);
};