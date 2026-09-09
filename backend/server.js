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
// This is a JSON API, not a static file server — responses must never be cached or
// conditionally revalidated (e.g. a create/update request coming back as 304).
app.set("etag", false);
app.use((req, res, next) => {
  res.set("Cache-Control", "no-store");
  next();
});
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev", { stream: { write: (msg) => logger.info(msg.trim()) } }));

const permissions = require("./routes/permission.routes");
const couriers = require("./routes/courier.routes");
const courierCompanies = require("./routes/courierCompany.routes");
const customers = require("./routes/customer.routes");
const sells = require("./routes/sells.routes");
const products = require("./routes/product.routes");
const stocks = require("./routes/stock.routes");
const inventory = require("./routes/inventory.routes");
const dealers = require("./routes/dealer.routes");
const notifications = require("./routes/notification.routes");
const users = require("./routes/user.routes");
const income = require("./routes/income.routes");
const expense = require("./routes/expense.routes");
const pendingBills = require("./routes/pendingBill.routes");
const bankAccounts = require("./routes/bankAccount.routes");
const routeSettings = require("./routes/routeSetting.routes");
const roles = require("./routes/role.routes");
const leads = require("./routes/lead.routes");
const platforms = require("./routes/platform.routes");

app.get("/", (req, res) => res.send("API running"));
app.use("/auth", auth);
app.use("/permissions", permissions);
app.use("/couriers", couriers);
app.use("/couriers-companies", courierCompanies);
app.use("/customers", customers);
app.use("/sells", sells);
// Keep the old API path working for existing clients.
app.use("/sales", sells);
app.use("/products", products);
app.use("/stock", stocks);
app.use("/inventory", inventory);
app.use("/dealers", dealers);
app.use("/notifications", notifications);
app.use("/users", users);
app.use("/income", income);
app.use("/expense", expense);
app.use("/pending-bills", pendingBills);
app.use("/account/bank-accounts", bankAccounts);
app.use("/route-settings", routeSettings);
app.use("/roles", roles);
app.use("/leads", leads);
app.use("/platforms", platforms);


const PORT = process.env.PORT || 3000;

const { Route, Role, UserPermission } = require("./models");

// Wrap Express in an http.Server so Socket.io can attach
const httpServer = http.createServer(app);

// Every path below used to be a live system route (see ensureAllRoutesAndPermissions) that was
// later renamed/removed. Route.findOrCreate matches on path, so renaming a route's path — even
// though its name/feature stayed the same — left the old row behind instead of updating it,
// producing a second "Route/Module" entry for the same feature in the Route Setting permission
// matrix (e.g. "Pending Bills" -> "Pending Bill", a stray "Account" at "/account/account").
// Shared by ensureNoStaleRoutesBeforeSync (pre-sync, raw SQL) and pruneObsoleteRoutes (post-sync,
// model-based) so both stay in sync with a single list.
const STALE_ROUTE_PATHS = [
  "/reports",
  "/stock",
  "/inventory",
  "/dealers",
  "/account/restock-bill",
  "/account/account",
  "/account/credit",
  "/account/pending-bills",
  "/setting",
];

const ensureAllRoles = async () => {
  // Additive only — never removes/renames existing roles, so this is safe to run against a
  // live DB with existing Admin/User accounts.
  await Role.findOrCreate({ where: { name: "Courier" } });
  await Role.findOrCreate({ where: { name: "Account" } });
  await Role.findOrCreate({ where: { name: "Sales Employee" } });
};

