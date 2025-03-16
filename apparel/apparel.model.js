const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        type: { type: DataTypes.ENUM('intrams', 'school', "teachers", "maintenance"), allowNull: false },
        part: { type: DataTypes.ENUM('upper', 'lower'), allowNull: false },
        name: { type: DataTypes.STRING, allowNull: false },
        sex: { type: DataTypes.ENUM('male', 'female', "unisex"), allowNull: false },
        size: { type: DataTypes.ENUM('XS', 'S', 'M', 'L', 'XL', 'XXL'), allowNull: false },
        color: { type: DataTypes.STRING, allowNull: true },
        quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
        description: { type: DataTypes.STRING, allowNull: true },
        apparelStatus: { type: DataTypes.ENUM('unavailable', 'available'), allowNull: false, defaultValue: 'available' }
    };

    return sequelize.define('Apparel', attributes);
};