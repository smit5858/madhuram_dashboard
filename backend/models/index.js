const User = require("./user.model");
const Role = require("./role.model");
const Route = require("./route.model");
const UserPermission = require("./userPermission.model");
const Courier = require("./courier.model");
const CourierCompany = require("./courierCompany.model");
const CourierCharge = require("./courierCharge.model");
const Product = require("./product.model");
const Stock = require("./stock.model");
const StockMovement = require("./stockMovement.model");
const Customer = require("./customer.model");
const Sale = require("./sells.model");
const SaleItem = require("./sellsItem.model");
const Notification = require("./notification.model");
const SerialUnit = require("./serialUnit.model");
const Dealer = require("./dealer.model");
const Payment = require("./payment.model");
const AccountEntry = require("./accountEntry.model");
const DailyAccountBalance = require("./dailyBalance.model");
const BankAccount = require("./bankAccount.model");
const CustomerLedgerEntry = require("./customerLedgerEntry.model");
const PendingBill = require("./pendingBill.model");
const PendingBillPayment = require("./pendingBillPayment.model");
const Platform = require("./platform.model");
const Lead = require("./lead.model");

// Role associations
Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

// Per-user permissions (Settings → Route Setting) — the sole source of route-level access
// for non-Admin users. Absence of a row means no access — see authorize.js and
// permission.controller.js.
User.hasMany(UserPermission, { foreignKey: "userId" });
UserPermission.belongsTo(User, { foreignKey: "userId" });

Route.hasMany(UserPermission, { foreignKey: "routeId" });
UserPermission.belongsTo(Route, { foreignKey: "routeId" });

// Courier associations
User.hasMany(Courier, { foreignKey: "userId" });
Courier.belongsTo(User, { foreignKey: "userId" });

// Self-referencing link from an Incoming courier row to the Outgoing courier row auto-created
// for it when marked Done (see courier.controller.js#completeIncomingCourier).
Courier.belongsTo(Courier, { foreignKey: "linkedCourierId", as: "linkedCourier" });

// Customer associations
Customer.hasMany(Sale, { foreignKey: "customerId", as: "sales" });
Sale.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

User.hasMany(Customer, { foreignKey: "createdBy" });
Customer.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

// Product ↔ Stock (one-to-one: each product has one stock record)
Product.hasOne(Stock, { foreignKey: "productId" });
Stock.belongsTo(Product, { foreignKey: "productId" });

// Product ↔ StockMovement (one-to-many: audit trail)
Product.hasMany(StockMovement, { foreignKey: "productId" });
StockMovement.belongsTo(Product, { foreignKey: "productId" });

// User ↔ StockMovement (who made the adjustment)
User.hasMany(StockMovement, { foreignKey: "createdBy" });
StockMovement.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

// Product ↔ SaleItem
Product.hasMany(SaleItem, { foreignKey: "productId" });
SaleItem.belongsTo(Product, { foreignKey: "productId" });

// Sale ↔ SaleItem (one-to-many)
Sale.hasMany(SaleItem, { foreignKey: "saleId", as: "items" });
SaleItem.belongsTo(Sale, { foreignKey: "saleId" });

// User ↔ Sale (who created the sale)
User.hasMany(Sale, { foreignKey: "createdBy" });
Sale.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

// Product ↔ SerialUnit (one-to-many: individual tracked units of a SERIALIZED product)
Product.hasMany(SerialUnit, { foreignKey: "productId" });
SerialUnit.belongsTo(Product, { foreignKey: "productId" });

// Dealer ↔ Stock/StockMovement/SerialUnit (who we bought inventory from)
Dealer.hasMany(Stock, { foreignKey: "dealerId" });
Stock.belongsTo(Dealer, { foreignKey: "dealerId" });

Dealer.hasMany(StockMovement, { foreignKey: "dealerId" });
StockMovement.belongsTo(Dealer, { foreignKey: "dealerId" });

Dealer.hasMany(SerialUnit, { foreignKey: "dealerId" });
SerialUnit.belongsTo(Dealer, { foreignKey: "dealerId" });

// SaleItem ↔ SerialUnit (which specific units were reserved/sold for this order line)
SaleItem.hasMany(SerialUnit, { foreignKey: "saleItemId" });
SerialUnit.belongsTo(SaleItem, { foreignKey: "saleItemId" });

// Sale/SaleItem ↔ Courier (courier record auto-created on physical fulfillment)
Sale.hasMany(Courier, { foreignKey: "saleId" });
Courier.belongsTo(Sale, { foreignKey: "saleId" });
SaleItem.hasMany(Courier, { foreignKey: "saleItemId" });
Courier.belongsTo(SaleItem, { foreignKey: "saleItemId" });

// Sale ↔ Payment (itemized payment history)
Sale.hasMany(Payment, { foreignKey: "saleId", as: "payments" });
Payment.belongsTo(Sale, { foreignKey: "saleId" });
User.hasMany(Payment, { foreignKey: "createdBy" });
Payment.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

