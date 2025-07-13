const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        itemName: { type: DataTypes.STRING, allowNull: false },
        itemCategory: { type: DataTypes.ENUM('it', 'apparel', 'academic', 'unknown'), allowNull: false },
        itemQrCode: { type: DataTypes.STRING, allowNull: false },
        activateStatus: { type: DataTypes.ENUM('deactivated', 'reactivated'), allowNull: false, defaultValue: 'reactivated'},
        itemStatus: { type: DataTypes.ENUM('active','damage','missing', 'in-use'), allowNull: false, defaultValue: 'active'},
        transactionStatus: { type: DataTypes.ENUM('received','transferred','borrowed'), allowNull: false, defaultValue: 'received' }
    };

    return sequelize.define('Item', attributes);
};