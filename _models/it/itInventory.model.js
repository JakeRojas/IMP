/* 
    - this model will be the inventory of IT.
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        itInventoryId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        roomId: { type: DataTypes.INTEGER, allowNull: false },
        itName: { type: DataTypes.STRING, allowNull: false },
        itSerialNumber: { type: DataTypes.STRING, allowNull: true },
        itModel: { type: DataTypes.STRING, allowNull: true },
        itBrand: { type: DataTypes.STRING, allowNull: true },
        itSize: { type: DataTypes.STRING, allowNull: true },
        totalQuantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        qrStatus: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ItInventory', attributes);
};
