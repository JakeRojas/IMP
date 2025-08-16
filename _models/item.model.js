/* 
    - this model will store all the received bathes of different kinds of items like apparel, admin supply and etc. into single rows.
    - ex.: if db.ReceiveApprel and db.receiveAdminSupply received 5 quantities each, db.item will store it into 10 rows.s
    - this model will store the 5 quantities into 1 row,but not for apparel only but to all kinds of items. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        itemId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        receiveApparelId: { type: DataTypes.INTEGER,  allowNull: false },
        receiveAdminSupplyId: { type: DataTypes.INTEGER,  allowNull: false },
    };

    return sequelize.define('Item', attributes);
};