const { Sale, SaleItem, Product, Stock, StockMovement, Notification, User, Customer } = require("../models");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const { getIO } = require("../socket");

/**
 * Generate a sequential invoice number: MM-YYYYMM-XXXX
 * e.g. MM-202608-0001
 */
const generateInvoiceNumber = async (t) => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  const prefix = `MM-${year}${month}`;

  const lastSale = await Sale.findOne({
    where: { invoiceNumber: { [Op.like]: `${prefix}-%` } },
    order: [["id", "DESC"]],
    lock: true,
    transaction: t,
  });

  let seq = 1;
  if (lastSale && lastSale.invoiceNumber) {
    const parts = lastSale.invoiceNumber.split("-");
    seq = parseInt(parts[parts.length - 1]) + 1;
  }

  return `${prefix}-${String(seq).padStart(4, "0")}`;
};

// POST /sales
exports.createSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const user = req.user;
    const {
      platform,
      customerId: inputCustomerId,
      customerName,
      customerNumber,
      paymentMethod,
      city,
      fromAddress,
      pincode,
      sellingAmount,
      collectedAmount,
      notes,
      items, // Array of { productId, quantity, sellingPrice }
    } = req.body || {};

    // ── Validation ────────────────────────────────────────────
    if (!customerName || !customerName.trim()) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "Customer name is required" });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      await t.rollback();
      return res.status(400).json({ success: false, message: "At least one sale item is required" });
    }
    for (const item of items) {
      if (!item.productId || !item.quantity || item.quantity < 1) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Each item must have a valid productId and quantity ≥ 1" });
      }
    }

    const selling = parseFloat(sellingAmount) || 0;
    const collected = parseFloat(collectedAmount) || 0;
    // Backend-enforced: never trust frontend for pendingAmount
    const pending = Math.max(0, selling - collected);

    // ── Customer Resolution / Creation (Transactional) ────────
    let finalCustomerId = inputCustomerId || null;
    const trimmedPhone = customerNumber ? customerNumber.trim() : null;

    if (finalCustomerId) {
      // Validate provided customerId
      const existingCustomer = await Customer.findByPk(finalCustomerId, { transaction: t, lock: true });
      if (!existingCustomer) {
        finalCustomerId = null;
      }
    }

    if (!finalCustomerId && trimmedPhone) {
      // Find existing customer by phone within transaction
      let customer = await Customer.findOne({
        where: {
          [Op.or]: [
            { phone: trimmedPhone },
            { phone: { [Op.like]: `%${trimmedPhone.slice(-10)}` } },
          ],
        },
        transaction: t,
        lock: true,
      });

      if (customer) {
        finalCustomerId = customer.id;
        // Optionally update any missing fields on existing customer
        let needsUpdate = false;
        if (!customer.address && fromAddress) {
          customer.address = fromAddress.trim();
          needsUpdate = true;
        }
        if (!customer.city && city) {
          customer.city = city.trim();
          needsUpdate = true;
        }
        if (!customer.pincode && pincode) {
          customer.pincode = pincode.trim();
          needsUpdate = true;
        }
        if (needsUpdate) {
          await customer.save({ transaction: t });
        }
      } else {
        // Create new Customer record within transaction
        const newCustomer = await Customer.create(
          {
            name: customerName.trim(),
            phone: trimmedPhone,
            address: fromAddress ? fromAddress.trim() : null,
            city: city ? city.trim() : null,
            pincode: pincode ? pincode.trim() : null,
            createdBy: user.id,
          },
          { transaction: t }
        );
        finalCustomerId = newCustomer.id;
      }
    }

    // ── Generate invoice number ────────────────────────────────
    const invoiceNumber = await generateInvoiceNumber(t);

    // ── Create Sale ────────────────────────────────────────────
    const sale = await Sale.create(
      {
        invoiceNumber,
        platform: platform || null,
        customerId: finalCustomerId,
        customerName: customerName.trim(),
        customerNumber: trimmedPhone,
        paymentMethod: paymentMethod || null,
        city: city || null,
        fromAddress: fromAddress || null,
        pincode: pincode || null,
        sellingAmount: selling,
        collectedAmount: collected,
        pendingAmount: pending,
        status: "PENDING",
        notes: notes || null,
        createdBy: user.id,
      },
      { transaction: t }
    );

    // ── Process each sale item ─────────────────────────────────
    const saleItemsResult = [];

    for (const item of items) {
      // Verify product exists
      const product = await Product.findByPk(item.productId, { transaction: t });
      if (!product) {
        await t.rollback();
        return res.status(404).json({
          success: false,
          message: `Product ID ${item.productId} not found`,
        });
      }

      // Find or create stock record for this product
      let [stock] = await Stock.findOrCreate({
        where: { productId: item.productId },
        defaults: { productId: item.productId, quantity: 0 },
        transaction: t,
        lock: true,
      });

      const requested = parseInt(item.quantity);
      const available = stock.quantity;

      // Determine how much can be fulfilled
      const canFulfill = Math.min(available, requested);
      const shortage = requested - canFulfill;

      let fulfillmentStatus = "FULFILLED";
      if (canFulfill === 0) {
        fulfillmentStatus = "OUT_OF_STOCK";
      } else if (shortage > 0) {
        fulfillmentStatus = "PARTIAL";
      }

      // Create SaleItem — shortageQuantity records the gap
      const saleItem = await SaleItem.create(
        {
          saleId: sale.id,
          productId: item.productId,
          quantity: requested,
          sellingPrice: parseFloat(item.sellingPrice) || 0,
          fulfillmentStatus,
          shortageQuantity: shortage,
        },
        { transaction: t }
      );

      // Deduct only the available stock (never go negative)
      if (canFulfill > 0) {
        stock.quantity = available - canFulfill;
        await stock.save({ transaction: t });
      }

      // Create StockMovement audit record
      await StockMovement.create(
        {
          productId: item.productId,
          type: "SALE",
          quantity: -canFulfill, // negative = stock out
          referenceType: "sale",
          referenceId: sale.id,
          createdBy: user.id,
          notes: `Sale ${invoiceNumber} — ${product.name} × ${requested}${shortage > 0 ? ` (shortage: ${shortage})` : ""}`,
        },
        { transaction: t }
      );

      saleItemsResult.push({
        ...saleItem.toJSON(),
        productName: product.name,
        availableWas: available,
        fulfilled: canFulfill,
        shortage,
        fulfillmentStatus,
      });
    }

    // ── COMMIT ─────────────────────────────────────────────────
    await t.commit();

    // ── Build notification payload (after commit) ──────────────
    const productSummary = saleItemsResult
      .map((i) => `${i.productName} × ${i.quantity}`)
      .join(", ");

    const courierNotifData = {
      recipientModule: "couriers",
      type: "NEW_SALE",
      title: "New Sales Entry",
      message: `Customer: ${customerName}\nCity: ${city || "—"}\nProducts: ${productSummary}\nAmount: ₹${selling.toFixed(2)}\nPayment: ${paymentMethod || "—"}`,
      referenceType: "sale",
      referenceId: sale.id,
    };

    const accountNotifData = {
      recipientModule: "account",
      type: "NEW_SALE",
      title: "New Sales Entry",
      message: `Customer: ${customerName}\nSelling: ₹${selling.toFixed(2)}\nCollected: ₹${collected.toFixed(2)}\nPending: ₹${pending.toFixed(2)}\nPayment: ${paymentMethod || "—"}`,
      referenceType: "sale",
      referenceId: sale.id,
    };

    // Persist notifications
    const [courierNotif, accountNotif] = await Promise.all([
      Notification.create(courierNotifData),
      Notification.create(accountNotifData),
    ]);

    // Emit real-time WebSocket events
    try {
      const io = getIO();
      io.to("couriers").emit("new_sale", {
        notification: courierNotif,
        sale: { id: sale.id, invoiceNumber, customerName, city },
      });
      io.to("account").emit("new_sale", {
        notification: accountNotif,
        sale: { id: sale.id, invoiceNumber, customerName, sellingAmount: selling, collectedAmount: collected, pendingAmount: pending },
      });
    } catch (socketErr) {
      // WebSocket failure must NOT affect the HTTP response
      console.warn("WebSocket emit failed:", socketErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "Sale created successfully",
      data: {
        ...sale.toJSON(),
        items: saleItemsResult,
      },
    });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /sales