// Ensures every system route row exists (renaming it if its display name changed). Access to
// these routes is granted entirely per-user via Settings → Route Setting — there is no
// role-based default to seed here; a newly created user starts with no access to anything
// until an Admin explicitly grants it.
const ensureAllRoutesAndPermissions = async () => {
  try {
    const SYSTEM_ROUTES = [
      { name: "Dashboard", path: "/dashboard" },
      // Outgoing Courier keeps the original "/couriers" path so every existing UserPermission
      // row carries over unchanged (find-or-create below matches on path, not name) — see
      // backfillIncomingCourierPermissions for how Incoming Courier gets seeded from it.
      // module: "Courier" groups Outgoing/Incoming/Companies under one parent header in the
      // Route Setting permission matrix (see PermissionGrid.tsx) — purely presentational, there
      // is no separate "Courier" parent Route/permission row.
      { name: "Outgoing Courier", path: "/couriers", module: "Courier" },
      { name: "Incoming Courier", path: "/couriers/incoming", module: "Courier" },
      { name: "Courier Companies", path: "/couriers-companies", module: "Courier" },
      { name: "Customers", path: "/customers" },
      { name: "Sells", path: "/sells" },
      { name: "Products", path: "/products" },
      { name: "Users", path: "/users" },
      { name: "Account", path: "/account" },
      { name: "Account Income", path: "/account/income", module: "Account" },
      { name: "Expense", path: "/account/expense", module: "Account" },
      // Pending Bill now covers both manually-entered general bills and auto-created product
      // restock/new-product bills (billType field — see pendingBill.model.js) — there is no
      // separate Restock Bill route/page any more.
      { name: "Pending Bill", path: "/account/pending-bill", module: "Account" },
      { name: "Debited", path: "/account/debited", module: "Account" },
      { name: "Bank Accounts", path: "/account/bank-accounts", module: "Account" },
      { name: "Route Setting", path: "/setting/route-setting", module: "Setting" },
      { name: "Role Management", path: "/setting/role-management", module: "Setting" },
      { name: "Leads", path: "/leads" },
      { name: "Platforms", path: "/settings/platforms", module: "Setting" },
    ];

    for (const rDef of SYSTEM_ROUTES) {
      const moduleValue = rDef.module || null;

      let route = await Route.findOne({ where: { path: rDef.path } });
      if (!route) {
        // No row at this path — before inserting a new one, check whether this system route's
        // path just changed (name unchanged). Reusing the existing row instead of creating a
        // second one is what keeps a path rename from leaving a duplicate Route/Module entry
        // behind (see STALE_ROUTE_PATHS above for the ones that already got left behind this way).
        route = await Route.findOne({ where: { name: rDef.name } });
      }

      if (!route) {
        await Route.create({ ...rDef, module: moduleValue });
        continue;
      }

      if (route.name !== rDef.name || route.path !== rDef.path || route.module !== moduleValue) {
        await route.update({ name: rDef.name, path: rDef.path, module: moduleValue });
      }
    }
  } catch (e) {
    console.warn("Could not ensure routes:", e.message);
  }
};

// Reports/Stock/Inventory/Dealers never had a page of their own and are no longer checked by any
// authorize() call (Inventory/Dealers now ride on the "/products" permission — see
// inventory.routes.js / dealer.routes.js), so they were pure dead entries cluttering the Route
// Setting permission grid. One-time cleanup: delete their UserPermission rows first (routeId is
// NOT NULL, so the Route row can't be removed while they still reference it), then the Route rows
// themselves. Idempotent — a no-op once these are already gone.
const pruneObsoleteRoutes = async () => {
  try {
    const { Op } = require("sequelize");
    const routes = await Route.findAll({ where: { path: { [Op.in]: STALE_ROUTE_PATHS } } });
    if (routes.length === 0) return;

    const routeIds = routes.map((r) => r.id);
    await UserPermission.destroy({ where: { routeId: { [Op.in]: routeIds } } });
    await Route.destroy({ where: { id: { [Op.in]: routeIds } } });
  } catch (e) {
    console.warn("Could not prune obsolete routes:", e.message);
  }
};

