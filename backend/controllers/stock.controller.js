const { Stock, StockMovement, Product } = require("../models");
const inventoryService = require("../services/inventory.service");

// GET /stock
exports.getStock = async (req, res) => {
  try {
    const stocks = await Stock.findAll({
      include: {
        model: Product,
        attributes: ["id", "name", "description", "isActive", "productType"],
      },
      order: [[Product, "name", "ASC"]],
    });

    const data = stocks.map((s) => ({
      id: s.id,
      productId: s.productId,
      productName: s.Product ? s.Product.name : null,
      productType: s.Product ? s.Product.productType : null,
      productActive: s.Product ? s.Product.isActive : null,
      quantity: s.quantity,
      reserved: s.reserved,
      available: s.quantity - s.reserved,
      updatedAt: s.updatedAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /stock/:productId/adjust
// Manual adjustment — creates StockMovement of type ADJUSTMENT (or DAMAGE)
exports.adjustStock = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;
    const { quantity, notes, reason } = req.body || {};

    if (quantity === undefined || quantity === null) {
      return res.status(400).json({ success: false, message: "quantity is required" });
    }
    const delta = parseInt(quantity);
    if (isNaN(delta)) {
      return res.status(400).json({ success: false, message: "quantity must be an integer" });
    }

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const result = await inventoryService.adjustStock({ productId, delta, userId: user.id, notes, reason });

    return res.status(200).json({
      success: true,
      message: "Stock adjusted successfully",
      data: { ...result, productName: product.name },
    });
  } catch (err) {
    const status = err.statusCode || (err.message && /negative|reserved|not carry/.test(err.message) ? 400 : 500);
    return res.status(status).json({ success: false, message: err.message });
  }
};

// GET /stock/:productId/movements
exports.getStockMovements = async (req, res) => {
  try {
    const { productId } = req.params;

    const product = await Product.findByPk(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const movements = await StockMovement.findAll({
      where: { productId },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: movements });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
