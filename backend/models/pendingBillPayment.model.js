const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per payment installment submitted by the team against a PendingBill — either the full
// amount at once or a custom/partial amount, any number of times. Rows are append-only/immutable
// once acted on by Admin: a rejected payment is never edited/resubmitted, a new row is submitted
// instead — this table's full row history IS the "payment history"/audit trail a bill needs, no
// separate log table required.
const PendingBillPayment = sequelize.define(
  "PendingBillPayment",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    pendingBillId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "pending_bills", key: "id" },
    },

    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    paymentMethod: {
      type: DataTypes.ENUM("Cash", "UPI", "Card", "BankTransfer", "Cheque", "Other"),
      allowNull: false,
    },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false },
    transactionRef: { type: DataTypes.STRING, allowNull: true },
    notes: { type: DataTypes.TEXT, allowNull: true },

    // Pending Verification -> Verified | Rejected. Only "Verified" payments count toward a
    // bill's paidAmount (see pendingBillService.js#recalculateStatus).
    status: {
      type: DataTypes.ENUM("Pending Verification", "Verified", "Rejected"),
      allowNull: false,
      defaultValue: "Pending Verification",
    },

    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    verifiedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    verifiedAt: { type: DataTypes.DATE, allowNull: true },
    // Required when status becomes Rejected.
    rejectionReason: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: "pending_bill_payments",
    timestamps: true,
    indexes: [{ fields: ["pendingBillId"] }, { fields: ["status"] }],
  }
);

module.exports = PendingBillPayment;