// One-time-per-user-per-route backfill: Outgoing/Incoming Courier used to be a single "/couriers"
// permission, split into two independent ones above. Copies every existing Outgoing Courier
// UserPermission row onto the new Incoming Courier route (same booleans) so nobody who already
// had Couriers access loses Incoming access the day this ships. findOrCreate keeps this additive
// and a no-op on every boot after the first — an Admin can freely un-grant Incoming afterwards.
const backfillIncomingCourierPermissions = async () => {
  try {
    const outgoing = await Route.findOne({ where: { path: "/couriers" } });
    const incoming = await Route.findOne({ where: { path: "/couriers/incoming" } });
    if (!outgoing || !incoming) return;

    const outgoingPerms = await UserPermission.findAll({ where: { routeId: outgoing.id } });
    for (const perm of outgoingPerms) {
      await UserPermission.findOrCreate({
        where: { userId: perm.userId, routeId: incoming.id },
        defaults: {
          userId: perm.userId,
          routeId: incoming.id,
          canRead: perm.canRead,
          canCreate: perm.canCreate,
          canUpdate: perm.canUpdate,
          canDelete: perm.canDelete,
          viewAllRecords: perm.viewAllRecords,
        },
      });
    }
  } catch (e) {
    console.warn("Could not backfill Incoming Courier permissions:", e.message);
  }
};

// Pending Bill ships with access restricted to Admin (always bypasses authorize.js), Krina by
// name, and every user with the "Account" role — the role reused as "Accountant" for the
// restock-bill payment flow now merged into this module (no dedicated Accountant role exists —
// see pendingBill.controller.js). There is no role-based default otherwise, so this grants a
// UserPermission row the same way an Admin would via Settings → Route Setting. findOrCreate keeps
// this additive/idempotent: a no-op on every boot after the first, and an Admin can freely change
// access afterwards. Matches the backfillIncomingCourierPermissions pattern above.
const grantInitialPendingBillAccess = async () => {
  try {
    const route = await Route.findOne({ where: { path: "/account/pending-bill" } });
    if (!route) return;

    const { Op } = require("sequelize");
    const { User } = require("./models");

    const grantee = async (user) => {
      if (!user) return;
      await UserPermission.findOrCreate({
        where: { userId: user.id, routeId: route.id },
        defaults: {
          userId: user.id,
          routeId: route.id,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: false,
          viewAllRecords: true,
        },
      });
    };

    const krina = await User.findOne({ where: { name: { [Op.like]: "Krina" } } });
    await grantee(krina);

    const accountRole = await Role.findOne({ where: { name: "Account" } });
    if (accountRole) {
      const accountUsers = await User.findAll({ where: { roleId: accountRole.id } });
      for (const user of accountUsers) await grantee(user);
    }
  } catch (e) {
    console.warn("Could not grant initial Pending Bill access:", e.message);
  }
};

// Leads ships with access restricted to Admin (always bypasses authorize.js) and every user with
// the "Sales Employee" role — canDelete deliberately left false (Sales Employees never get
// delete access by default; see lead.controller.js#deleteLead), viewAllRecords false (each Sales
// Employee only sees/edits their own leads by default — see helper/permissionScope.js). Grants a
// UserPermission row the same way an Admin would via Settings → Route Setting. findOrCreate keeps
// this additive/idempotent: a no-op on every boot after the first, and an Admin can freely change
// access afterwards. Matches the grantInitialPendingBillAccess pattern above.
const grantInitialLeadsAccess = async () => {
  try {
    const route = await Route.findOne({ where: { path: "/leads" } });
    if (!route) return;

    const salesEmployeeRole = await Role.findOne({ where: { name: "Sales Employee" } });
    if (!salesEmployeeRole) return;

    const { User } = require("./models");
    const salesEmployees = await User.findAll({ where: { roleId: salesEmployeeRole.id } });

    for (const user of salesEmployees) {
      await UserPermission.findOrCreate({
        where: { userId: user.id, routeId: route.id },
        defaults: {
          userId: user.id,
          routeId: route.id,
          canRead: true,
          canCreate: true,
          canUpdate: true,
          canDelete: false,
          viewAllRecords: false,
        },
      });
    }
  } catch (e) {
    console.warn("Could not grant initial Leads access:", e.message);
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

// sequelize.sync({alter:true}) does not reliably loosen an existing NOT NULL constraint,
// so users.roleId (allowNull:true — see user.model.js)
// needs an explicit ALTER here. Idempotent: a no-op once the column is already nullable.
const ensureUserRoleIdNullable = async () => {
  const { DataTypes } = require("sequelize");
  const queryInterface = sequelize.getQueryInterface();
  const columns = await queryInterface.describeTable("users");
  if (columns.roleId && columns.roleId.allowNull === false) {
    await queryInterface.changeColumn("users", "roleId", { type: DataTypes.INTEGER, allowNull: true });
  }
};

// Same sync({alter:true}) limitation as ensureUserRoleIdNullable above — accountHolderName and
// accountNumber became optional after bank_accounts shipped with them NOT NULL. Idempotent.
const ensureBankAccountFieldsNullable = async () => {
  const { DataTypes } = require("sequelize");
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));
  if (!tableNames.includes("bank_accounts")) return;

  const columns = await queryInterface.describeTable("bank_accounts");
  if (columns.accountHolderName && columns.accountHolderName.allowNull === false) {
    await queryInterface.changeColumn("bank_accounts", "accountHolderName", { type: DataTypes.STRING, allowNull: true });
  }
  if (columns.accountNumber && columns.accountNumber.allowNull === false) {
    await queryInterface.changeColumn("bank_accounts", "accountNumber", { type: DataTypes.STRING, allowNull: true });
  }
};

