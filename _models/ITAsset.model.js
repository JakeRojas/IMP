const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        type: { type: DataTypes.STRING, allowNull: false },
        brand: { type: DataTypes.STRING, allowNull: false },
        model: { type: DataTypes.STRING, allowNull: false },
        serialNo: { type: DataTypes.STRING, allowNull: false },
        quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        warrantyExpiry: { type: DataTypes.DATE, allowNull: true },
        description: { type: DataTypes.STRING, allowNull: true },
        assetStatus: { type: DataTypes.ENUM('inactive', 'active'), allowNull: false, defaultValue: 'active'}
    };

    return sequelize.define('ITAsset', attributes);
};