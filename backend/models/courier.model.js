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
    // Derived by the controller from `status` (status !== "DONE") — kept for
    // backward-compat reads (e.g. the Pending/Completed list split); not
    // meant to be set directly by clients anymore.
    pending: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    // Courier workflow pipeline: Pending -> Waiting for Stock -> In Progress -> Out for Delivery -> Done.
    // Waiting for Stock is a system-driven state (set/cleared by the shipment-group readiness
    // logic in inventory.service.js) — not one a Courier Employee picks manually.
    // CANCELLED is system-set only (when the linked sale/order-item is cancelled — see
    // order.service.js#cancelOrder/cancelOrderItem) — never a manually-pickable status.
    status: {
      type: DataTypes.ENUM("PENDING", "WAITING_FOR_STOCK", "IN_PROGRESS", "OUT_FOR_DELIVERY", "DONE", "CANCELLED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    // Independent classification of how this outgoing shipment is being handled — unrelated
    // to the `status` pipeline above. Nullable/unset until the user picks one on create/edit.
    deliveryMode: {
      type: DataTypes.ENUM("OFFICE_PICKUP", "CHANGE", "PENDING", "FREE"),
      allowNull: true,
    },
    pincode: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // The date the parcel was created/handed to the courier company — distinct from
    // `completedDate` (when it was actually delivered).
    entryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Why the customer sent this in (repair/replacement/inspection/service/other) — Incoming
    // Courier records only; free text, not enforced against a fixed list. Distinct from `note`
    // (general remarks) so the Incoming Courier form/view can show it as its own field.
    reason: {
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
    // Requested quantity for this order line. Set for sale-linked rows created by
    // orderService.createOrder (one row per SaleItem); null for manual entries.
    // How much of it is actually available/shipped is read from the linked SaleItem's
    // allocatedQuantity/fulfilledQuantity, not from this field.
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

    // Groups Courier rows created together for one physical parcel/shipment decision.
    // Deterministic "SALE-{saleId}" at sale creation; a shipment-type split produces new
    // suffixed values (e.g. "SALE-{saleId}-A"/"-B"). Null for manual (non-sale) entries.
    shipmentGroupId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Replicated across every row sharing a shipmentGroupId. SHIP_COMPLETE = wait for every
    // product in the group before any of it can move past Waiting for Stock. SHIP_AVAILABLE =
    // this group only ever contains already-fully-allocated rows (see updateShipmentType).
    shipmentType: {
      type: DataTypes.ENUM("SHIP_COMPLETE", "SHIP_AVAILABLE"),
      allowNull: true,
    },

    // Traceability link between an Incoming courier record and the Outgoing courier record
    // auto-created for it when marked Done (see courier.controller.js#completeIncomingCourier).
    // Set on the IN row to point at the new OUT row; null for every other record.
    linkedCourierId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "couriers",
        key: "id",
      },
    },

    // Snapshot of product availability at the moment this courier record was created — never
    // recomputed from current inventory, so a later stock replenishment doesn't silently rewrite
    // history (see orderService.createOrder, which derives this from the same allocated/requested
    // comparison used for `status`). Null for manually-created entries (no product/stock linkage
    // to check against) and for legacy rows created before this field existed.
    productStockStatus: {
      type: DataTypes.ENUM("IN_STOCK", "OUT_OF_STOCK"),
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    tableName: "couriers",
    timestamps: true,
  }
);

module.exports = Courier;
