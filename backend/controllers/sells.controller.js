const { Sale, SaleItem, Product, Customer, User, SerialUnit, Courier, Payment, BankAccount, SaleBankAccount } = require("../models");
const sequelize = require("../config/db");
const { Op } = require("sequelize");
const orderService = require("../services/order.service");
const { generateSalesExcel, generateSalesPdf } = require("../services/salesExport.service");
const { canViewAllRecords } = require("../helper/permissionScope");
const { syncIncomeForSaleUpdate } = require("../services/incomeSync.service");
const { recalculateDay } = require("../services/dailyBalance.service");
const customerLedgerService = require("../services/customerLedger.service");

// Attaches each sale's live customer-account balance (advance/pending, carried across ALL of
// that customer's sales — not this sale's own pendingAmount) as `customerLedgerBalance`. One
// batched query for the whole list, not N+1 — see customerLedger.service.js#getCustomerBalances.
const attachLedgerBalances = async (sales) => {
  const customerIds = sales.map((s) => s.customerId).filter(Boolean);
  const balances = await customerLedgerService.getCustomerBalances(customerIds);
  return sales.map((sale) => {
    const json = sale.toJSON ? sale.toJSON() : sale;
    json.customerLedgerBalance = sale.customerId
      ? balances.get(sale.customerId) || { amount: 0, status: "SETTLED", label: "Settled" }
      : null;
    return json;
  });
};

// Attaches `hasCourierEntries` (whether the sale currently has at least one active,
// non-CANCELLED Courier record) — the frontend uses this to correctly initialize the "Create
// Courier Entry" checkbox when opening Edit Sell. One batched query for the whole list, not
// N+1 — see orderService.setCourierEntryForSale for the toggle this flag reflects.
const attachCourierEntryFlags = async (sales) => {
  const saleIds = sales.map((s) => s.id).filter(Boolean);
  if (saleIds.length === 0) return sales;

  const rows = await Courier.findAll({
    where: { saleId: { [Op.in]: saleIds }, status: { [Op.ne]: "CANCELLED" } },
    attributes: ["saleId"],
    group: ["saleId"],
    raw: true,
  });
  const withCourier = new Set(rows.map((r) => r.saleId));

  return sales.map((sale) => {
    sale.hasCourierEntries = withCourier.has(sale.id);
    return sale;
  });
};

const errorResponse = (res, err) => {
  const status = err.statusCode || 500;
  return res.status(status).json({ success: false, message: err.message });
};

/**
 * Builds the Sells list where-clause (ownership scope + platform/paymentMethod/status/city/
 * customerName/date-range filters). Used identically by getSales (list) and exportSales
 * (export) so the table and the exported file can never diverge.
 */
