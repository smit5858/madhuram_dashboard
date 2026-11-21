const fs = require("fs");
const path = require("path");
const { Op } = require("sequelize");
const sequelize = require("../config/db");
const { Product, ProductImage } = require("../models");
const logger = require("../helper/logger");

// Product photos are stored in the product_images table (binary `data` column), up to
// MAX_IMAGES_PER_PRODUCT per product. List/detail queries only ever read the light columns
// (REF_ATTRS); the binary is served one photo at a time by GET /products/:id/images/:imageId.
// The photo with the lowest sortOrder is the cover (shown first, used as the share PDF hero).
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_PRODUCT = 4;
const REF_ATTRS = ["id", "productId", "sortOrder"];
const ORDER = [
  ["sortOrder", "ASC"],
  ["id", "ASC"],
];

// Pre-DB location of product photos — only read by migrateLegacyProductImageFiles below.
const LEGACY_UPLOAD_DIR = path.join(__dirname, "../uploads/products");

const httpError = (message, statusCode) => Object.assign(new Error(message), { statusCode });

// JPEG/PNG only — the two formats pdfkit can embed in the shared catalogue PDF. Checked by magic
// bytes, not the client-supplied Content-Type.
const detectImageType = (buf) => {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: "jpg", mime: "image/jpeg" };
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: "png", mime: "image/png" };
  return null;
};

const validateImageBuffer = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) throw httpError("No image received", 400);
  if (buffer.length > MAX_IMAGE_BYTES) throw httpError("Image must be 5 MB or smaller", 413);
  const type = detectImageType(buffer);
  if (!type) throw httpError("Only JPEG or PNG images are supported", 400);
  return type;
};

const toRef = (row) => ({ id: row.id });

/** Ordered photo refs ({ id }) of one product — cover first. Never loads the binary. */
const listProductImages = async (productId, { transaction } = {}) =>
  (await ProductImage.findAll({ where: { productId }, attributes: REF_ATTRS, order: ORDER, transaction })).map(toRef);

/** Bulk version for a page of products: { [productId]: [{ id }, …] } in one query. */
const getImagesForProducts = async (productIds) => {
  if (!productIds.length) return {};
  const rows = await ProductImage.findAll({ where: { productId: { [Op.in]: productIds } }, attributes: REF_ATTRS, order: ORDER });
  const byProduct = {};
  for (const row of rows) (byProduct[row.productId] ||= []).push(toRef(row));
  return byProduct;
};

/** Validates and appends a photo (as the last one). Rejects once the product has MAX_IMAGES_PER_PRODUCT. */
const addProductImage = async (productId, buffer) => {
  const type = validateImageBuffer(buffer);
  return sequelize.transaction(async (transaction) => {
    // Lock the product row so two concurrent uploads can't both pass the limit check.
    const product = await Product.findByPk(productId, { attributes: ["id"], transaction, lock: transaction.LOCK.UPDATE });
    if (!product) throw httpError("Product not found", 404);

    const existing = await ProductImage.findAll({ where: { productId }, attributes: REF_ATTRS, transaction });
    if (existing.length >= MAX_IMAGES_PER_PRODUCT) {
      throw httpError(`A product can have at most ${MAX_IMAGES_PER_PRODUCT} photos — remove one first`, 400);
    }
    const nextOrder = existing.reduce((max, r) => Math.max(max, r.sortOrder), -1) + 1;
    await ProductImage.create({ productId, data: buffer, mimeType: type.mime, size: buffer.length, sortOrder: nextOrder }, { transaction });
    return listProductImages(productId, { transaction });
  });
};

/** One photo including its binary, or null. */
const getProductImage = (productId, imageId) => ProductImage.findOne({ where: { id: imageId, productId } });

const deleteProductImage = async (productId, imageId) => {
  const deleted = await ProductImage.destroy({ where: { id: imageId, productId } });
  if (!deleted) throw httpError("Photo not found", 404);
  return listProductImages(productId);
};

/** Makes `imageId` the cover (first) photo; the others keep their relative order. */
const setCoverImage = async (productId, imageId) =>
  sequelize.transaction(async (transaction) => {
    const refs = await listProductImages(productId, { transaction });
    if (!refs.some((r) => r.id === Number(imageId))) throw httpError("Photo not found", 404);
    const ordered = [Number(imageId), ...refs.map((r) => r.id).filter((id) => id !== Number(imageId))];
    await Promise.all(ordered.map((id, i) => ProductImage.update({ sortOrder: i }, { where: { id }, transaction })));
    return listProductImages(productId, { transaction });
  });

/** Binaries of a product's photos in display order (cover first) — for the share PDF. */
const getProductImageBuffers = async (productId) =>
  (await ProductImage.findAll({ where: { productId }, attributes: ["id", "data"], order: ORDER })).map((r) => r.data);

/**
 * One-time move of photos saved by the old file-based implementation (products.imageFile →
 * backend/uploads/products/<file>) into product_images. Runs on every server start; it's a no-op
 * once no product has imageFile set. A file is deleted only after its DB row is committed.
 */
const migrateLegacyProductImageFiles = async () => {
  const products = await Product.findAll({ where: { imageFile: { [Op.ne]: null } }, attributes: ["id", "imageFile"] });
  for (const product of products) {
    const filePath = path.join(LEGACY_UPLOAD_DIR, path.basename(product.imageFile));
    try {
      if (fs.existsSync(filePath)) {
        const buffer = fs.readFileSync(filePath);
        const type = detectImageType(buffer);
        if (type && buffer.length <= MAX_IMAGE_BYTES) {
          await sequelize.transaction(async (transaction) => {
            const count = await ProductImage.count({ where: { productId: product.id }, transaction });
            if (count < MAX_IMAGES_PER_PRODUCT) {
              await ProductImage.create({ productId: product.id, data: buffer, mimeType: type.mime, size: buffer.length, sortOrder: count }, { transaction });
            }
            await Product.update({ imageFile: null }, { where: { id: product.id }, transaction });
          });
          fs.promises.unlink(filePath).catch(() => {});
          logger.info(`Moved product ${product.id} photo into the database`);
          continue;
        }
      }
      // Missing or unusable file — nothing to move, just clear the stale reference.
      await Product.update({ imageFile: null }, { where: { id: product.id } });
    } catch (err) {
      logger.error(`Failed to move product ${product.id} photo into the database: ${err.message}`);
    }
  }
};

module.exports = {
  MAX_IMAGE_BYTES,
  MAX_IMAGES_PER_PRODUCT,
  detectImageType,
  listProductImages,
  getImagesForProducts,
  addProductImage,
  getProductImage,
  deleteProductImage,
  setCoverImage,
  getProductImageBuffers,
  migrateLegacyProductImageFiles,
};
