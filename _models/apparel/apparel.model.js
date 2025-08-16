/* 
    - this model will store all the received bathes of apprel items into rows
    - ex.: if db.ReceiveApprel received 5 quantitys of one specific item and will store as one row.
    - this model will store the 5 quantities into 5 rows. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const attributes = {
        apparelId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        receiveApparelId: { type: DataTypes.INTEGER,  allowNull: false },
        status: { type: DataTypes.STRING,  allowNull: false, defaultValue: 'in_stock' }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('Apparel', attributes);
};