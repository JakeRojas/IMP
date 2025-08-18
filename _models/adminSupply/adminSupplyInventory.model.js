/* 
    - this model will be the innventory of admin supply.
    - it will store all the received bathes of admin supply items but if the received item is the same to the existing item, only the total quantity will be change
    - ex.: if db.ReceiveAdminSupply received 5 quantities of one specific item and received again that kind of item but only 3 quantities, 
        the total quantity of that item will change by adding the new quantity into the existing.
    - this model will not store duplicate items but the total quantity will update. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
    adminSupplyInventoryId: { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
    roomId:                 { type: DataTypes.INTEGER,  allowNull: false },
    supplyName:             { type: DataTypes.STRING,   allowNull: false },
    supplyMeasure:          { type: DataTypes.ENUM(
                                'pc', 'box', 'bottle', 'pack', 'ream', 
                                'meter', 'roll', 'gallon', 'unit', 'educ', 
                                'teachers'
                                ), 
                                allowNull: false 
                            },
    totalQuantity:          { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('AdminSupplyInventory', attributes);
};