const buildSalesWhere = async (user, query) => {
  const canViewAll = user && (await canViewAllRecords(user, "/sells"));
  const { platform, paymentMethod, status, city, startDate, endDate, customerName, userId, createdBy } = query;

  const where = {};

  // Ownership filter: a viewAllRecords-granted user (Admin or otherwise) can filter by
  // userId/createdBy; everyone else is locked to req.user.id
  if (canViewAll) {
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

  return where;
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
    const where = await buildSalesWhere(user, req.query);

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
        { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
        {
          model: SaleBankAccount,
          as: "bankPayments",
          attributes: ["id", "bankAccountId", "amount"],
          include: [{ model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] }],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    const data = await attachCourierEntryFlags(await attachLedgerBalances(sales));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/export?format=pdf|excel — exports the same filtered dataset as getSales (via
// buildSalesWhere) so the table and the exported file can never diverge.
exports.exportSales = async (req, res) => {
  try {
    const user = req.user;
    const where = await buildSalesWhere(user, req.query);

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
        { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
      ],
      order: [["createdAt", "DESC"]],
    });

    const format = req.query.format === "pdf" ? "pdf" : "excel";
    if (format === "pdf") {
      return generateSalesPdf(sales, res);
    }
    return await generateSalesExcel(sales, res);
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/totals?startDate=&endDate= — date range is optional (all-time totals when
// absent, unchanged from before); when present, narrows the sum the same way buildSalesWhere's
// list/export date filter does, so a dashboard can reuse this one endpoint for "Today"/"This
// month" KPIs instead of needing a separate aggregate per window.
exports.getSellsTotals = async (req, res) => {
  try {
    const user = req.user;
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));
    const { startDate, endDate } = req.query;
    const where = {};

    if (canViewAll) {
      const { userId, createdBy } = req.query;
      const targetUser = userId || createdBy;
      if (targetUser) {
        where.createdBy = targetUser;
      }
    } else {
      where.createdBy = user.id;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
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
        scope: canViewAll ? (where.createdBy ? "USER_FILTERED" : "ALL") : "OWN_ONLY",
      },
    });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /sells/daily-trend?startDate=&endDate= — Sales dashboard revenue trend chart. Same
// ownership scope as getSellsTotals (a non-viewAll user must only ever see their own sales
// here too), grouped by calendar date of createdAt, excluding CANCELLED like every other
// sells total.
exports.getSalesDailyTrend = async (req, res) => {
  try {
    const user = req.user;
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));
    const { startDate, endDate } = req.query;
    const where = { status: { [Op.ne]: "CANCELLED" } };

    if (!canViewAll) {
      where.createdBy = user.id;
    }

    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt[Op.gte] = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt[Op.lte] = end;
      }
    }

    const rows = await Sale.findAll({
      where,
      attributes: [
        [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
        [sequelize.fn("SUM", sequelize.col("sellingAmount")), "totalSelling"],
        [sequelize.fn("COUNT", sequelize.col("id")), "salesCount"],
      ],
      group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
      order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
      raw: true,
    });

    return res.status(200).json({
      success: true,
      data: rows.map((row) => ({
        date: row.date,
        totalSelling: parseFloat(row.totalSelling) || 0,
        salesCount: parseInt(row.salesCount, 10) || 0,
      })),
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
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));

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
        { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
        {
          model: SaleBankAccount,
          as: "bankPayments",
          attributes: ["id", "bankAccountId", "amount"],
          include: [{ model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] }],
        },
        {
          model: Payment,
          as: "payments",
          include: [
            { model: User, as: "creator", attributes: ["id", "name"] },
            { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
          ],
        },
      ],
      order: [[{ model: Payment, as: "payments" }, "createdAt", "ASC"]],
    });

    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    if (!canViewAll && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to view this sale" });
    }

    const [data] = await attachCourierEntryFlags(await attachLedgerBalances([sale]));
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /sells/:id — header edits only, never touches items/stock/fulfillment
exports.updateSale = async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const user = req.user;
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));

    const {
      platform,
      customerId,
      customerName,
      customerNumber,
      paymentMethod,
      bankPayments,
      city,
      fromAddress,
      pincode,
      sellingAmount,
      collectedAmount,
      status,
      notes,
      createCourierEntry,
      to,
      courierName,
      courierCharge,
    } = req.body || {};

    const sale = await Sale.findByPk(id, { transaction: t, lock: true });
    if (!sale) {
      await t.rollback();
      return res.status(404).json({ success: false, message: "Sale not found" });
    }

    if (!canViewAll && sale.createdBy !== user.id) {
      await t.rollback();
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to update this sale" });
    }

    // Captured before any mutation below — used after save() to log the actual change (if any)
    // against Payment history and the customer ledger, same as a real "Record Payment" would.
    const previousCollectedAmount = parseFloat(sale.collectedAmount) || 0;

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
    if (to !== undefined) sale.to = to || "Madhuram Motor";
    if (courierName !== undefined) sale.courierName = courierName || null;

    if (courierCharge !== undefined) {
      const parsedCourierCharge = courierCharge === null || courierCharge === "" ? 0 : parseFloat(courierCharge);
      if (isNaN(parsedCourierCharge) || parsedCourierCharge < 0) {
        await t.rollback();
        return res.status(400).json({ success: false, message: "Courier charge must be a non-negative number" });
      }
      sale.courierCharge = parsedCourierCharge;
    }

    if (sellingAmount !== undefined) sale.sellingAmount = parseFloat(sellingAmount);
    if (collectedAmount !== undefined) sale.collectedAmount = parseFloat(collectedAmount);
    sale.pendingAmount = Math.max(0, parseFloat(sale.sellingAmount) - parseFloat(sale.collectedAmount));
    sale.paymentStatus = orderService.computePaymentStatus({
      sellingAmount: parseFloat(sale.sellingAmount),
      collectedAmount: parseFloat(sale.collectedAmount),
      refundedAmount: parseFloat(sale.refundedAmount),
    });

    // Bank Account field — shown every time regardless of Payment Method, optional, and lets
    // the sale's collected amount be split across multiple bank accounts (each with its own
    // amount — see saleBankAccount.model.js). Validated against the sale's (possibly
    // just-updated) collectedAmount so the rows never claim more than was actually paid.
    // bankAccountId stays in sync as the first allocation's bank for any reader that still
    // uses the legacy single-account column.
    let bankPaymentRows;
    if (bankPayments !== undefined) {
      bankPaymentRows = orderService.normalizeBankPayments(bankPayments, parseFloat(sale.collectedAmount) || 0, sale.paymentMethod);
      sale.bankAccountId = bankPaymentRows[0]?.bankAccountId || null;
    }

    // Keep the customer's ledger debit in sync with this sale's own amount — otherwise editing
    // sellingAmount here leaves the original CustomerLedgerEntry stale and the two screens
    // (Sells vs. Debited/CustomerLedger) silently disagree on how much the customer owes.
    if (sellingAmount !== undefined) {
      await customerLedgerService.updateSaleDebit(sale.id, sale.customerId, sale.sellingAmount, {
        transaction: t,
        userId: user.id,
      });
    }

    await sale.save({ transaction: t });

    if (bankPaymentRows !== undefined) {
      await SaleBankAccount.destroy({ where: { saleId: sale.id }, transaction: t });
      if (bankPaymentRows.length > 0) {
        await SaleBankAccount.bulkCreate(
          bankPaymentRows.map((row) => ({ saleId: sale.id, bankAccountId: row.bankAccountId, amount: row.amount })),
          { transaction: t }
        );
      }
    }

    // Collected Amount is directly editable here (not just via "Record Payment") — e.g. the
    // Sales member finishing a Lead-originated sale that started at ₹0 fills in the actual
    // amount collected right in this form. Log the actual delta as a Payment row (Payment
    // model: "the itemized history that Sale.collectedAmount is the running total of") and a
    // matching customer-ledger entry, so payment history and the customer's running balance
    // never drift from this edit. An increase is a real payment received (recordPayment, same
    // ledger entry type the dedicated "Record Payment" flow creates) — a decrease is a
    // correction, not a payment, so it's logged as an adjustment instead (recordPayment is
    // credit-only and would reject a negative amount).
    const collectedAmountDelta = parseFloat(sale.collectedAmount) - previousCollectedAmount;
    if (collectedAmount !== undefined && Math.abs(collectedAmountDelta) > 0.001) {
      const isPayment = collectedAmountDelta > 0;
      await Payment.create(
        {
          saleId: sale.id,
          amount: collectedAmountDelta,
          method: sale.paymentMethod || null,
          bankAccountId: sale.bankAccountId || null,
          notes: isPayment ? "Payment recorded via sale edit" : "Collected amount corrected via sale edit",
          createdBy: user.id,
        },
        { transaction: t }
      );

      if (sale.customerId) {
        const ledgerRecordFn = isPayment ? customerLedgerService.recordPayment : customerLedgerService.recordAdjustment;
        await ledgerRecordFn(
          {
            customerId: sale.customerId,
            saleId: sale.id,
            amount: collectedAmountDelta,
            paymentMethod: sale.paymentMethod || null,
            bankAccountId: sale.bankAccountId || null,
            note: isPayment ? "Payment recorded via sale edit" : "Collected amount corrected via sale edit",
            userId: user.id,
          },
          { transaction: t }
        );
      }
    }

    // "Create Courier Entry" toggle — create/cancel Courier tracking rows to match, never
    // duplicating an existing one. See orderService.setCourierEntryForSale.
    if (createCourierEntry !== undefined) {
      await orderService.setCourierEntryForSale(
        { saleId: sale.id, createCourierEntry: !!createCourierEntry, userId: user.id },
        { transaction: t }
      );
    }

    // Keep the linked Account → Income entry in sync with this edit (customer/payment/amount,
    // or removed outright if this update just cancelled the sale) — see
    // incomeSync.service.js#syncIncomeForSaleUpdate.
    const incomeEntryDate = await syncIncomeForSaleUpdate(sale, { transaction: t });

    await t.commit();

    if (incomeEntryDate) await recalculateDay(incomeEntryDate);

    return res.status(200).json({ success: true, message: "Sale updated successfully", data: sale });
  } catch (err) {
    if (!t.finished) await t.rollback();
    return errorResponse(res, err);
  }
};

