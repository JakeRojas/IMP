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
    roomId:         { type: DataTypes.INTEGER, allowNull: false },
    // these fields identify the “type” of apparel
    apparelName:    { type: DataTypes.STRING,  allowNull: false },
    apparelLevel:   { type: DataTypes.ENUM('pre','elem','7','8','9','10','sh','it','hs','educ','teachers'), allowNull: false },
    apparelType:    { type: DataTypes.ENUM('uniform','pe'),       allowNull: false },
    apparelFor:     { type: DataTypes.ENUM('boys','girls'),      allowNull: false },
    apparelSize:    { type: DataTypes.ENUM(
                        '2', '4', '6', '8', '10', 
                        '12', '14', '16', '18', '20', 
                        'xs', 's', 'm', 'l', 'xl', 
                        '2xl', '3xl'
                        ), 
                        allowNull: false  
                    },
    totalQuantity:  { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ApparelInventory', attributes);
};