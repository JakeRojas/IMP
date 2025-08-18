/* 
    - this model will store all the received bathes of apprel one row per batch.
    - ex.: if db.ReceiveApprel received 5 quantitys of one specific item and will store as one row, 
    - this model will store the 5 quantities into 1 row. 
*/
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        receiveApparelId:   { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true },
        roomId:             { type: DataTypes.INTEGER,  allowNull: false },
        receivedFrom:       { type: DataTypes.STRING,   allowNull: false },
        receivedBy:         { type: DataTypes.INTEGER,  allowNull: false },
        apparelName:        { type: DataTypes.STRING,   allowNull: false },
        apparelLevel:       { type: DataTypes.ENUM(
                                'pre', 'elem', 
                                '7', '8', '9', '10', 
                                'sh', 'it', 'hs', 'educ', 
                                'teachers'
                                ), 
                                allowNull: false 
                            },
        apparelType:        { type: DataTypes.ENUM(
                                'uniform', 'pe'
                                ), 
                                allowNull: false 
                            },
        apparelFor:         { type: DataTypes.ENUM(
                                'boys', 'girls'
                                ), 
                                allowNull: false 
                            },
        apparelSize:        { type: DataTypes.ENUM(
                                '2', '4', '6', '8', '10', 
                                '12', '14', '16', '18', '20', 
                                'xs', 's', 'm', 'l', 'xl', 
                                '2xl', '3xl'
                                ), 
                                allowNull: false  
                            },
        apparelQuantity:    { type: DataTypes.INTEGER,  allowNull: false },
        receivedAt:         { type: DataTypes.DATE,     allowNull: false, defaultValue: DataTypes.NOW },
        updated:            { type: DataTypes.DATE },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ReceiveApparel', attributes);
};