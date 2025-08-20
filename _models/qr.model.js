const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    qrId:         { type: DataTypes.INTEGER,  primaryKey: true, autoIncrement: true }, 
    itemType:     { type: DataTypes.STRING,   allowNull: false },
    batchId:      { type: DataTypes.INTEGER,  allowNull: true },
    unitId:       { type: DataTypes.INTEGER,  allowNull: true },
    qrFilePath:   { type: DataTypes.TEXT,     allowNull: false },
    qrCodePath:   { type: DataTypes.STRING,   allowNull: true },
    createdAt:    { type: DataTypes.DATE,     defaultValue: DataTypes.NOW }
  };

  const options = {
    timestamps: false
  };

  return sequelize.define('Qr', attributes, options);
};
