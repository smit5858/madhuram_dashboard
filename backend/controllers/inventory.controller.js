const { SerialUnit, Product, SaleItem, Sale, Dealer, Courier } = require("../models");
const { Op } = require("sequelize");
const inventoryService = require("../services/inventory.service");
const { STOCK_TRACKED_TYPES } = inventoryService;
const { notify } = require("../services/notification.service");

const errorResponse = (res, err) => {
  const status = err.statusCode || (err.message && /not found/i.test(err.message) ? 404 : 400);
  return res.status(status).json({ success: false, message: err.message });
};

// Fires after a stock receipt's FIFO sweep (inventoryService.allocateBackorders) clears one or
// more previously-backordered sale items. Each allocation is matched back to the Courier row
// that was waiting on this exact product (saleItemId is 1:1 with a Courier row — see
// courier.model.js) and notified to that row's owning employee only (Courier.userId — the
// existing "assigned employee" relationship for Courier), never broadcast to the whole Couriers
// module/Admin. An item with no linked Courier row (e.g. "Create Courier Entry" was off) has no
// pending Courier entry to notify about, so it's skipped.
//
// Duplicate-safe by construction: allocateBackorders only ever matches SaleItems that still have
// backorderedQuantity > 0, so a sale item that was already fully allocated on a previous stock
// receipt is never re-selected, and a repeat/no-op receiveStock call (nothing left to allocate)
// returns no allocations at all (see the early return below).
const notifyBackorderAllocations = async (allocations, product) => {
  if (!allocations || allocations.length === 0) return;

  const saleItemIds = allocations.map((a) => a.saleItemId);
  const couriers = await Courier.findAll({
    where: { saleItemId: { [Op.in]: saleItemIds } },
    attributes: ["id", "saleItemId", "userId", "customerName"],
  });
  const courierBySaleItemId = new Map(couriers.map((c) => [c.saleItemId, c]));

  const events = allocations
    .map((a) => {
      const courier = courierBySaleItemId.get(a.saleItemId);
      if (!courier || !courier.userId) return null;
      return {
        recipientModule: "couriers",
        recipientUserId: courier.userId,
        type: "BACKORDER_ALLOCATED",
        title: "Product Restocked",
        message: `${product.name} is now back in stock${
          courier.customerName ? ` for ${courier.customerName}` : ""
        }. The pending Courier entry can now be processed.`,
        referenceType: "courier",
        referenceId: courier.id,
        event: "backorder_allocated",
        payload: {
          courierId: courier.id,
          saleId: a.saleId,
          saleItemId: a.saleItemId,
          productId: product.id,
          productName: product.name,
          allocatedQty: a.allocatedQty,
        },
      };
    })
    .filter(Boolean);

  if (events.length) await notify(events);
};

// POST /inventory/receive
// NON_SERIAL / HARDWARE_ORDER_BASED: { productId, quantity, purchasePrice, dealerId, purchaseDate, notes }
// SERIALIZED: { productId, units: [{ serialNumber, purchasePrice, sellingPrice, purchaseDate, dealerId }], notes }
// SOFTWARE: not applicable — rejected below.
exports.receiveStock = async (req, res) => {
  try {
    const user = req.user;
    const { productId, quantity, purchasePrice, dealerId, purchaseDate, notes, units } = req.body || {};

    if (!productId) {
      return res.status(400).json({ success: false, message: "productId is required" });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (product.productType === "SOFTWARE") {
      return res.status(400).json({ success: false, message: "Receive Stock is not applicable to Software products" });
    }

    if (STOCK_TRACKED_TYPES.includes(product.productType)) {
      if (!quantity || parseInt(quantity, 10) < 1) {
        return res.status(400).json({ success: false, message: "quantity >= 1 is required for this product type" });
      }
    } else if (!Array.isArray(units) || units.length === 0) {
      return res.status(400).json({
        success: false,
        message: "units (an array of { serialNumber, purchasePrice, sellingPrice, purchaseDate, dealerId }) is required for SERIALIZED products",
      });
    }

    const result = await inventoryService.receiveStock({
      productId,
      quantity: quantity ? parseInt(quantity, 10) : undefined,
      purchasePrice,
      dealerId,
      purchaseDate,
      notes,
      units,
      userId: user.id,
    });

    await notifyBackorderAllocations(result.allocations, product);

    return res.status(200).json({ success: true, message: "Stock received successfully", data: result });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Duplicate serial number for this product" });
    }
    return errorResponse(res, err);
  }
};

