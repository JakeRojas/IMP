const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const attributes = {
        adminSupplyId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        receiveAdminSupplyId: { type: DataTypes.INTEGER,  allowNull: false },
        status: { type: DataTypes.STRING,  allowNull: false, defaultValue: 'in_stock' }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('AdminSupply', attributes);
};