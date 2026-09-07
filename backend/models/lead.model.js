const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

// A prospective customer captured by a Sales Employee from a Platform (IndiaMART, WhatsApp,
// etc. — see platform.model.js) against an existing Product. Customer details live directly on
// this row (name/company/phone/address/city) rather than linking the Customer model — a Lead is
// a pre-sale prospect, not yet a customer.
//
// Two independent status fields:
//   - status: operational progress (Pending/Progress/Completed/Incompleted/Not Interested) —
//     set and changed freely by the owning Sales Employee.
//   - approvalStatus: a one-time Admin legitimacy gate, set at creation (auto-APPROVED when an
//     Admin creates the lead, PENDING otherwise) and only ever changed by Admin via
//     approveLead/rejectLead (lead.controller.js). Editing a lead does not reset it.
//
// Follow-ups are fixed at exactly 3 (per spec), so they're flat columns rather than a child
// table — follow-up 1 is required, 2 and 3 are optional.
const Lead = sequelize.define(
  "Lead",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },

    platformId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "platforms", key: "id" },
    },

    customerName: { type: DataTypes.STRING, allowNull: false },
    companyName: { type: DataTypes.STRING, allowNull: true },
    phone: { type: DataTypes.STRING, allowNull: false },
    address: { type: DataTypes.TEXT, allowNull: true },
    city: { type: DataTypes.STRING, allowNull: true },

    productId: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "products", key: "id" },
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false },

    followUp1Date: { type: DataTypes.DATEONLY, allowNull: false },
    followUp1Time: { type: DataTypes.TIME, allowNull: true },
    followUp1Notes: { type: DataTypes.TEXT, allowNull: true },
    followUp1Status: { type: DataTypes.ENUM("PENDING", "DONE"), allowNull: false, defaultValue: "PENDING" },

    followUp2Date: { type: DataTypes.DATEONLY, allowNull: true },
    followUp2Time: { type: DataTypes.TIME, allowNull: true },
    followUp2Notes: { type: DataTypes.TEXT, allowNull: true },
    followUp2Status: { type: DataTypes.ENUM("PENDING", "DONE"), allowNull: false, defaultValue: "PENDING" },

    followUp3Date: { type: DataTypes.DATEONLY, allowNull: true },
    followUp3Time: { type: DataTypes.TIME, allowNull: true },
    followUp3Notes: { type: DataTypes.TEXT, allowNull: true },
    followUp3Status: { type: DataTypes.ENUM("PENDING", "DONE"), allowNull: false, defaultValue: "PENDING" },

    status: {
      type: DataTypes.ENUM("PENDING", "PROGRESS", "COMPLETED", "INCOMPLETED", "NOT_INTERESTED"),
      allowNull: false,
      defaultValue: "PENDING",
    },

    approvalStatus: {
      type: DataTypes.ENUM("PENDING", "APPROVED", "REJECTED"),
      allowNull: false,
      defaultValue: "PENDING",
    },
    approvedBy: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: { model: "users", key: "id" },
    },
    approvedAt: { type: DataTypes.DATE, allowNull: true },
    rejectionReason: { type: DataTypes.STRING, allowNull: true },

    createdBy: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: { model: "users", key: "id" },
    },
  },
  {
    tableName: "leads",
    timestamps: true,
    indexes: [
      { fields: ["status"] },
      { fields: ["approvalStatus"] },
      { fields: ["platformId"] },
      { fields: ["productId"] },
      { fields: ["createdBy"] },
      { fields: ["followUp1Date"] },
    ],
  }
);

module.exports = Lead;
