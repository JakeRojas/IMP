/* 
    - this model will store all the received bathes of it one row per batch.
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        receiveItId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        roomId: { type: DataTypes.INTEGER, allowNull: false },
        receivedFrom: { type: DataTypes.STRING, allowNull: false },
        receivedBy: { type: DataTypes.INTEGER, allowNull: false },
        itName: { type: DataTypes.STRING, allowNull: false },
        itSerialNumber: { type: DataTypes.STRING, allowNull: true },
        itModel: { type: DataTypes.STRING, allowNull: true },
        itBrand: { type: DataTypes.STRING, allowNull: true },
        itSize: { type: DataTypes.STRING, allowNull: true },
        itQuantity: { type: DataTypes.INTEGER, allowNull: false },
        receivedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated: { type: DataTypes.DATE },
        qrStatus: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReceiveIt', attributes);
};
