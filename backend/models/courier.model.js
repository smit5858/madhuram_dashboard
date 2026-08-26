const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Courier = sequelize.define(
  "Courier",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Legacy fields — kept for backward compatibility
    name: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    // --- Required fields as per spec ---
    customerName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    address: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    city: {
      type: DataTypes.STRING,
      allowNull: true, // city of the courier pickup — used for location scoping
    },
    mobileNo: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    productName: {
      type: DataTypes.STRING,
      allowNull: true, // used for the Product Name filter
    },
    charge: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    freePickup: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    courierName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    trackId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    kg: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: true,
    },
    pending: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    completedDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    // Foreign key to the owning user
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
    },

    // Link back to the order this courier record was auto-created for
    // (nullable: manually-created courier entries have no linked sale)
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "sells",
        key: "id",
      },
    },
    saleItemId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "sells_items",
        key: "id",
      },
    },
    // Units covered by this courier record. Set for sale-linked rows created by
    // orderService.fulfillOrderItem (one row per shipment batch); null for manual entries.
    quantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    // OUT = we ship to the customer (outbound; auto-created on order fulfillment).
    // IN = a customer or vendor ships something to us (inbound; manual entries only).
    direction: {
      type: DataTypes.ENUM("IN", "OUT"),
      allowNull: false,
      defaultValue: "OUT",
    },
  },
  {
    tableName: "couriers",
    timestamps: true,
  }
);

module.exports = Courier;