// GET /inventory/serials?productId=&status=&serialNumber=
// serialNumber is a partial, case-insensitive match — serials are only unique per product
// (see serialUnit.model.js), so a search can legitimately return matches across products.
exports.getSerials = async (req, res) => {
  try {
    const { productId, status, serialNumber } = req.query;
    const where = {};
    if (productId) where.productId = productId;
    if (status) where.status = status;
    if (serialNumber && serialNumber.trim()) {
      where.serialNumber = { [Op.like]: `%${serialNumber.trim()}%` };
    }

    const serials = await SerialUnit.findAll({
      where,
      include: [
        { model: Product, attributes: ["id", "name"] },
        { model: Dealer, attributes: ["id", "name"] },
      ],
      order: [["id", "ASC"]],
    });

    return res.status(200).json({ success: true, data: serials });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /inventory/serials/:id — full history for one unit: purchase provenance plus, once
// sold, sale-side info read through saleItem -> sale (never duplicated on the unit itself).
// Mirrors the per-unit shape product.controller.js#getProductById already builds for the
// SERIALIZED product detail table, so the frontend can share one rendering path.
exports.getSerialById = async (req, res) => {
  try {
    const { id } = req.params;
    const serial = await SerialUnit.findByPk(id, {
      include: [
        { model: Product, attributes: ["id", "name"] },
        { model: Dealer, attributes: ["id", "name"] },
        {
          model: SaleItem,
          attributes: ["id", "sellingPrice", "createdAt"],
          include: [{ model: Sale, attributes: ["id", "invoiceNumber", "customerName", "createdAt"] }],
        },
      ],
    });
    if (!serial) {
      return res.status(404).json({ success: false, message: "Serial unit not found" });
    }

    const data = {
      id: serial.id,
      productId: serial.productId,
      productName: serial.Product ? serial.Product.name : null,
      serialNumber: serial.serialNumber,
      status: serial.status,
      purchasePrice: serial.purchasePrice,
      purchaseDate: serial.purchaseDate,
      dealer: serial.Dealer ? { id: serial.Dealer.id, name: serial.Dealer.name } : null,
      receivedAt: serial.receivedAt,
      soldAt: serial.soldAt,
      returnedAt: serial.returnedAt,
      notes: serial.notes,
      // Listed asking price until sold, then the price it actually sold for.
      sellingPrice: serial.SaleItem ? serial.SaleItem.sellingPrice : serial.sellingPrice,
      sellingDate: serial.SaleItem ? serial.SaleItem.createdAt : null,
      customerName: serial.SaleItem && serial.SaleItem.Sale ? serial.SaleItem.Sale.customerName : null,
      invoiceNumber: serial.SaleItem && serial.SaleItem.Sale ? serial.SaleItem.Sale.invoiceNumber : null,
    };

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /inventory/serials/:id — post-return inspection outcome
exports.updateSerialStatus = async (req, res) => {
  try {
    const user = req.user;
    const { id } = req.params;
    const { status, notes } = req.body || {};

    if (!status) {
      return res.status(400).json({ success: false, message: "status is required" });
    }

    const unit = await inventoryService.updateSerialStatus({ serialUnitId: id, status, userId: user.id, notes });
    return res.status(200).json({ success: true, message: "Serial unit updated successfully", data: unit });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /inventory/backorders?productId=&saleId=
exports.getBackorders = async (req, res) => {
  try {
    const { productId, saleId } = req.query;
    const where = {
      fulfillmentStatus: { [Op.in]: ["BACKORDERED", "PARTIALLY_FULFILLED"] },
      backorderedQuantity: { [Op.gt]: 0 },
    };
    if (productId) where.productId = productId;
    if (saleId) where.saleId = saleId;

    const items = await SaleItem.findAll({
      where,
      include: [
        { model: Product, attributes: ["id", "name", "productType"] },
        { model: Sale, attributes: ["id", "invoiceNumber", "customerName", "createdAt"] },
      ],
      order: [
        ["createdAt", "ASC"],
        ["id", "ASC"],
      ],
    });

    return res.status(200).json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
