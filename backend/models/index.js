const User = require("./user.model");
const Role = require("./role.model");
const Route = require("./route.model");
const Permission = require("./permission.model");
const Courier = require("./courier.model");

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

module.exports = { User, Role, Route, Permission, Courier };