// POST /sells/:id/items — adds a new product line to an existing sale, e.g. a Sales member
// finishing a Lead-originated sale that started with just one placeholder line (see
// lead.controller.js#ensureSaleForLead). Same ownership guard as updateSale.
exports.addSaleItem = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }
    if (!canViewAll && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to update this sale" });
    }

    const { productId, quantity, sellingPrice, serialNumbers } = req.body || {};
    const item = await orderService.addOrderItem({ saleId: sale.id, productId, quantity, sellingPrice, serialNumbers, userId: user.id });
    return res.status(201).json({ success: true, message: "Product added to sale", data: item });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// PUT /sells/:id/items/:itemId — edits an existing line's price and/or quantity (the other half
// of finishing a Sale's product details after the fact — see addSaleItem above).
exports.updateSaleItem = async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const user = req.user;
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }
    if (!canViewAll && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to update this sale" });
    }

    const { quantity, sellingPrice } = req.body || {};
    const item = await orderService.updateOrderItem({ saleId: sale.id, saleItemId: itemId, quantity, sellingPrice, userId: user.id });
    return res.status(200).json({ success: true, message: "Sale item updated", data: item });
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
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));
    const { defective, reason } = req.body || {};

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }
    if (!canViewAll && sale.createdBy !== user.id) {
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
    const canViewAll = user && (await canViewAllRecords(user, "/sells"));

    const sale = await Sale.findByPk(id);
    if (!sale) {
      return res.status(404).json({ success: false, message: "Sale not found" });
    }
    if (!canViewAll && sale.createdBy !== user.id) {
      return res.status(403).json({ success: false, message: "Forbidden: You do not have permission to view this sale's payments" });
    }

    const payments = await Payment.findAll({
      where: { saleId: id },
      include: [
        { model: User, as: "creator", attributes: ["id", "name"] },
        { model: BankAccount, as: "bankAccount", attributes: ["id", "bankName", "accountHolderName", "accountNumber"] },
      ],
      order: [["createdAt", "ASC"]],
    });

    return res.status(200).json({ success: true, data: payments });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// POST /sells/:id/payments
exports.recordPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const { amount, method, bankAccountId, notes } = req.body || {};

    const sale = await orderService.recordPayment({ saleId: id, amount, method, bankAccountId, userId: user.id, notes });
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
