const User = require("./user.model");
const Role = require("./role.model");
const Route = require("./route.model");
const Permission = require("./permission.model");
const Courier = require("./courier.model");
const Product = require("./product.model");
const Stock = require("./stock.model");
const StockMovement = require("./stockMovement.model");
const Customer = require("./customer.model");
const Sale = require("./sells.model");
const SaleItem = require("./sellsItem.model");
const Notification = require("./notification.model");

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

module.exports = {
  User,
  Role,
  Route,
  Permission,
  Courier,
  Customer,
  Product,
  Stock,
  StockMovement,
  Sale,
  SaleItem,
  Notification,
};