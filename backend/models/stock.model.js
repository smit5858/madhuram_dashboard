const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Stock = sequelize.define(
  "Stock",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "products",
        key: "id",
      },
    },
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: {
        min: 0,
      },
    },
  },
  {
    tableName: "stocks",
    timestamps: true,
    indexes: [
      {
        unique: true,
        fields: ["productId"],
      },
    ],
  }
);

module.exports = Stock;
