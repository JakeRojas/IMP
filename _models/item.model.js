const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        itemName: { type: DataTypes.STRING, allowNull: false },
        itemCategory: { type: DataTypes.ENUM('it', 'apparel', 'academic', 'unknown'), allowNull: false, defaultValue: 'unknown' },
        itemQrCode: { type: DataTypes.STRING, allowNull: false },
        itemStatus: { type: DataTypes.ENUM('deactivated', 'reactivated'), allowNull: false, defaultValue: 'reactivated'}
    };

    return sequelize.define('Item', attributes);
};