/* 
    - this model will store all the received bathes of it items into rows
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const attributes = {
        itId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        roomId: { type: DataTypes.INTEGER, allowNull: false },
        receiveItId: { type: DataTypes.INTEGER, allowNull: false },
        status: {
            type: DataTypes.ENUM('good', 'working', 'damage', 'released'),
            allowNull: false,
            defaultValue: 'good'
        },
        description: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        itInventoryId: { type: DataTypes.INTEGER, allowNull: false },
        qrStatus: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('It', attributes);
};
