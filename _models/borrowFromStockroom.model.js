const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        borrower: { type: DataTypes.STRING, allowNull: false},
        itemName: { type: DataTypes.STRING, allowNull: false },
        itemCondition: {
            type: DataTypes.ENUM(
                'good', 'damage',
            ),
        },
        purpose: { type: DataTypes.STRING, allowNull: false }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('Receive_Apparel', attributes);
};