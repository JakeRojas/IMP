const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const attributes = {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        receiveApparelId: { type: DataTypes.INTEGER,  allowNull: false },
        status: { type: DataTypes.STRING,  allowNull: false, defaultValue: 'in_stock' }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('Apparel', attributes);
};