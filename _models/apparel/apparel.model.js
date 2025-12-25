/* 
    - this model will store all the received bathes of apprel items into rows
    - ex.: if db.ReceiveApprel received 5 quantitys of one specific item and will store as one row.
    - this model will store the 5 quantities into 5 rows. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {

    const attributes = {
        apparelId:          { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        roomId:             { type: DataTypes.INTEGER,  allowNull: false },
        receiveApparelId:   { type: DataTypes.INTEGER,  allowNull: false },
        status:             { type: DataTypes.ENUM(
                                'good','working',
                                'damage',
                                ), defaultValue: 'good'
                            },
        description:        { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
        apparelInventoryId: { type: DataTypes.INTEGER, allowNull: false },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('Apparel', attributes);
};