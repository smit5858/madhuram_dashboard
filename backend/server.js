const http = require("http");
const express = require("express");
const morgan = require("morgan");
const cors = require("cors");
const chalk = require("chalk");
const logger = require("./helper/logger");
const auth = require("./routes/auth.routes");
require("dotenv").config();

const sequelize = require("./config/db");
const { init: initSocket } = require("./socket");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev", { stream: { write: (msg) => logger.info(msg.trim()) } }));

const permissions = require("./routes/permission.routes");
const couriers = require("./routes/courier.routes");
const customers = require("./routes/customer.routes");
const sells = require("./routes/sells.routes");
const products = require("./routes/product.routes");
const stocks = require("./routes/stock.routes");
const notifications = require("./routes/notification.routes");

app.get("/", (req, res) => res.send("API running"));
app.use("/auth", auth);
app.use("/permissions", permissions);
app.use("/couriers", couriers);
app.use("/customers", customers);
app.use("/sells", sells);
// Keep the old API path working for existing clients.
app.use("/sales", sells);
app.use("/products", products);
app.use("/stock", stocks);
app.use("/notifications", notifications);


const PORT = process.env.PORT || 3000;

const { Route, Role, Permission } = require("./models");

// Wrap Express in an http.Server so Socket.io can attach
const httpServer = http.createServer(app);

const ensureCustomerRoute = async () => {
  try {
    let [customersRoute] = await Route.findOrCreate({
      where: { path: "/customers" },
      defaults: { name: "Customers", path: "/customers" },
    });

    const roles = await Role.findAll();
    for (const role of roles) {
      const existingPerm = await Permission.findOne({
        where: { roleId: role.id, routeId: customersRoute.id },
      });
      if (!existingPerm) {
        const isAdmin = role.name === "Admin";
        await Permission.create({
          roleId: role.id,
          routeId: customersRoute.id,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: isAdmin,
        });
      }
    }
  } catch (e) {
    console.warn("Could not ensure customer route permissions:", e.message);
  }
};

const renameSalesRoutes = async () => {
  const routeRenames = [
    { oldPath: "/sales", newPath: "/sells", name: "Sells" },
    { oldPath: "/account/sales", newPath: "/account/sells", name: "Account Sells" },
  ];

  for (const { oldPath, newPath, name } of routeRenames) {
    const oldRoute = await Route.findOne({ where: { path: oldPath } });
    if (!oldRoute) continue;

    const newRoute = await Route.findOne({ where: { path: newPath } });
    if (!newRoute) {
      await oldRoute.update({ name, path: newPath });
      continue;
    }

    const oldPermissions = await Permission.findAll({ where: { routeId: oldRoute.id } });
    for (const oldPermission of oldPermissions) {
      const [permission, created] = await Permission.findOrCreate({
        where: { roleId: oldPermission.roleId, routeId: newRoute.id },
        defaults: {
          canRead: oldPermission.canRead,
          canCreate: oldPermission.canCreate,
          canUpdate: oldPermission.canUpdate,
          canDelete: oldPermission.canDelete,
        },
      });
      if (!created) {
        await permission.update({
          canRead: permission.canRead || oldPermission.canRead,
          canCreate: permission.canCreate || oldPermission.canCreate,
          canUpdate: permission.canUpdate || oldPermission.canUpdate,
          canDelete: permission.canDelete || oldPermission.canDelete,
        });
      }
    }
    await Permission.destroy({ where: { routeId: oldRoute.id } });
    await oldRoute.destroy();
    await newRoute.update({ name });
  }
};

const renameSalesTables = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));

  if (tableNames.includes("sales") && !tableNames.includes("sells")) {
    await queryInterface.renameTable("sales", "sells");
  }
  if (tableNames.includes("sale_items") && !tableNames.includes("sells_items")) {
    await queryInterface.renameTable("sale_items", "sells_items");
  }
};

sequelize
  .authenticate()
  .then(() => {
    console.log(chalk.green("✔ DB connected"));
    logger.info("DB connected");
    return renameSalesTables();
  })
  .then(() => {
    return sequelize.sync({ alter: true });
  })
  .then(async () => {
    logger.info("Models synced");
    await renameSalesRoutes();
    await ensureCustomerRoute();

    // Initialize Socket.io after DB is ready
    initSocket(httpServer);
    logger.info("Socket.io initialized");

    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
      console.log(chalk.cyan(`🚀 Server running on port ${PORT}`));
    });
  })
  .catch((err) => {
    logger.error(`DB connection failed: ${err && err.stack ? err.stack : err}`);
    console.log(chalk.red("✘ DB connection failed:"), err && err.stack ? err.stack : err);
  });