exports.getSales = async (req, res) => {
  try {
    const {
      platform,
      paymentMethod,
      status,
      city,
      startDate,
      endDate,
      customerName,
    } = req.query;

    const where = {};
    if (platform) where.platform = { [Op.like]: `%${platform}%` };
    if (paymentMethod) where.paymentMethod = paymentMethod;
    if (status) where.status = status;
    if (city) where.city = { [Op.like]: `%${city}%` };
    if (customerName) where.customerName = { [Op.like]: `%${customerName}%` };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    const sales = await Sale.findAll({
      where,
      include: [
        {
          model: Customer,
          as: "customer",
          attributes: ["id", "name", "phone", "email", "address", "city", "pincode"],
        },
        {
          model: SaleItem,
          as: "items",
          include: [{ model: Product, attributes: ["id", "name"] }],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: sales });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /sales/:id
exports.getSaleById = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByPk(id, {
      include: [
        {
          model: Customer,
          as: "customer",
          attributes: ["id", "name", "phone", "email", "address", "city", "pincode"],
        },
        {
          model: SaleItem,
          as: "items",
          include: [{ model: Product, attributes: ["id", "name", "description"] }],
        },
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"],
        },
      ],
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    return res.status(200).json({ success: true, data: sale });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /sales/:id
exports.updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      platform,
      customerId,
      customerName,
      customerNumber,
      paymentMethod,
      city,
      fromAddress,
      pincode,
      sellingAmount,
      collectedAmount,
      status,
      notes,
    } = req.body || {};

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    if (platform !== undefined) sale.platform = platform;
    if (customerId !== undefined) sale.customerId = customerId;
    if (customerName !== undefined) sale.customerName = customerName;
    if (customerNumber !== undefined) sale.customerNumber = customerNumber;
    if (paymentMethod !== undefined) sale.paymentMethod = paymentMethod;
    if (city !== undefined) sale.city = city;
    if (fromAddress !== undefined) sale.fromAddress = fromAddress;
    if (pincode !== undefined) sale.pincode = pincode;
    if (status !== undefined) sale.status = status;
    if (notes !== undefined) sale.notes = notes;

    // Recompute pending if amounts changed
    if (sellingAmount !== undefined) sale.sellingAmount = parseFloat(sellingAmount);
    if (collectedAmount !== undefined) sale.collectedAmount = parseFloat(collectedAmount);
    sale.pendingAmount = Math.max(0, parseFloat(sale.sellingAmount) - parseFloat(sale.collectedAmount));

    await sale.save();

    return res.status(200).json({
      success: true,
      message: "Sale updated successfully",
      data: sale,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /sales/:id
exports.deleteSale = async (req, res) => {
  try {
    const { id } = req.params;

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    // Soft-delete: mark as CANCELLED to preserve audit trail
    sale.status = "CANCELLED";
    await sale.save();

    return res.status(200).json({
      success: true,
      message: "Sale cancelled successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
