const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const User = sequelize.define(
    "User",
    {
        id: {
            type: DataTypes.INTEGER,
            primaryKey: true,
            autoIncrement: true,
        },
        name: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        email: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
            validate: { isEmail: true },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        roleId: {
            type: DataTypes.INTEGER,
            allowNull: false,
            references: {
                model: "roles",
                key: "id",
            },
        },
        isActive: {
            type: DataTypes.BOOLEAN,
            defaultValue: true,
        },
        allowedCity: {
            type: DataTypes.STRING,
            allowNull: true, // null = no city restriction (Admin overrides via role check)
        },
        tokenInvalidatedAt: {
          type: DataTypes.DATE,
          allowNull: true, 
        },
        refreshToken: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
    },
    {
        tableName: "users",
        timestamps: true, // adds createdAt / updatedAt
    },
);

module.exports = User;