// User ↔ Notification (personal, per-user notifications)
User.hasMany(Notification, { foreignKey: "recipientUserId" });
Notification.belongsTo(User, { foreignKey: "recipientUserId", as: "recipient" });

// Courier ↔ AccountEntry (the Accounts/Expense entry auto-created when an Incoming courier is
// marked Done) + User ↔ AccountEntry (who triggered it)
Courier.hasOne(AccountEntry, { foreignKey: "courierId" });
AccountEntry.belongsTo(Courier, { foreignKey: "courierId" });
User.hasMany(AccountEntry, { foreignKey: "createdBy" });
AccountEntry.belongsTo(User, { foreignKey: "createdBy", as: "creator" });

// Customer ↔ AccountEntry (Income entries may optionally reference a real customer)
Customer.hasMany(AccountEntry, { foreignKey: "customerId" });
AccountEntry.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });

// BankAccount ↔ Sale/Payment (which configured bank account a BankTransfer sale/payment used)
BankAccount.hasMany(Sale, { foreignKey: "bankAccountId" });
Sale.belongsTo(BankAccount, { foreignKey: "bankAccountId", as: "bankAccount" });
BankAccount.hasMany(Payment, { foreignKey: "bankAccountId" });
Payment.belongsTo(BankAccount, { foreignKey: "bankAccountId", as: "bankAccount" });

// Customer ↔ CustomerLedgerEntry (the running account ledger) + Sale (traceability only, not
// used for balance calc) + User (createdBy) + BankAccount (BankTransfer entries)
Customer.hasMany(CustomerLedgerEntry, { foreignKey: "customerId", as: "ledgerEntries" });
CustomerLedgerEntry.belongsTo(Customer, { foreignKey: "customerId", as: "customer" });
Sale.hasMany(CustomerLedgerEntry, { foreignKey: "saleId", as: "ledgerEntries" });
CustomerLedgerEntry.belongsTo(Sale, { foreignKey: "saleId", as: "sale" });
User.hasMany(CustomerLedgerEntry, { foreignKey: "createdBy" });
CustomerLedgerEntry.belongsTo(User, { foreignKey: "createdBy", as: "creator" });
BankAccount.hasMany(CustomerLedgerEntry, { foreignKey: "bankAccountId" });
CustomerLedgerEntry.belongsTo(BankAccount, { foreignKey: "bankAccountId", as: "bankAccount" });

// Pending Bill ↔ User (who created it, who it became fully-paid/approved under) + Product/Dealer/
// StockMovement (restock-type bills only — see pendingBill.model.js#billType) + PendingBillPayment
// (one-to-many payment history, each independently verified — see pendingBill.controller.js)
User.hasMany(PendingBill, { foreignKey: "createdBy" });
PendingBill.belongsTo(User, { foreignKey: "createdBy", as: "creator" });
PendingBill.belongsTo(User, { foreignKey: "approvedBy", as: "approver" });

Product.hasMany(PendingBill, { foreignKey: "productId" });
PendingBill.belongsTo(Product, { foreignKey: "productId" });

Dealer.hasMany(PendingBill, { foreignKey: "dealerId" });
PendingBill.belongsTo(Dealer, { foreignKey: "dealerId", as: "dealer" });

StockMovement.hasOne(PendingBill, { foreignKey: "stockMovementId" });
PendingBill.belongsTo(StockMovement, { foreignKey: "stockMovementId", as: "stockMovement" });

PendingBill.hasMany(PendingBillPayment, { foreignKey: "pendingBillId", as: "payments" });
PendingBillPayment.belongsTo(PendingBill, { foreignKey: "pendingBillId" });

User.hasMany(PendingBillPayment, { foreignKey: "createdBy" });
PendingBillPayment.belongsTo(User, { foreignKey: "createdBy", as: "creator" });
User.hasMany(PendingBillPayment, { foreignKey: "verifiedBy" });
PendingBillPayment.belongsTo(User, { foreignKey: "verifiedBy", as: "verifier" });

// Lead ↔ User (the owning Sales Employee who created it + the Admin who approved/rejected it) +
// Platform (lead source) + Product (what they're interested in) — see lead.model.js.
User.hasMany(Lead, { foreignKey: "createdBy" });
Lead.belongsTo(User, { foreignKey: "createdBy", as: "salesEmployee" });
Lead.belongsTo(User, { foreignKey: "approvedBy", as: "approver" });

Platform.hasMany(Lead, { foreignKey: "platformId" });
Lead.belongsTo(Platform, { foreignKey: "platformId", as: "platform" });

Product.hasMany(Lead, { foreignKey: "productId" });
Lead.belongsTo(Product, { foreignKey: "productId", as: "product" });

module.exports = {
  User,
  Role,
  Route,
  UserPermission,
  Courier,
  CourierCompany,
  CourierCharge,
  Customer,
  Product,
  Stock,
  StockMovement,
  Sale,
  SaleItem,
  Notification,
  SerialUnit,
  Dealer,
  Payment,
  AccountEntry,
  DailyAccountBalance,
  BankAccount,
  CustomerLedgerEntry,
  PendingBill,
  PendingBillPayment,
  Platform,
  Lead,
};