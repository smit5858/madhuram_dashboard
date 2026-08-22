const sequelize = require("../config/db");
const {
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
} = require("../models");
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
    await sequelize.query("DROP TABLE IF EXISTS `stocks`;");
    await sequelize.query("DROP TABLE IF EXISTS `products`;");
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
    const accountSalesRoute = await Route.create({ name: "Account Sells", path: "/account/sells" });
    const accountExpenseRoute = await Route.create({ name: "Expense", path: "/account/expense" });
    const accountDebitedRoute = await Route.create({ name: "Debited", path: "/account/debited" });
    console.log("✔ Routes created: Dashboard, Couriers, Customers, Users, Reports, Sells, Account/Sells, Account/Expense, Account/Debited");

    // 3. Create Permissions
    // Admin permissions: Full access on all routes
    const adminRoutes = [
      dashboardRoute,
      couriersRoute,
      customersRoute,
      usersRoute,
      reportsRoute,
      salesRoute,
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

    // User permissions:
    // - Dashboard: Read only
    await Permission.create({
      roleId: userRole.id,
      routeId: dashboardRoute.id,
      canRead: true,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Couriers: Read, Create, Update, but NO Delete
    await Permission.create({
      roleId: userRole.id,
      routeId: couriersRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Customers: Read, Create, Update, but NO Delete (for Sales users)
    await Permission.create({
      roleId: userRole.id,
      routeId: customersRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: false,
    });
    // - Users: No permissions (canRead = false)
    await Permission.create({
      roleId: userRole.id,
      routeId: usersRoute.id,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });
    // - Reports: No permissions (canRead = false)
    await Permission.create({
      roleId: userRole.id,
      routeId: reportsRoute.id,
      canRead: false,
      canCreate: false,
      canUpdate: false,
      canDelete: false,
    });

    // - Sales (top-level): Read, Create, Update, Delete for Sales
    await Permission.create({
      roleId: userRole.id,
      routeId: salesRoute.id,
      canRead: true,
      canCreate: true,
      canUpdate: true,
      canDelete: true,
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

    // 4. Create Users
    const defaultPassword = hashPassword("password123");

    const adminUser = await User.create({
      name: "Admin User",
      email: "admin@madhuram.com",
      password: defaultPassword,
      roleId: adminRole.id,
    });

    const parthUser = await User.create({
      name: "Parth",
      email: "parth@madhuram.com",
      password: defaultPassword,
      roleId: userRole.id,
    });

    const darshilUser = await User.create({
      name: "Darshil",
      email: "darshil@madhuram.com",
      password: defaultPassword,
      roleId: userRole.id,
    });

    const vragUser = await User.create({
      name: "Vrag",
      email: "vrag@madhuram.com",
      password: defaultPassword,
      roleId: userRole.id,
    });
    console.log("✔ Test users created: admin@madhuram.com, parth@madhuram.com, darshil@madhuram.com, vrag@madhuram.com");

    // 5. Create Couriers owned by users
    await Courier.create({
      name: "Parth Express Delivery",
      email: "parth.express@example.com",
      phone: "+91 98765 43210",
      userId: parthUser.id,
    });
    await Courier.create({
      name: "Parth Global Logistics",
      email: "parth.global@example.com",
      phone: "+91 98765 43211",
      userId: parthUser.id,
    });

    await Courier.create({
      name: "Darshil Speed Courier",
      email: "darshil.speed@example.com",
      phone: "+91 99999 88888",
      userId: darshilUser.id,
    });
    await Courier.create({
      name: "Darshil Cargo",
      email: "darshil.cargo@example.com",
      phone: "+91 99999 77777",
      userId: darshilUser.id,
    });

    // 6. Create Sample Products & Initial Stocks
    const productA = await Product.create({
      name: "Engine Oil 15W-40 (1L)",
      description: "Premium synthetic blend engine oil",
    });
    const productB = await Product.create({
      name: "Brake Pads Set (Front)",
      description: "Ceramic brake pads for commercial vehicles",
    });
    const productC = await Product.create({
      name: "Air Filter Standard",
      description: "High-flow OEM replacement air filter",
    });

    await Stock.create({ productId: productA.id, quantity: 10 });
    await Stock.create({ productId: productB.id, quantity: 5 });
    await Stock.create({ productId: productC.id, quantity: 20 });

    await StockMovement.create({
      productId: productA.id,
      type: "PURCHASE",
      quantity: 10,
      referenceType: "manual",
      createdBy: adminUser.id,
      notes: "Opening stock",
    });
    await StockMovement.create({
      productId: productB.id,
      type: "PURCHASE",
      quantity: 5,
      referenceType: "manual",
      createdBy: adminUser.id,
      notes: "Opening stock",
    });
    await StockMovement.create({
      productId: productC.id,
      type: "PURCHASE",
      quantity: 20,
      referenceType: "manual",
      createdBy: adminUser.id,
      notes: "Opening stock",
    });
    console.log("✔ Sample products & initial stocks seeded: Engine Oil (10), Brake Pads (5), Air Filter (20)");

    // 7. Create Sample Customers
    await Customer.create({
      name: "Parth Patel",
      phone: "9876543210",
      email: "parth.patel@example.com",
      address: "XYZ Street, Mavdi Road",
      city: "Rajkot",
      pincode: "360001",
      notes: "Preferred customer, wholesale buyer",
      createdBy: adminUser.id,
    });
    await Customer.create({
      name: "Ramesh Shah",
      phone: "9825012345",
      email: "ramesh.shah@example.com",
      address: "12 Ring Road, Satellite",
      city: "Ahmedabad",
      pincode: "380015",
      notes: "Regular commercial vehicle fleet customer",
      createdBy: adminUser.id,
    });
    await Customer.create({
      name: "Suresh Mehta",
      phone: "9909055443",
      email: "suresh.mehta@example.com",
      address: "Station Road, Varachha",
      city: "Surat",
      pincode: "395003",
      notes: "Retail garage workshop owner",
      createdBy: adminUser.id,
    });
    console.log("✔ Sample customers seeded: Parth Patel (9876543210), Ramesh Shah (9825012345), Suresh Mehta (9909055443)");

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
