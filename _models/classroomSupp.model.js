const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        item: { type: DataTypes.STRING, allowNull: false },
        quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        unit: { type: DataTypes.STRING, allowNull: false },
        location: { type: DataTypes.STRING, allowNull: false },
        itemStatus: { type: DataTypes.ENUM('incomplete', 'complete', 'restored', 'broken'), allowNull: false, defaultValue: 'restored'}
    };

    return sequelize.define('ClassroomSupp', attributes);
};