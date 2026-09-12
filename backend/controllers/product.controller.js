const { Product, Stock, SerialUnit, Dealer, SaleItem, Sale, StockMovement } = require("../models");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const inventoryService = require("../services/inventory.service");
const { STOCK_TRACKED_TYPES } = inventoryService;
const pendingBillService = require("../services/pendingBill.service");
const { notify } = require("../services/notification.service");

const VALID_PRODUCT_TYPES = ["NON_SERIAL", "SERIALIZED", "SOFTWARE", "HARDWARE_ORDER_BASED"];

const DEALER_ATTRS = ["id", "name"];

// Bulk group-count of serial_units by productId/status for a page of SERIALIZED products —
// one query instead of N, mirrors inventoryService.getSerialAvailability's per-product version.
const getSerialCountsForProducts = async (productIds) => {
  if (!productIds.length) return {};
  const rows = await SerialUnit.findAll({
    where: { productId: { [Op.in]: productIds } },
    attributes: ["productId", "status", [sequelize.fn("COUNT", sequelize.col("id")), "count"]],
    group: ["productId", "status"],
    raw: true,
  });
  const byProduct = {};
  for (const row of rows) {
    if (!byProduct[row.productId]) byProduct[row.productId] = { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };
    byProduct[row.productId][row.status] = parseInt(row.count, 10) || 0;
  }
  return byProduct;
};

// Per-unit purchase/selling price varies across a SERIALIZED product's batches, so the list view
// (which has room for only one price pair per row) shows the most recently received unit's price
// rather than a meaningless product-level average — mirrors how STOCK_TRACKED_TYPES always show
// the latest Stock-row price. Rows come back ordered newest-first, so the first row seen per
// product is its latest.
const getLatestSerialPricesForProducts = async (productIds) => {
  if (!productIds.length) return {};
  const rows = await SerialUnit.findAll({
    where: { productId: { [Op.in]: productIds } },
    attributes: ["productId", "purchasePrice", "sellingPrice"],
    order: [
      ["receivedAt", "DESC"],
      ["id", "DESC"],
    ],
    raw: true,
  });
  const byProduct = {};
  for (const row of rows) {
    if (!(row.productId in byProduct)) {
      byProduct[row.productId] = { purchasePrice: row.purchasePrice, sellingPrice: row.sellingPrice };
    }
  }
  return byProduct;
};

const serializeProduct = (p, serialCounts, latestSerialPrices = {}) => {
  const base = {
    id: p.id,
    name: p.name,
    description: p.description,
    productType: p.productType,
    isActive: p.isActive,
    isMasterProduct: p.isMasterProduct,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };

  if (p.productType === "SOFTWARE") {
    // No physical/warehouse stock concept — currentStock/reserved/available are reported as
    // null ("not applicable"), distinct from a real, meaningful 0. The Stock row still exists
    // (permanently pinned at quantity 0) purely to hold sellingPrice/dealer, same field as
    // NON_SERIAL/HARDWARE_ORDER_BASED — never touched by any reserve/fulfill/receive logic.
    const stock = p.Stock;
    return {
      ...base,
      currentStock: null,
      reserved: null,
      available: null,
      purchasePrice: null,
      sellingPrice: stock ? stock.sellingPrice : null,
      dealer: null,
    };
  }

  if (STOCK_TRACKED_TYPES.includes(p.productType)) {
    // NON_SERIAL and HARDWARE_ORDER_BASED — identical Stock-row shape. HARDWARE_ORDER_BASED
    // simply starts (and stays) at quantity 0 until "Receive Stock" is used to arrange/procure
    // it per order, so these numbers are real and meaningful, just usually 0.
    const stock = p.Stock;
    const quantity = stock ? stock.quantity : 0;
    const reserved = stock ? stock.reserved : 0;
    return {
      ...base,
      currentStock: quantity,
      reserved,
      available: Math.max(0, quantity - reserved),
      purchasePrice: stock ? stock.purchasePrice : null,
      sellingPrice: stock ? stock.sellingPrice : null,
      dealer: stock && stock.Dealer ? { id: stock.Dealer.id, name: stock.Dealer.name } : null,
    };
  }

  // SERIALIZED — availability always derived from serial_units, never a stored counter.
  const counts = serialCounts[p.id] || { AVAILABLE: 0, RESERVED: 0, SOLD: 0 };
  const latest = latestSerialPrices[p.id] || null;
  return {
    ...base,
    currentStock: counts.AVAILABLE,
    reserved: counts.RESERVED,
    available: counts.AVAILABLE,
    sold: counts.SOLD,
    purchasePrice: latest ? latest.purchasePrice : null,
    sellingPrice: latest ? latest.sellingPrice : null,
    dealer: null,
  };
};

