const sequelize = require("../config/db");
const { User, Role, Route, Permission, Courier } = require("../models");
const { hashPassword } = require("../helper/common");

const runSeeder = async () => {
  try {
    console.log("Starting database seeding...");

    // Disable foreign key checks to safely drop tables with dependencies
    await sequelize.query("SET FOREIGN_KEY_CHECKS = 0;");

    // Drop all possible tables (including obsolete ones)
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
    const usersRoute = await Route.create({ name: "Users", path: "/users" });
    const reportsRoute = await Route.create({ name: "Reports", path: "/reports" });
    console.log("✔ Routes created: Dashboard, Couriers, Users, Reports");

    // 3. Create Permissions
    // Admin permissions: Full access on all routes
    const adminRoutes = [dashboardRoute, couriersRoute, usersRoute, reportsRoute];
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

    await Courier.create({
      name: "Vrag Swift Post",
      email: "vrag.swift@example.com",
      phone: "+91 88888 77777",
      userId: vragUser.id,
    });
    console.log("✔ Test courier records seeded successfully linked to owners");

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
