const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const attributes = {
    theme:       { type: DataTypes.STRING, allowNull: false },
    notifications:{ type: DataTypes.BOOLEAN, allowNull: false },
    language:    { type: DataTypes.STRING, allowNull: false },
  };
  return sequelize.define('Preferences', attributes, { timestamps: false });
};