// GET /products?search=&productType=&status=&page=&limit=
exports.getProducts = async (req, res) => {
  try {
    const { search, productType, status, masterOnly, page, limit } = req.query;

    const where = {};

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      where[Op.or] = [{ name: { [Op.like]: s } }, { description: { [Op.like]: s } }];
    }

    if (productType && VALID_PRODUCT_TYPES.includes(productType)) {
      where.productType = productType;
    }

    if (status === "active") {
      where.isActive = true;
    } else if (status === "inactive") {
      where.isActive = false;
    }

    // Excludes products quick-added from the Sells form without "Save as New Product" — those
    // rows exist only to back one sale's line item and aren't meant to show up in the master
    // product catalog. Callers that need every real product row (e.g. the Sells item picker,
    // which must still resolve/display one it just quick-added) simply omit this filter.
    if (masterOnly === "true") {
      where.isMasterProduct = true;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Product.findAndCountAll({
      where,
      include: {
        model: Stock,
        include: [{ model: Dealer, attributes: DEALER_ATTRS }],
      },
      order: [["name", "ASC"]],
      limit: limitNum,
      offset,
      distinct: true,
    });

    const serializedIds = rows.filter((p) => p.productType === "SERIALIZED").map((p) => p.id);
    const [serialCounts, latestSerialPrices] = await Promise.all([
      getSerialCountsForProducts(serializedIds),
      getLatestSerialPricesForProducts(serializedIds),
    ]);

    const data = rows.map((p) => serializeProduct(p, serialCounts, latestSerialPrices));

    return res.status(200).json({
      success: true,
      data,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum) || 1,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /products/:id — SERIALIZED responses include the full per-unit list (§23): purchase
// provenance plus, for SOLD units, sale-side info read through saleItem -> sale, never duplicated.
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, {
      include:
        // Only NON_SERIAL products have a Stock row — including it unconditionally is fine
        // either way since Sequelize just returns null for the missing side.
        { model: Stock, include: [{ model: Dealer, attributes: DEALER_ATTRS }] },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.productType === "SOFTWARE") {
      // No purchase history or serial units — just the base serialized shape.
      return res.status(200).json({ success: true, data: serializeProduct(product, {}) });
    }

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      const purchaseMovements = await StockMovement.findAll({
        where: { productId: id, type: "PURCHASE" },
        order: [
          ["purchaseDate", "ASC"],
          ["id", "ASC"],
        ],
      });

      // Same-day restocks are collapsed into one ledger row: quantities add up, and the
      // amount is the combined cost (qty * price per movement) so an average price falls
      // out naturally when the day's batches were bought at different rates.
      const groupsByDate = new Map();
      for (const m of purchaseMovements) {
        const key = m.purchaseDate ?? `__no-date-${m.id}`;
        if (!groupsByDate.has(key)) {
          groupsByDate.set(key, { id: m.id, purchaseDate: m.purchaseDate, quantity: 0, purchaseAmount: 0 });
        }
        const group = groupsByDate.get(key);
        group.quantity += m.quantity;
        group.purchaseAmount += m.purchasePrice != null ? Number(m.purchasePrice) * m.quantity : 0;
      }

      const data = {
        ...serializeProduct(product, {}),
        purchases: Array.from(groupsByDate.values()),
      };
      return res.status(200).json({ success: true, data });
    }

    const units = await SerialUnit.findAll({
      where: { productId: id },
      include: [
        { model: Dealer, attributes: DEALER_ATTRS },
        {
          model: SaleItem,
          attributes: ["id", "sellingPrice", "createdAt"],
          include: [{ model: Sale, attributes: ["id", "invoiceNumber", "customerName", "createdAt"] }],
        },
      ],
      order: [["id", "ASC"]],
    });

    const counts = await inventoryService.getSerialAvailability(id);
    const latestSerialPrices = await getLatestSerialPricesForProducts([id]);
    const base = serializeProduct(
      product,
      { [id]: { AVAILABLE: counts.available, RESERVED: counts.reserved, SOLD: counts.sold } },
      latestSerialPrices
    );

    return res.status(200).json({
      success: true,
      data: {
        ...base,
        total: counts.total,
        units: units.map((u) => ({
          id: u.id,
          serialNumber: u.serialNumber,
          status: u.status,
          purchasePrice: u.purchasePrice,
          purchaseDate: u.purchaseDate,
          dealer: u.Dealer ? { id: u.Dealer.id, name: u.Dealer.name } : null,
          receivedAt: u.receivedAt,
          soldAt: u.soldAt,
          returnedAt: u.returnedAt,
          // Listed asking price until sold, then the price it actually sold for.
          sellingPrice: u.SaleItem ? u.SaleItem.sellingPrice : u.sellingPrice,
          sellingDate: u.SaleItem ? u.SaleItem.createdAt : null,
          customerName: u.SaleItem && u.SaleItem.Sale ? u.SaleItem.Sale.customerName : null,
          invoiceNumber: u.SaleItem && u.SaleItem.Sale ? u.SaleItem.Sale.invoiceNumber : null,
        })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /products — combined creation (§25): NON_SERIAL optionally seeds Stock + an initial
// purchase movement in the same call; SERIALIZED optionally seeds its first serial units.
// Both are optional — "just the product, add inventory later via /inventory/receive" also works.
exports.createProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { name, description, productType, quantity, purchasePrice, sellingPrice, dealerId, purchaseDate, units, isMasterProduct } =
      req.body || {};

    if (!name || !name.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Product name is required" });
    }
    if (productType !== undefined && !VALID_PRODUCT_TYPES.includes(productType)) {
      await t.rollback();
      return res.status(400).json({ success: false, message: `productType must be one of ${VALID_PRODUCT_TYPES.join(", ")}` });
    }
    const resolvedType = productType || "NON_SERIAL";
    // Defaults to true so every existing caller (the Products page "Add Product" flow) keeps
    // creating real master products — only the Sells quick-add modal ever sends `false`.
    const resolvedIsMaster = isMasterProduct === false ? false : true;
    const successMessage = resolvedIsMaster
      ? "Product created successfully"
      : "Product saved for this sale only — not added to the master product catalog";

    let dealer = null;
    if (dealerId) {
      dealer = await Dealer.findByPk(dealerId, { transaction: t });
      if (!dealer) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Selected dealer does not exist" });
      }
    }

    const product = await Product.create(
      { name: name.trim(), description: description || null, productType: resolvedType, isMasterProduct: resolvedIsMaster },
      { transaction: t }
    );

    if (resolvedType === "SOFTWARE") {
      // No quantity/purchase concept at all — nothing was bought, so no StockMovement/PendingBill.
      // The Stock row exists solely to hold sellingPrice/dealer, permanently pinned at 0.
      const stock = await Stock.create(
        { productId: product.id, quantity: 0, reserved: 0, purchasePrice: null, sellingPrice: sellingPrice ?? null, dealerId: dealerId ?? null },
        { transaction: t }
      );
      await t.commit();
      return res.status(201).json({
        success: true,
        message: successMessage,
        data: serializeProduct({ ...product.toJSON(), Stock: stock.toJSON() }, {}),
      });
    }

    if (resolvedType === "HARDWARE_ORDER_BASED") {
      // Deliberately never reads req.body.quantity — this type always starts at 0 stock and is
      // procured per order via the existing Receive Stock flow, not pre-purchased in bulk. No
      // StockMovement/PendingBill here since nothing has actually been bought yet.
      const stock = await Stock.create(
        { productId: product.id, quantity: 0, reserved: 0, purchasePrice: purchasePrice ?? null, sellingPrice: sellingPrice ?? null, dealerId: dealerId ?? null },
        { transaction: t }
      );
      await t.commit();
      return res.status(201).json({
        success: true,
        message: successMessage,
        data: serializeProduct({ ...product.toJSON(), Stock: stock.toJSON() }, {}),
      });
    }

    if (resolvedType === "NON_SERIAL") {
      const initialQuantity = parseInt(quantity, 10) || 0;
      const stock = await Stock.create(
        {
          productId: product.id,
          quantity: initialQuantity,
          reserved: 0,
          purchasePrice: purchasePrice ?? null,
          sellingPrice: sellingPrice ?? null,
          dealerId: dealerId ?? null,
        },
        { transaction: t }
      );

      let pendingBill = null;
      if (initialQuantity > 0) {
        const movement = await StockMovement.create(
          {
            productId: product.id,
            type: "PURCHASE",
            quantity: initialQuantity,
            reservedDelta: 0,
            purchasePrice: purchasePrice ?? null,
            dealerId: dealerId ?? null,
            purchaseDate: purchaseDate ?? null,
            referenceType: "manual",
            referenceId: null,
            createdBy: user.id,
            notes: "Initial stock on product creation",
          },
          { transaction: t }
        );

        pendingBill = await pendingBillService.createBillForPurchase(
          {
            triggerType: "NEW_PRODUCT",
            productId: product.id,
            productNameSnapshot: product.name,
            dealerId: dealerId ?? null,
            dealerNameSnapshot: dealer ? dealer.name : null,
            quantity: initialQuantity,
            purchasePrice: purchasePrice ?? null,
            billDate: purchaseDate ?? new Date(),
            stockMovementId: movement.id,
            createdBy: user.id,
          },
          { transaction: t }
        );
      }

      await t.commit();

      if (pendingBill) {
        await notify([
          {
            recipientModule: "admin",
            type: "PENDING_BILL_PENDING_APPROVAL",
            title: "New Pending Bill Awaiting Payment",
            message: `${user.name || "A user"} added a new product "${product.name}" with initial stock of ${initialQuantity} unit(s). A pending bill (#${pendingBill.id}) of ₹${Number(pendingBill.amount).toLocaleString("en-IN")} was generated.`,
            referenceType: "pendingBill",
            referenceId: pendingBill.id,
            event: "pending_bill_created",
            payload: { pendingBillId: pendingBill.id, productId: product.id },
          },
        ]);
      }

      return res.status(201).json({
        success: true,
        message: successMessage,
        data: serializeProduct({ ...product.toJSON(), Stock: stock.toJSON() }, {}),
      });
    }

    // SERIALIZED
    const createdUnits = [];
    let pendingBill = null;
    if (Array.isArray(units) && units.length > 0) {
      for (const u of units) {
        if (!u.serialNumber || !String(u.serialNumber).trim()) {
          await t.rollback();
          return res.status(400).json({ success: false, message: "Each unit requires a serialNumber" });
        }
        if (u.dealerId) {
          const dealer = await Dealer.findByPk(u.dealerId, { transaction: t });
          if (!dealer) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "Selected dealer does not exist" });
          }
        }
        const unit = await SerialUnit.create(
          {
            productId: product.id,
            serialNumber: String(u.serialNumber).trim(),
            status: "AVAILABLE",
            purchasePrice: u.purchasePrice ?? null,
            sellingPrice: u.sellingPrice ?? null,
            purchaseDate: u.purchaseDate ?? new Date(),
            dealerId: u.dealerId ?? null,
            receivedAt: new Date(),
            createdBy: user.id,
          },
          { transaction: t }
        );
        createdUnits.push(unit);
      }

      const movement = await StockMovement.create(
        {
          productId: product.id,
          type: "PURCHASE",
          quantity: 0,
          reservedDelta: 0,
          referenceType: "manual",
          referenceId: null,
          createdBy: user.id,
          notes: `Received ${createdUnits.length} serial unit(s) on product creation`,
        },
        { transaction: t }
      );

      // A bill's supplier/price is a single value, but SERIALIZED units may each have their own
      // dealer/price — sum the real total across units and use the first unit's dealer (if any)
      // as the bill's supplier, rather than assuming a single uniform price like NON_SERIAL does.
      const totalUnitAmount = createdUnits.reduce((sum, u) => sum + (u.purchasePrice != null ? Number(u.purchasePrice) : 0), 0);
      const firstDealerId = createdUnits.map((u) => u.dealerId).find((id) => id != null) || null;
      const firstDealer = firstDealerId ? await Dealer.findByPk(firstDealerId, { transaction: t }) : null;

      pendingBill = await pendingBillService.createBillForPurchase(
        {
          triggerType: "NEW_PRODUCT",
          productId: product.id,
          productNameSnapshot: product.name,
          dealerId: firstDealerId,
          dealerNameSnapshot: firstDealer ? firstDealer.name : null,
          quantity: createdUnits.length,
          totalAmount: totalUnitAmount,
          billDate: new Date(),
          stockMovementId: movement.id,
          createdBy: user.id,
        },
        { transaction: t }
      );
    }

    await t.commit();

    if (pendingBill) {
      await notify([
        {
          recipientModule: "admin",
          type: "PENDING_BILL_PENDING_APPROVAL",
          title: "New Pending Bill Awaiting Payment",
          message: `${user.name || "A user"} added a new product "${product.name}" with ${createdUnits.length} serial unit(s). A pending bill (#${pendingBill.id}) of ₹${Number(pendingBill.amount).toLocaleString("en-IN")} was generated.`,
          referenceType: "pendingBill",
          referenceId: pendingBill.id,
          event: "pending_bill_created",
          payload: { pendingBillId: pendingBill.id, productId: product.id },
        },
      ]);
    }

    // createdUnits are inserted in order, so the last one is the latest-added — same
    // "last added entry" rule getLatestSerialPricesForProducts applies for the list view.
    const lastUnit = createdUnits[createdUnits.length - 1];
    const latestPrices = lastUnit
      ? { [product.id]: { purchasePrice: lastUnit.purchasePrice, sellingPrice: lastUnit.sellingPrice } }
      : {};

    return res.status(201).json({
      success: true,
      message: successMessage,
      data: {
        ...serializeProduct(product, {}, latestPrices),
        units: createdUnits.map((u) => ({
          id: u.id,
          serialNumber: u.serialNumber,
          status: u.status,
          purchasePrice: u.purchasePrice,
          sellingPrice: u.sellingPrice,
          purchaseDate: u.purchaseDate,
        })),
      },
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Product or serial number already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /products/:id
exports.updateProduct = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const { id } = req.params;
    const { name, description, isActive, sellingPrice, dealerId, quantity } = req.body || {};

    const product = await Product.findByPk(id, { transaction: t });
    if (!product) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // productType is intentionally not editable here — changing it after stock/orders
    // already exist against the product would leave inventory data inconsistent.
    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save({ transaction: t });

    if (product.productType !== "SERIALIZED") {
      // NON_SERIAL, SOFTWARE, and HARDWARE_ORDER_BASED all carry a Stock row (see
      // serializeProduct) purely to hold sellingPrice/dealer — this branch covers all three.
      const [stock] = await Stock.findOrCreate({
        where: { productId: id },
        defaults: { productId: id, quantity: 0, reserved: 0 },
        transaction: t,
        lock: true,
      });

      if (sellingPrice !== undefined) {
        stock.sellingPrice = sellingPrice;
      }

      if (dealerId !== undefined) {
        if (dealerId === null || dealerId === "") {
          stock.dealerId = null;
        } else {
          const dealer = await Dealer.findByPk(dealerId, { transaction: t });
          if (!dealer) {
            await t.rollback();
            return res.status(400).json({ success: false, message: "Selected dealer does not exist" });
          }
          stock.dealerId = dealer.id;
        }
      }

      await stock.save({ transaction: t });

      // Quantity is only settable for stock-tracked types (NON_SERIAL, HARDWARE_ORDER_BASED) —
      // SOFTWARE has no stock concept and stays pinned at 0. Delta is routed through
      // inventoryService.adjustStock so the reserved-quantity guard and StockMovement audit
      // trail stay consistent with every other place stock is mutated.
      if (quantity !== undefined && quantity !== null && quantity !== "" && STOCK_TRACKED_TYPES.includes(product.productType)) {
        const targetQuantity = parseInt(quantity, 10);
        if (isNaN(targetQuantity) || targetQuantity < 0) {
          await t.rollback();
          return res.status(400).json({ success: false, message: "quantity must be a non-negative integer" });
        }

        const delta = targetQuantity - stock.quantity;
        if (delta !== 0) {
          try {
            await inventoryService.adjustStock(
              {
                productId: id,
                delta,
                userId: user.id,
                notes: `Quantity updated to ${targetQuantity} via product edit`,
              },
              { transaction: t }
            );
          } catch (err) {
            await t.rollback();
            return res.status(err.statusCode || 400).json({ success: false, message: err.message });
          }
        }
      }
    } else if (sellingPrice !== undefined) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "sellingPrice cannot be set on SERIALIZED products — pricing is per sale item",
      });
    }

    await t.commit();

    const refreshed = await Product.findByPk(id, {
      include: { model: Stock, include: [{ model: Dealer, attributes: DEALER_ATTRS }] },
    });

    const latestSerialPrices =
      refreshed.productType === "SERIALIZED" ? await getLatestSerialPricesForProducts([id]) : {};

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: serializeProduct(refreshed, {}, latestSerialPrices),
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /products/:id
exports.deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // Soft-delete: set isActive = false (preserves references in sells_items)
    product.isActive = false;
    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product deactivated successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
