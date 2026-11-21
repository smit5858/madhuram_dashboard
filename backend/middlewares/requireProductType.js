const { Product } = require("../models");

// Scopes a product route group (e.g. /software) to a single product type, so a permission on
// that route can't be used to read or change products of other types.
// - Routes with :id: 404 unless the product exists and has this type.
// - POST: forces body.productType to this type.
module.exports = (productType) => async (req, res, next) => {
  try {
    if (req.method === "POST") {
      req.body = { ...(req.body || {}), productType };
      return next();
    }

    if (req.params.id !== undefined) {
      const product = await Product.findByPk(req.params.id, { attributes: ["id", "productType"] });
      if (!product || product.productType !== productType) {
        return res.status(404).json({ success: false, message: "Product not found" });
      }
    }

    next();
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
