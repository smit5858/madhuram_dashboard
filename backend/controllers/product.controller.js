const { Product, Stock, SerialUnit, Dealer, SaleItem, Sale, StockMovement } = require("../models");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const inventoryService = require("../services/inventory.service");

const VALID_PRODUCT_TYPES = ["NON_SERIAL", "SERIALIZED"];

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

const serializeProduct = (p, serialCounts) => {
  const base = {
    id: p.id,
    name: p.name,
    description: p.description,
    productType: p.productType,
    isActive: p.isActive,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };

  if (p.productType === "NON_SERIAL") {
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
  return {
    ...base,
    currentStock: counts.AVAILABLE,
    reserved: counts.RESERVED,
    available: counts.AVAILABLE,
    sold: counts.SOLD,
    purchasePrice: null,
    sellingPrice: null,
    dealer: null,
  };
};

// GET /products?search=&productType=&status=&page=&limit=
exports.getProducts = async (req, res) => {
  try {
    const { search, productType, status, page, limit } = req.query;

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
    const serialCounts = await getSerialCountsForProducts(serializedIds);

    const data = rows.map((p) => serializeProduct(p, serialCounts));

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

    if (product.productType === "NON_SERIAL") {
      const data = serializeProduct(product, {});
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
    const base = serializeProduct(product, { [id]: { AVAILABLE: counts.available, RESERVED: counts.reserved, SOLD: counts.sold } });

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
    const { name, description, productType, quantity, purchasePrice, sellingPrice, dealerId, purchaseDate, units } =
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

    if (dealerId) {
      const dealer = await Dealer.findByPk(dealerId, { transaction: t });
      if (!dealer) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Selected dealer does not exist" });
      }
    }

    const product = await Product.create(
      { name: name.trim(), description: description || null, productType: resolvedType },
      { transaction: t }
    );

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

      if (initialQuantity > 0) {
        await StockMovement.create(
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
      }

      await t.commit();
      return res.status(201).json({
        success: true,
        message: "Product created successfully",
        data: serializeProduct({ ...product.toJSON(), Stock: stock.toJSON() }, {}),
      });
    }

    // SERIALIZED
    const createdUnits = [];
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
            purchaseDate: u.purchaseDate ?? null,
            dealerId: u.dealerId ?? null,
            receivedAt: new Date(),
            createdBy: user.id,
          },
          { transaction: t }
        );
        createdUnits.push(unit);
      }

      await StockMovement.create(
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
    }

    await t.commit();
    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: {
        ...serializeProduct(product, {}),
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
  try {
    const { id } = req.params;
    const { name, description, isActive, sellingPrice, dealerId } = req.body || {};

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    // productType is intentionally not editable here — changing it after stock/orders
    // already exist against the product would leave inventory data inconsistent.
    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();

    if (product.productType === "NON_SERIAL") {
      const [stock] = await Stock.findOrCreate({ where: { productId: id }, defaults: { productId: id, quantity: 0, reserved: 0 } });

      if (sellingPrice !== undefined) {
        stock.sellingPrice = sellingPrice;
      }

      if (dealerId !== undefined) {
        if (dealerId === null || dealerId === "") {
          stock.dealerId = null;
        } else {
          const dealer = await Dealer.findByPk(dealerId);
          if (!dealer) {
            return res.status(400).json({ success: false, message: "Selected dealer does not exist" });
          }
          stock.dealerId = dealer.id;
        }
      }

      await stock.save();
    } else if (sellingPrice !== undefined) {
      return res.status(400).json({
        success: false,
        message: "sellingPrice can only be set on NON_SERIAL products — SERIALIZED pricing is per sale item",
      });
    }

    const refreshed = await Product.findByPk(id, {
      include: { model: Stock, include: [{ model: Dealer, attributes: DEALER_ATTRS }] },
    });

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: serializeProduct(refreshed, {}),
    });
  } catch (err) {
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
