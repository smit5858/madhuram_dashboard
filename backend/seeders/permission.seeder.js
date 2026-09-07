const sequelize = require("../config/db");
const { User, Role, Route } = require("../models");
const { hashPassword } = require("../helper/common");

const runSeeder = async () => {
  try {
    console.log("Starting database seeding...");

    // Disable foreign key checks to safely drop tables with dependencies
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0;");

    // Drop all possible tables (including obsolete ones)
    await sequelize.query("DROP TABLE IF EXISTS `notifications`;");
    await sequelize.query("DROP TABLE IF EXISTS `sells_items`;");
    await sequelize.query("DROP TABLE IF EXISTS `sells`;");
    await sequelize.query("DROP TABLE IF EXISTS `customers`;");
    await sequelize.query("DROP TABLE IF EXISTS `stock_movements`;");
    await sequelize.query("DROP TABLE IF EXISTS `serial_units`;");
    await sequelize.query("DROP TABLE IF EXISTS `stocks`;");
    await sequelize.query("DROP TABLE IF EXISTS `products`;");
    await sequelize.query("DROP TABLE IF EXISTS `dealers`;");
    await sequelize.query("DROP TABLE IF EXISTS `permissions`;");
    await sequelize.query("DROP TABLE IF EXISTS `user_permissions`;");
    await sequelize.query("DROP TABLE IF EXISTS `couriers`;");
    await sequelize.query("DROP TABLE IF EXISTS `users`;");
    await sequelize.query("DROP TABLE IF EXISTS `routes`;");
    await sequelize.query("DROP TABLE IF EXISTS `roles`;");

    // Re-enable foreign key checks
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 1;");

    // Sync models to make sure schema is up to date (dropping and recreating tables cleanly)
    await sequelize.sync({ force: true });

    console.log("✔ Database schema recreated");

    // 1. Create Roles
    const adminRole = await Role.create({ name: "Admin" });
    const userRole = await Role.create({ name: "User" });
    console.log("✔ Roles created: Admin, User");

    // 2. Create Routes
    const dashboardRoute = await Route.create({ name: "Dashboard", path: "/dashboard" });
    const couriersRoute = await Route.create({ name: "Couriers", path: "/couriers" });
    const customersRoute = await Route.create({ name: "Customers", path: "/customers" });
    const usersRoute = await Route.create({ name: "Users", path: "/users" });
    const salesRoute = await Route.create({ name: "Sells", path: "/sells" });
    const productsRoute = await Route.create({ name: "Products", path: "/products" });
    const accountRoute = await Route.create({ name: "Account", path: "/account" });
    const accountIncomeRoute = await Route.create({ name: "Account Income", path: "/account/income", module: "Account" });
    const accountExpenseRoute = await Route.create({ name: "Expense", path: "/account/expense", module: "Account" });
    const accountDebitedRoute = await Route.create({ name: "Debited", path: "/account/debited", module: "Account" });
    const accountBankAccountsRoute = await Route.create({ name: "Bank Accounts", path: "/account/bank-accounts", module: "Account" });
    console.log("✔ Routes created: Dashboard, Couriers, Customers, Products, Users, Sells, Account, Account/Income, Account/Expense, Account/Debited, Account/Bank Accounts");

    // Access is granted per-user only (Settings → Route Setting), not per-role — Admin always
    // has full access via the hard-coded bypass in authorize.js, so there is nothing to seed
    // here for the "User" role. Any non-Admin user created after seeding starts with zero
    // access until an Admin explicitly grants routes via Route Setting.

    // 3. Create the single Admin user
    const adminUser = await User.create({
      name: "Admin User",
      email: "admin@madhuram.com",
      password: hashPassword("admin123"),
      roleId: adminRole.id,
    });
    console.log("✔ Admin user created: admin@madhuram.com");

    console.log("Seeding complete! Database is ready.");
    process.exit(0);
  } catch (error) {
    console.error("Seeding failed:", error);
    process.exit(1);
  }
};

// Check if run directly
if (require.main === module) {
  runSeeder();
}

module.exports = runSeeder;
