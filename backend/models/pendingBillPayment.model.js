const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// One row per payment made against a Pending Bill account (or a single bill in it) — either the
// full amount at once or a custom/partial amount, any number of times. Rows are append-only: a
// payment is never overwritten, each one stays as its own history record — this table's full row
// history IS the account's payment history, no separate log table required. Every payment gets its
// own linked Expense (AccountEntry, referenceType "pendingBillPayment") created by the same user —
// see pendingBill.service.js#createExpenseForPayment.
//
// New payments are recorded as "Verified" straight away (the Expense they create carries the
// Admin approval step, same as Debited's payments → Income). "Pending Verification"/"Rejected"
// only exist on payments recorded under the old submit-then-verify flow.
const PendingBillPayment = sequelize.define(
  "PendingBillPayment",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    // Set for a payment made against one specific bill (a payment recorded while adding the bill,
    // or a legacy per-bill payment). Null for an account-level payment (the account page's "Pay"),
    // which belongs to `accountKey` instead and is allocated across that account's bills oldest
    // first — see pendingBill.service.js#recalculateAccount.
    pendingBillId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "pending_bills", key: "id" },
    },
    // The Pending Bill account (see helper/pendingBillAccount.js) an account-level payment
    // belongs to. Null for a per-bill payment, which reaches its account through its bill.
    accountKey: { type: DataTypes.STRING, allowNull: true },

    amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    // "Cheque" was retired — see server.js#ensureChequePaymentMethodBackfilled for the one-time
    // data migration.
    paymentMethod: {
      type: DataTypes.ENUM("Cash", "UPI", "Card", "BankTransfer", "Other"),
      allowNull: false,
    },
    paymentDate: { type: DataTypes.DATEONLY, allowNull: false },
    transactionRef: { type: DataTypes.STRING, allowNull: true },
    // Which configured bank account this BankTransfer/UPI payment went through — set via the
    // "Select Bank" field (see PendingBillPaymentFormModal/PendingBillFormModal.tsx), same
    // pattern as Sells/Customer Ledger's bank account picker.
    bankAccountId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "bank_accounts", key: "id" },
    },
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
    indexes: [{ fields: ["pendingBillId"] }, { fields: ["accountKey"] }, { fields: ["status"] }],
    validate: {
      belongsToBillOrAccount() {
        if (this.pendingBillId == null && !this.accountKey) {
          throw new Error("A pending bill payment must belong to a bill or an account");
        }
      },
    },
  }
);

module.exports = PendingBillPayment;
