const { Stock, StockMovement, Product } = require("../models");
const { Op } = require("sequelize");

// GET /stock
exports.getStock = async (req, res) => {
  try {
    const stocks = await Stock.findAll({
      include: {
        model: Product,
        attributes: ["id", "name", "description", "isActive"],
      },
      order: [[Product, "name", "ASC"]],
    });

    const data = stocks.map((s) => ({
      id: s.id,
      productId: s.productId,
      productName: s.Product ? s.Product.name : null,
      productActive: s.Product ? s.Product.isActive : null,
      quantity: s.quantity,
      updatedAt: s.updatedAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /stock/:productId/adjust
// Admin-only manual adjustment — creates StockMovement of type ADJUSTMENT
exports.adjustStock = async (req, res) => {
  try {
    const user = req.user;
    const { productId } = req.params;
    const { quantity, notes } = req.body || {};

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

    let [stock] = await Stock.findOrCreate({
      where: { productId },
      defaults: { productId, quantity: 0 },
    });

    const newQty = Math.max(0, stock.quantity + delta);
    stock.quantity = newQty;
    await stock.save();

    await StockMovement.create({
      productId,
      type: "ADJUSTMENT",
      quantity: delta,
      referenceType: "manual",
      referenceId: null,
      createdBy: user.id,
      notes: notes || `Manual adjustment: ${delta > 0 ? "+" : ""}${delta}`,
    });

    return res.status(200).json({
      success: true,
      message: "Stock adjusted successfully",
      data: { productId: parseInt(productId), productName: product.name, newQuantity: newQty },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
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
