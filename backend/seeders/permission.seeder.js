const sequelize = require("../config/db");
const { User, Role, Route, Permission } = require("../models");
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
    const reportsRoute = await Route.create({ name: "Reports", path: "/reports" });
    const salesRoute = await Route.create({ name: "Sells", path: "/sells" });
    const productsRoute = await Route.create({ name: "Products", path: "/products" });
    const stockRoute = await Route.create({ name: "Stock", path: "/stock" });
    const inventoryRoute = await Route.create({ name: "Inventory", path: "/inventory" });
    const dealersRoute = await Route.create({ name: "Dealers", path: "/dealers" });
    const accountRoute = await Route.create({ name: "Account", path: "/account" });
    const accountSalesRoute = await Route.create({ name: "Account Sells", path: "/account/sells" });
    const accountExpenseRoute = await Route.create({ name: "Expense", path: "/account/expense" });
    const accountDebitedRoute = await Route.create({ name: "Debited", path: "/account/debited" });
    console.log("✔ Routes created: Dashboard, Couriers, Customers, Products, Stock, Users, Reports, Sells, Account, Account/Sells, Account/Expense, Account/Debited");

    // 3. Create Permissions
    // Admin permissions: Full access on all routes
    const adminRoutes = [
      dashboardRoute,
      couriersRoute,
      customersRoute,
      productsRoute,
      stockRoute,
      inventoryRoute,
      dealersRoute,
      usersRoute,
      reportsRoute,
      salesRoute,
      accountRoute,
      accountSalesRoute,
      accountExpenseRoute,
      accountDebitedRoute,
    ];
    for (const route of adminRoutes) {
      await Permission.create({
        roleId: adminRole.id,
        routeId: route.id,
        canRead: true,
        canCreate: true,
        canUpdate: true,
        canDelete: true,
      });
    }

    // User permissions (Sales role):
    // - Dashboard: Read only
    await Permission.create({
      roleId: userRole.id,
      routeId: dashboardRoute.id,
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Couriers: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: couriersRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Customers: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: customersRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Products: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: productsRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Stock: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: stockRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Inventory: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: inventoryRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Dealers: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: dealersRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Sells: Read, Create, Update, NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: salesRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Account Parent Route: Read only
    await Permission.create({
      roleId: userRole.id,
      routeId: accountRoute.id,
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Account / Sales: Read only
    await Permission.create({
      roleId: userRole.id,
      routeId: accountSalesRoute.id,
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Users: Read only (view list/details, no create/update/delete)
    await Permission.create({
      roleId: userRole.id,
      routeId: usersRoute.id,
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Reports: No permissions
    await Permission.create({
      roleId: userRole.id,
      routeId: reportsRoute.id,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Account / Expense: No permissions
    await Permission.create({
      roleId: userRole.id,
      routeId: accountExpenseRoute.id,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Account / Debited: No permissions
    await Permission.create({
      roleId: userRole.id,
      routeId: accountDebitedRoute.id,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    console.log("✔ Permissions created");

    // 4. Create the single Admin user
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
