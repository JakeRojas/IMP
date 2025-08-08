const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        receivedFrom: { type: DataTypes.STRING, allowNull: false },
        receivedBy: { type: DataTypes.STRING, allowNull: false },
        apparelName: { type: DataTypes.STRING, allowNull: false },
        apparelLevel: { 
            type: DataTypes.ENUM(
                'pre', 'elem', 
                '7', '8', '9', '10', 
                'sh', 'it', 'hs', 'educ', 
                'teachers'
                ), 
            allowNull: false 
        },
        apparelType: { 
            type: DataTypes.ENUM(
                'uniform', 'pe'
                ), 
            allowNull: false 
        },
        apparelFor: { 
            type: DataTypes.ENUM(
                'boys', 'girls'
                ), 
            allowNull: false 
        },
        apparelSize: { type: DataTypes.ENUM(
            '2', '4', '6', '8', '10', 
            '12', '14', '16', '18', '20', 
            'xs', 's', 'm', 'l', 'xl', 
            '2xl', '3xl'
            ), 
            allowNull: false  
        },
        apparelQuantity: { type: DataTypes.INTEGER, allowNull: false },
        receivedAt:  { type:DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        updated: { type: DataTypes.DATE },
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('Receive_Apparel', attributes);
};