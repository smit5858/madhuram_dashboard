const { Sale, SaleItem, Product, Customer, User, SerialUnit, Courier, Payment } = require("../models");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const orderService = require("../services/order.service");

const errorResponse = (res, err) => {
  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message });
};

// POST /sells
exports.createSale = async (req, res) => {
  try {
    const user = req.user;
    const sale = await orderService.createOrder({ ...req.body, userId: user.id });
    return res.status(201).json({ success: true, message: "Sale created successfully", data: sale });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells
exports.getSales = async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";

    const { platform, paymentMethod, status, city, startDate, endDate, customerName, userId, createdBy } = req.query;

    const where = {};

    // Ownership filter: Admin can filter by userId/createdBy; Sales users are locked to req.user.id
    if (isAdmin) {
      const targetUser = userId || createdBy;
      if (targetUser) {
        where.createdBy = targetUser;
      }
    } else {
      where.createdBy = user.id;
    }

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
        { model: Customer, as: "customer", attributes: ["id", "name", "phone", "email", "address", "city", "pincode"] },
        {
          model: SaleItem,
          as: "items",
          include: [{ model: Product, attributes: ["id", "name", "productType"] }],
        },
        { model: User, as: "creator", attributes: ["id", "name", "email"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({ success: true, data: sales });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/totals
exports.getSellsTotals = async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";
    const where = {};

    if (isAdmin) {
      const { userId, createdBy } = req.query;
      const targetUser = userId || createdBy;
      if (targetUser) {
        where.createdBy = targetUser;
      }
    } else {
      where.createdBy = user.id;
    }

    const totals = await Sale.findAll({
      where: {
        ...where,
        status: { [Op.ne]: "CANCELLED" },
      },
      attributes: [
        [sequelize.fn("SUM", sequelize.col("sellingAmount")), "totalSellingAmount"],
        [sequelize.fn("SUM", sequelize.col("collectedAmount")), "totalCollectedAmount"],
        [sequelize.fn("SUM", sequelize.col("pendingAmount")), "totalPendingAmount"],
        [sequelize.fn("COUNT", sequelize.col("id")), "totalSalesCount"],
      ],
      raw: true,
    });

    const result = totals[0] || {};
    return res.status(200).json({
      success: true,
      data: {
        totalSellingAmount: parseFloat(result.totalSellingAmount) || 0,
        totalCollectedAmount: parseFloat(result.totalCollectedAmount) || 0,
        totalPendingAmount: parseFloat(result.totalPendingAmount) || 0,
        totalSalesCount: parseInt(result.totalSalesCount, 10) || 0,
        scope: isAdmin ? (where.createdBy ? "USER_FILTERED" : "ALL") : "OWN_ONLY",
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/:id
exports.getSaleById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";

    const sale = await Sale.findByPk(id, {
      include: [
        { model: Customer, as: "customer", attributes: ["id", "name", "phone", "email", "address", "city", "pincode"] },
        {
          model: SaleItem,
          as: "items",
          include: [
            { model: Product, attributes: ["id", "name", "description", "productType"] },
            { model: SerialUnit, attributes: ["id", "serialNumber", "status"] },
            { model: Courier, attributes: ["id", "courierName", "trackId", "pending", "completedDate", "quantity"] },
          ],
        },
        { model: User, as: "creator", attributes: ["id", "name", "email"] },
        {
          model: Payment,
          as: "payments",
          include: [{ model: User, as: "creator", attributes: ["id", "name"] }],
        },
      ],
      order: [[{ model: Payment, as: "payments" }, "createdAt", "ASC"]],
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    if (!isAdmin && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to view this sale" });
    }

    return res.status(200).json({ success: true, data: sale });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /sells/:id — header edits only, never touches items/stock/fulfillment
exports.updateSale = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";

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

    if (!isAdmin && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to update this sale" });
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

    if (sellingAmount !== undefined) sale.sellingAmount = parseFloat(sellingAmount);
    if (collectedAmount !== undefined) sale.collectedAmount = parseFloat(collectedAmount);
    sale.pendingAmount = Math.max(0, parseFloat(sale.sellingAmount) - parseFloat(sale.collectedAmount));
    sale.paymentStatus = orderService.computePaymentStatus({
      sellingAmount: parseFloat(sale.sellingAmount),
      collectedAmount: parseFloat(sale.collectedAmount),
      refundedAmount: parseFloat(sale.refundedAmount),
    });

    await sale.save();

    return res.status(200).json({ success: true, message: "Sale updated successfully", data: sale });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// DELETE /sells/:id — cancels the order, releasing/writing-off any reservation and
// returning/writing-off any already-shipped portion. body: { defective?, reason? }
exports.deleteSale = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";
    const { defective, reason } = req.body || {};

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }
    if (!isAdmin && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to cancel this sale" });
    }

    await orderService.cancelOrder({ saleId: id, userId: user.id, defective: !!defective, reason });

    return res.status(200).json({ success: true, message: "Sale cancelled successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/:id/payments
exports.getPayments = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }
    if (!isAdmin && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to view this sale's payments" });
    }

    const payments = await Payment.findAll({
      where: { saleId: id },
      include: [{ model: User, as: "creator", attributes: ["id", "name"] }],
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({ success: true, data: payments });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/payments?search=&start_date=&end_date=&page=&limit=
// Cross-sale ledger of every payment collected (Account section). Non-admin users only see
// payments on sales they created, matching the ownership scoping used by getSales/getPayments.
exports.getAllPayments = async (req, res) => {
  try {
    const user = req.user;
    const isAdmin = user && user.roleName === "Admin";
    const { search, start_date, end_date, page, limit } = req.query;

    const where = {};
    if (start_date || end_date) {
      where.createdAt = {};
      if (start_date) where.createdAt[Op.gte] = new Date(start_date);
      if (end_date) {
        const end = new Date(end_date);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    const saleWhere = {};
    if (!isAdmin) saleWhere.createdBy = user.id;
    if (search && search.trim()) {
      saleWhere.customerName = { [Op.like]: `%${search.trim()}%` };
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Payment.findAndCountAll({
      where,
      include: [
        { model: Sale, where: saleWhere, attributes: ["id", "customerName", "sellingAmount", "paymentStatus"] },
        { model: User, as: "creator", attributes: ["id", "name"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset,
      distinct: true,
    });

    return res.status(200).json({
      success: true,
      data: rows,
      meta: {
        page: pageNum,
        limit: limitNum,
        total: count,
        totalPages: Math.ceil(count / limitNum) || 1,
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /sells/:id/payments
exports.recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { amount, method, notes } = req.body || {};

    const sale = await orderService.recordPayment({ saleId: id, amount, method, userId: user.id, notes });
    return res.status(200).json({ success: true, message: "Payment recorded successfully", data: sale });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /sells/:id/items/:itemId/return
exports.returnOrderItem = async (req, res) => {
  try {
    const { itemId } = req.params;
    const user = req.user;
    const { quantity, reason, refundAmount, serialNumbers, defective } = req.body || {};

    const item = await orderService.returnItem({
      saleItemId: itemId,
      quantity,
      reason,
      refundAmount,
      serialNumbers,
      defective: !!defective,
      userId: user.id,
    });
    return res.status(200).json({ success: true, message: "Return recorded successfully", data: item });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /sells/:id/items/:itemId/cancel
exports.cancelOrderItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const user = req.user;
    const { reason, defective } = req.body || {};

    const item = await orderService.cancelOrderItem({ saleId: id, saleItemId: itemId, reason, defective: !!defective, userId: user.id });
    return res.status(200).json({ success: true, message: "Order item cancelled successfully", data: item });
  } catch (err) {
    return errorResponse(res, err);
  }
};
