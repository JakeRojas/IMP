const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        stockStatus: { type: DataTypes.ENUM('low', 'high'), allowNull: true}
    };

    return sequelize.define('Stockroom', attributes);
};