// pending_bills gained a NOT NULL remainingAmount column (and paidAmount/billType/etc.) when the
// restock-bill payment flow was merged into it. sequelize.sync({alter:true}) can't safely add a
// NOT NULL column to a table that already has rows (MySQL has nothing to put in it) — so if the
// column is missing and the table isn't empty, add it nullable first and backfill every existing
// row (old rows predate the payment-installment flow, so they're either fully PENDING/untouched
// or were APPROVED under the old single-click flow — treat the latter as fully paid) before sync
// tightens the constraint. Idempotent: a no-op once the column already exists.
const ensurePendingBillPaymentFieldsBackfilled = async () => {
  const { DataTypes } = require("sequelize");
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));
  if (!tableNames.includes("pending_bills")) return;

  const columns = await queryInterface.describeTable("pending_bills");
  if (columns.remainingAmount) return;

  await queryInterface.addColumn("pending_bills", "paidAmount", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    defaultValue: 0,
  });
  await queryInterface.addColumn("pending_bills", "remainingAmount", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
  });

  const [rows] = await sequelize.query('SELECT id, amount, status FROM pending_bills');
  for (const row of rows) {
    const paidAmount = row.status === "APPROVED" ? row.amount : 0;
    const remainingAmount = row.status === "APPROVED" ? 0 : row.amount;
    await sequelize.query("UPDATE pending_bills SET paidAmount = ?, remainingAmount = ? WHERE id = ?", {
      replacements: [paidAmount, remainingAmount, row.id],
    });
  }

  await queryInterface.changeColumn("pending_bills", "remainingAmount", {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  });
};

// The Sales module's "COD" payment method was retired in favor of "Cash" (already a distinct
// option). Removing "COD" from the ENUM before sync({alter:true}) would leave any existing
// rows still storing 'COD' pointing at a value the column no longer accepts — backfill them
// first. Idempotent: a no-op once no row stores 'COD' anymore.
const ensureCodPaymentMethodBackfilled = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));

  if (tableNames.includes("sells")) {
    await sequelize.query("UPDATE sells SET paymentMethod = 'Cash' WHERE paymentMethod = 'COD'");
  }
  if (tableNames.includes("sale_payments")) {
    await sequelize.query("UPDATE sale_payments SET method = 'Cash' WHERE method = 'COD'");
  }
};

// The Sale ↔ BankAccount relationship moved from a single bankAccountId column to a
// sale_bank_accounts table of (bank account, amount) payment allocations (the Bank Account
// field now supports splitting the collected amount across multiple accounts). Runs after sync
// (the table must exist first) and copies any existing sells.bankAccountId — with the sale's
// full collectedAmount, the only allocation we know for a sale created before this change — so
// old sales keep showing their previously selected bank account. Idempotent: only inserts rows
// that don't exist yet.
const backfillSaleBankAccounts = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));
  if (!tableNames.includes("sale_bank_accounts")) return;

  await sequelize.query(`
    INSERT INTO sale_bank_accounts (saleId, bankAccountId, amount, createdAt, updatedAt)
    SELECT s.id, s.bankAccountId, s.collectedAmount, NOW(), NOW()
    FROM sells s
    WHERE s.bankAccountId IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM sale_bank_accounts sba
        WHERE sba.saleId = s.id AND sba.bankAccountId = s.bankAccountId
      )
  `);
};

