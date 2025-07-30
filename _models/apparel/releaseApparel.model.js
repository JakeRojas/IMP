const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        releasedBy: { type: DataTypes.STRING, allowNull: false },
        claimedBy: { type: DataTypes.STRING, allowNull: false },
        apparelQuantity: { type: DataTypes.INTEGER, allowNull: false },
        releasedAt:  { type:DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('Release_Apparel', attributes, options);
};