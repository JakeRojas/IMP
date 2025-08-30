/* 
    - this model will be the innventory of apparel.
    - it will store all the received bathes of apprel items but if the received item is the same to the existing item, only the total quantity will be change
    - ex.: if db.ReceiveApprel received 5 quantities of one specific item and received again that kind of item but only 3 quantities, 
        the total quantity of that item will change by adding the new quantity into the existing.
    - this model will not store duplicate items but the total quantity will update. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
    genItemInventoryId: { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
    roomId:             { type: DataTypes.INTEGER,  allowNull: false },
    genItemName:        { type: DataTypes.STRING,   allowNull: false },
    genItemSize:        { type: DataTypes.STRING,   allowNull: true },
    genItemType:        { type: DataTypes.ENUM(
                            'it', 'maintenance', 'unknownType'
                            ), 
                            allowNull: false 
                        },
    totalQuantity:      { type: DataTypes.INTEGER,  allowNull: false, defaultValue: 0 },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('GenItemInventory', attributes);
};