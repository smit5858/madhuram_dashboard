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
            validate: { isEmail: true },
        },
        password: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        roleId: {
            type: DataTypes.INTEGER,
            // Nullable: authorize.js treats a missing roleId as unauthorized, so this can never
            // grant access — kept nullable only to avoid an FK constraint edge case.
            allowNull: true,
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
        // Distinct from isActive: isActive is a reversible login toggle (user still shows in
        // the Users table as "Inactive"). deletedAt marks the user as removed from the table
        // (hidden from list/login) while keeping the row so historical records (sells, stock
        // movements, etc.) still resolve the creator's name via the User association.
        deletedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
    },
    {
        tableName: "users",
        timestamps: true, // adds createdAt / updatedAt
        // Named index, not inline unique:true — see role.model.js for why.
        indexes: [{ unique: true, fields: ["email"] }],
    },
);

module.exports = User;
