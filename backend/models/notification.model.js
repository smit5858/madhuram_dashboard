const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Notification = sequelize.define(
  "Notification",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    // Which module should receive this notification
    recipientModule: {
      type: DataTypes.ENUM("couriers", "account", "admin", "all", "leads"),
      allowNull: false,
    },
    // Set for a personal notification targeted at one specific user (e.g. the
    // salesperson whose sale was just delivered); null = module-wide broadcast.
    recipientUserId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "users",
        key: "id",
      },
    },
    type: {
      type: DataTypes.ENUM(
        "NEW_SALE",
        "NEW_CUSTOMER",
        "STOCK_LOW",
        "PAYMENT_RECEIVED",
        "ORDER_FULFILLED",
        "BACKORDER_ALLOCATED",
        "INCOMING_COURIER_COMPLETED",
        "EXPENSE_PENDING_APPROVAL",
        "EXPENSE_APPROVED",
        "EXPENSE_REJECTED",
        // Pending Bill notification types were referenced by pendingBill.controller.js but never
        // added here — every such Notification.create() call was silently throwing inside
        // notify()'s try/catch (see notification.service.js), so Pending Bill notifications did
        // nothing at all. Fixed here alongside the new payment-flow types below.
        //
        // PENDING_BILL_PENDING_APPROVAL fires on bill creation (both a manually-entered general
        // bill and an auto-created restock bill — see pendingBill.model.js#billType and
        // pendingBillService.js#createBillForPurchase, hooked into
        // product.controller.js#createProduct / inventory.service.js#receiveStock).
        // PENDING_BILL_APPROVED fires once a bill becomes fully paid (remainingAmount reaches 0
        // through one or more verified payments) — same meaning as before, just triggered by the
        // last verified payment instead of a single manual "Approve" click.
        "PENDING_BILL_PENDING_APPROVAL",
        "PENDING_BILL_APPROVED",
        // Per-payment lifecycle (full or custom/partial amount, each independently
        // Admin-verified) — see pendingBill.controller.js.
        "PENDING_BILL_PAYMENT_SUBMITTED",
        "PENDING_BILL_PAYMENT_VERIFIED",
        "PENDING_BILL_PAYMENT_REJECTED",
        "PENDING_BILL_PARTIALLY_PAID",
        // Lead Management (lead.controller.js) — fires on creation by a non-Admin (Admin
        // review needed) and on Admin's approve/reject decision (back to the creator).
        "LEAD_APPROVAL_REQUIRED",
        "LEAD_APPROVED",
        "LEAD_REJECTED"
      ),
      allowNull: false,
    },
    title: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    referenceType: {
      type: DataTypes.STRING,
      allowNull: true, // e.g. "sale"
    },
    referenceId: {
      type: DataTypes.INTEGER,
      allowNull: true, // e.g. sale.id
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
  },
  {
    tableName: "notifications",
    timestamps: true,
  }
);

module.exports = Notification;