// sale_bank_accounts used to enforce one row per (sale, bank account) before this table grew an
// `amount` column — now that a sale's paid amount can be split across several rows for the same
// bank account (see saleBankAccount.model.js), that unique index has to go. sync({alter:true})
// doesn't reliably drop indexes no longer declared on the model, so this removes it explicitly.
// Idempotent: a no-op once the index is already gone (including on a table created fresh, which
// never had it).
const ensureSaleBankAccountsAllowDuplicates = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));
  if (!tableNames.includes("sale_bank_accounts")) return;

  const indexes = await queryInterface.showIndex("sale_bank_accounts");
  const duplicateIndex = indexes.find(
    (idx) =>
      idx.unique &&
      idx.fields.some((f) => f.attribute === "saleId") &&
      idx.fields.some((f) => f.attribute === "bankAccountId")
  );
  if (!duplicateIndex) return;

  // The saleId foreign key relies on this composite index to satisfy InnoDB's "FK columns must
  // be indexed" requirement — MySQL refuses to drop it until a replacement index on saleId
  // exists.
  const hasPlainSaleIdIndex = indexes.some(
    (idx) => idx.name !== duplicateIndex.name && idx.fields[0]?.attribute === "saleId"
  );
  if (!hasPlainSaleIdIndex) {
    await queryInterface.addIndex("sale_bank_accounts", ["saleId"]);
  }
  await queryInterface.removeIndex("sale_bank_accounts", duplicateIndex.name);
};

// Deletes the same stale Route rows as pruneObsoleteRoutes, but with raw SQL and before
// sync({alter:true}) runs. Route.model.js now declares a unique index on `name`; sync({alter:true})
// adds it with a plain ALTER TABLE, which fails with ER_DUP_ENTRY if two rows still share a name
// (e.g. the stray "/account/account" row and the real "/account" row both named "Account") —
// so these have to be gone before sync, not after. Idempotent: a no-op once they're already gone.
const ensureNoStaleRoutesBeforeSync = async () => {
  const queryInterface = sequelize.getQueryInterface();
  const tables = await queryInterface.showAllTables();
  const tableNames = tables.map((table) => (typeof table === "string" ? table : table.tableName));
  if (!tableNames.includes("routes")) return;

  const [rows] = await sequelize.query("SELECT id FROM routes WHERE path IN (?)", {
    replacements: [STALE_ROUTE_PATHS],
  });
  if (rows.length === 0) return;

  const ids = rows.map((r) => r.id);
  if (tableNames.includes("user_permissions")) {
    await sequelize.query("DELETE FROM user_permissions WHERE routeId IN (?)", { replacements: [ids] });
  }
  await sequelize.query("DELETE FROM routes WHERE id IN (?)", { replacements: [ids] });
};

sequelize
  .authenticate()
  .then(() => {
    console.log(chalk.green("✔ DB connected"));
    logger.info("DB connected");
    return renameSalesTables();
  })
  .then(() => {
    return ensureUserRoleIdNullable();
  })
  .then(() => {
    return ensureNoStaleRoutesBeforeSync();
  })
  .then(() => {
    return ensureBankAccountFieldsNullable();
  })
  .then(() => {
    return ensurePendingBillPaymentFieldsBackfilled();
  })
  .then(() => {
    return ensureCodPaymentMethodBackfilled();
  })
  .then(() => {
    return ensureSaleBankAccountsAllowDuplicates();
  })
  .then(() => {
    return sequelize.sync({ alter: true });
  })
  .then(async () => {
    logger.info("Models synced");
    await backfillSaleBankAccounts();
    await ensureAllRoles();
    await ensureAllRoutesAndPermissions();
    await pruneObsoleteRoutes();
    await backfillIncomingCourierPermissions();
    await grantInitialPendingBillAccess();
    await grantInitialLeadsAccess();

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