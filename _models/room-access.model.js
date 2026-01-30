const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        roomAccessId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        accountId: { type: DataTypes.INTEGER, allowNull: false },
        roomId: { type: DataTypes.INTEGER, allowNull: false }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('RoomAccess', attributes, options);
};
