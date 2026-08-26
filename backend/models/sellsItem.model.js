const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const SaleItem = sequelize.define(
  "SaleItem",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    saleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: "sells",
        key: "id",
      },
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
      validate: {
        min: 1,
      },
    },
    sellingPrice: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
    },
    // PENDING              = not yet allocated
    // PARTIALLY_FULFILLED  = some units shipped/delivered, some still allocated/backordered
    // FULFILLED            = all requested units shipped/delivered
    // BACKORDERED          = some/all units awaiting stock, none shipped yet
    // CANCELLED            = line was cancelled before fulfillment
    fulfillmentStatus: {
      type: DataTypes.ENUM("PENDING", "PARTIALLY_FULFILLED", "FULFILLED", "BACKORDERED", "CANCELLED"),
      defaultValue: "PENDING",
    },
    // Deprecated — superseded by allocatedQuantity/fulfilledQuantity/backorderedQuantity below.
    // Kept (not renamed) because Sequelize sync(alter:true) cannot safely rename columns.
    shortageQuantity: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    // Reserved for this order, not yet shipped/delivered
    allocatedQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Actually shipped / license delivered — immutable historical fact, never decremented by returns
    fulfilledQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Requested but no stock exists yet — pending a future receiveStock's FIFO sweep
    backorderedQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    // Informational counter — does not decrement fulfilledQuantity
    returnedQuantity: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
  },
  {
    tableName: "sells_items",
    timestamps: true,
  }
);

module.exports = SaleItem;
