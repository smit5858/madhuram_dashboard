const User = require("./user.model");
const Role = require("./role.model");
const Route = require("./route.model");
const Permission = require("./permission.model");
const Courier = require("./courier.model");
const CourierCompany = require("./courierCompany.model");
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

// Role associations
Role.hasMany(User, { foreignKey: "roleId" });
User.belongsTo(Role, { foreignKey: "roleId" });

Role.hasMany(Permission, { foreignKey: "roleId" });
Permission.belongsTo(Role, { foreignKey: "roleId" });

// Route associations
Route.hasMany(Permission, { foreignKey: "routeId" });
Permission.belongsTo(Route, { foreignKey: "routeId" });

// Courier associations
User.hasMany(Courier, { foreignKey: "userId" });
Courier.belongsTo(User, { foreignKey: "userId" });

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

module.exports = {
  User,
  Role,
  Route,
  Permission,
  Courier,
  CourierCompany,
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
};