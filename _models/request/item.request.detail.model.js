const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
    const attributes = {
        itemRequestDetailId: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
        itemRequestId: { type: DataTypes.INTEGER, allowNull: false },
        itemId: { type: DataTypes.INTEGER, allowNull: true },
        itemType: { type: DataTypes.STRING(50), allowNull: true },
        otherItemName: { type: DataTypes.STRING(255), allowNull: true },
        quantity: { type: DataTypes.INTEGER, defaultValue: 1 },
        note: { type: DataTypes.STRING(500), allowNull: true },

        // Status can be per-item or inherited. For now we inherit from parent or allow per-item override.
        status: {
            type: DataTypes.ENUM('pending', 'accepted', 'released', 'declined', 'out_of_stock', 'fulfilled'),
            defaultValue: 'pending'
        }
    };

    const options = {
        timestamps: false
    };

    return sequelize.define('ItemRequestDetail', attributes);
};
