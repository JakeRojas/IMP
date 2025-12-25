const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const attributes = {
        adminSupplyId:          { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        roomId:                 { type: DataTypes.INTEGER,  allowNull: false },
        receiveAdminSupplyId:   { type: DataTypes.INTEGER,  allowNull: false },
        // status:                 { type: DataTypes.STRING,   allowNull: false, defaultValue: 'in_stock' },
        status: {
            type: DataTypes.ENUM('good', 'working', 'damage'),
            allowNull: false,
            defaultValue: 'good'
          },
        description:        { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        adminSupplyInventoryId: { type: DataTypes.INTEGER,  allowNull: false },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('AdminSupply', attributes);
};