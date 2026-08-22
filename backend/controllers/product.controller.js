const { Product, Stock } = require("../models");

// GET /products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.findAll({
      where: { isActive: true },
      include: {
        model: Stock,
        attributes: ["quantity"],
      },
      order: [["name", "ASC"]],
    });

    // Flatten: attach currentStock quantity directly on product object
    const data = products.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      currentStock: p.Stock ? p.Stock.quantity : 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));

    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /products/:id
exports.getProductById = async (req, res) => {
  try {
    const { id } = req.params;
    const product = await Product.findByPk(id, {
      include: { model: Stock, attributes: ["quantity"] },
    });

    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...product.toJSON(),
        currentStock: product.Stock ? product.Stock.quantity : 0,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /products
exports.createProduct = async (req, res) => {
  try {
    const { name, description } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Product name is required" });
    }

    // Create product
    const product = await Product.create({
      name: name.trim(),
      description: description || null,
    });

    // Initialize stock record at 0
    await Stock.create({ productId: product.id, quantity: 0 });

    return res.status(201).json({
      success: true,
      message: "Product created successfully",
      data: { ...product.toJSON(), currentStock: 0 },
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Product already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /products/:id
exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isActive } = req.body || {};

    const product = await Product.findByPk(id);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    if (name !== undefined) product.name = name.trim();
    if (description !== undefined) product.description = description;
    if (isActive !== undefined) product.isActive = isActive;

    await product.save();

    return res.status(200).json({
      success: true,
      message: "Product updated successfully",
      data: product,
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
