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