const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        receiveApparelId: { type: DataTypes.INTEGER,  allowNull: false },
        receiveSupplyId: { type: DataTypes.INTEGER,  allowNull: false },
    };

    return sequelize.define('Item', attributes);
};