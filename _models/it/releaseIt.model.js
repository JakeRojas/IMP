/* 
    - this model will store all the released of IT.
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        releaseItId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        roomId: { type: DataTypes.INTEGER, allowNull: false },
        itInventoryId: { type: DataTypes.INTEGER, allowNull: false },
        releasedBy: { type: DataTypes.STRING, allowNull: false },
        claimedBy: { type: DataTypes.STRING, allowNull: false },
        releaseItemQuantity: { type: DataTypes.INTEGER, allowNull: false },
        accountId: { type: DataTypes.INTEGER, allowNull: true },
        notes: { type: DataTypes.STRING, allowNull: true },
        releasedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReleaseIt', attributes, options);
};
