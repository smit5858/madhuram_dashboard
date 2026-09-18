const { Op } = require("sequelize");
const dayjs = require("dayjs");
const { AccountEntry, SaleItem, Product, SerialUnit } = require("../models");

/**
 * Income keeps exactly one row per Sale (see order.service.js#createOrder), so a multi-item
 * order gets a single joined summary rather than one Income row per line item.
 */
const buildSaleProductSummary = async (saleId, { transaction } = {}) => {
  const items = await SaleItem.findAll({
    where: { saleId },
    include: [{ model: Product, attributes: ["id", "name"] }],
    transaction,
  });

  const productName = items.map((i) => `${i.Product?.name || "Item"} x${i.quantity}`).join(", ") || null;

  const saleItemIds = items.map((i) => i.id);
  let serialNumber = null;
  if (saleItemIds.length > 0) {
    const units = await SerialUnit.findAll({
      where: { saleItemId: { [Op.in]: saleItemIds }, status: { [Op.in]: ["RESERVED", "SOLD"] } },
      attributes: ["serialNumber"],
      transaction,
    });
    serialNumber = units.map((u) => u.serialNumber).join(", ") || null;
  }

  return { productName, serialNumber };
};

/**
 * Creates the Income entry for a brand-new Sale. Called once, inside the SAME transaction as
 * the Sale's own creation (see order.service.js#createOrder) so Sale + Income are one atomic
 * write — if Income creation fails, the whole order rolls back too.
 *
 * Returns the entryDate the caller should pass to dailyBalance.service#recalculateDay AFTER
 * its transaction commits (kept out of this transaction deliberately, matching the existing
 * courier.controller.js#completeIncomingCourier pattern, so the shared per-day balance row
 * isn't locked for the whole (potentially slower) order-creation transaction).
 */
const createIncomeForSale = async (sale, { transaction, userId }) => {
  const { productName, serialNumber } = await buildSaleProductSummary(sale.id, { transaction });
  const entryDate = dayjs().format("YYYY-MM-DD");

  await AccountEntry.create(
    {
      entryType: "INCOME",
      category: "Sale",
      customerId: sale.customerId || null,
      customerName: sale.customerName,
      customerPhone: sale.customerNumber || null,
      productName,
      serialNumber,
      // Income = cash actually received, not the full order value — a partially-paid order's
      // Income row starts at whatever was collected up front (0 for one with nothing collected yet).
      amount: parseFloat(sale.collectedAmount) || 0,
      entryDate,
      paymentMethod: sale.paymentMethod || null,
      referenceType: "sale",
      referenceId: sale.id,
      // Selling entries go through the same Admin-approval workflow as auto-created expenses —
      // it must not count toward Total Income / Total In until approved (see
      // income.controller.js#approveIncome).
      status: "PENDING",
      createdBy: userId,
    },
    { transaction }
  );

  return entryDate;
};

/**
 * Keeps the linked Income entry in sync with a header-field edit to a Sale (see
 * sells.controller.js#updateSale). Only customer/payment/amount fields are touched —
 * product/serial summaries and entryDate are never changed here, since updateSale can't edit
 * order items and the entry should keep recording when the sale was originally made.
 * If the sale was just cancelled, the linked entry is removed instead (see removeIncomeForSale
 * for the same behavior from the dedicated cancel flow).
 *
 * Returns the entryDate that needs recalculating (or null if nothing changed).
 */
const syncIncomeForSaleUpdate = async (sale, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: "sale", referenceId: sale.id },
    transaction,
  });

  if (sale.status === "CANCELLED") {
    if (!existing) return null;
    const { entryDate } = existing;
    await existing.destroy({ transaction });
    return entryDate;
  }

  if (existing) {
    existing.customerId = sale.customerId || null;
    existing.customerName = sale.customerName;
    existing.customerPhone = sale.customerNumber || null;
    existing.amount = parseFloat(sale.collectedAmount) || 0;
    existing.paymentMethod = sale.paymentMethod || null;
    await existing.save({ transaction });
    return existing.entryDate;
  }

  // No linked entry yet (e.g. this sale predates the Sell → Income feature) — create one now
  // rather than leaving it permanently missing from Income/the daily balance.
  return createIncomeForSale(sale, { transaction, userId: sale.createdBy });
};

/**
 * Removes the linked Income entry when a Sale is cancelled (order.service.js#cancelOrder) so
 * the daily balance never keeps counting income for an order that no longer stands.
 * Returns the removed entry's date (for recalculation) or null if there was nothing linked.
 */
const removeIncomeForSale = async (saleId, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: "sale", referenceId: saleId },
    transaction,
  });
  if (!existing) return null;
  const { entryDate } = existing;
  await existing.destroy({ transaction });
  return entryDate;
};

/**
 * Creates the Income entry for a customer ledger payment collected by an Accountant/Admin (see
 * customerLedger.controller.js#recordPayment) — same PENDING-until-approved workflow as a Sale's
 * own auto-created Income entry (see createIncomeForSale above), linked via referenceType
 * "customerLedgerEntry" so it shows up in the ordinary Income list/approval flow with zero
 * frontend changes.
 */
const createIncomeForLedgerPayment = async (
  { ledgerEntryId, customerId, customerName, customerPhone, amount, paymentMethod, entryDate, userId },
  { transaction }
) => {
  await AccountEntry.create(
    {
      entryType: "INCOME",
      category: "Customer Payment",
      customerId: customerId || null,
      customerName,
      customerPhone: customerPhone || null,
      amount,
      entryDate,
      paymentMethod: paymentMethod || null,
      referenceType: "customerLedgerEntry",
      referenceId: ledgerEntryId,
      status: "PENDING",
      createdBy: userId,
    },
    { transaction }
  );

  return entryDate;
};

/**
 * Keeps the linked Income entry in sync with an edit to its source ledger entry (see
 * customerLedger.controller.js#updateEntry) — same reasoning as syncIncomeForSaleUpdate: one
 * source of truth for amount/date/method, no drift between the ledger and the Income list.
 * Returns the entryDate to recalculate, or null if there was nothing linked.
 */
const syncIncomeForLedgerEntryUpdate = async (ledgerEntry, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: "customerLedgerEntry", referenceId: ledgerEntry.id },
    transaction,
  });
  if (!existing) return null;

  existing.amount = Math.abs(parseFloat(ledgerEntry.amount) || 0);
  existing.paymentMethod = ledgerEntry.paymentMethod || null;
  existing.entryDate = ledgerEntry.transactionDate;
  await existing.save({ transaction });
  return existing.entryDate;
};

/**
 * Removes the linked Income entry when its source ledger entry is hard-deleted (see
 * customerLedger.controller.js#deleteEntry) — mirrors removeIncomeForSale. Returns the removed
 * entry's date (for recalculation) or null if there was nothing linked.
 */
const removeIncomeForLedgerEntry = async (ledgerEntryId, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: "customerLedgerEntry", referenceId: ledgerEntryId },
    transaction,
  });
  if (!existing) return null;
  const { entryDate } = existing;
  await existing.destroy({ transaction });
  return entryDate;
};

/**
 * A manually-created Outgoing Courier only ever needs an Income row while it actually
 * represents money coming in: Outgoing direction, not a free pickup, a positive charge, and not
 * sale-linked — a sale-linked Courier row (order.service.js#createOrder) already has its charge
 * folded into the Sale's own single Income entry (see createIncomeForSale/computeOrderTotal in
 * order.service.js), so giving it a second Income row here would double-count the same charge.
 */
const shouldHaveCourierIncome = (courier) =>
  courier.direction === "OUT" && !courier.saleId && !courier.freePickup && (parseFloat(courier.charge) || 0) > 0;

/**
 * Packs the Courier details that AccountEntry has no dedicated column for (company, city,
 * direction, quantity, tracking, notes) into the Income entry's free-text description — same
 * approach courier.controller.js#completeIncomingCourier already uses for the mirrored Expense
 * entry it creates for an Incoming courier.
 */
const buildCourierIncomeDescription = (courier) => {
  const parts = [`Outgoing courier charge — ${courier.customerName || courier.name || "Unknown customer"}`];
  if (courier.quantity) parts.push(`Qty: ${courier.quantity}`);
  if (courier.courierName) parts.push(`Courier Company: ${courier.courierName}`);
  if (courier.city) parts.push(`City: ${courier.city}`);
  parts.push(`Direction: ${courier.direction}`);
  if (courier.trackId) parts.push(`Track ID: ${courier.trackId}`);
  if (courier.note) parts.push(`Notes: ${courier.note}`);
  return parts.join(" | ");
};

/**
 * Creates the Income entry for a manually-created Outgoing Courier (see
 * courier.controller.js#createCourier), inside the SAME transaction as the Courier's own
 * creation — mirrors createIncomeForSale's atomic-write reasoning above. Returns null (no entry
 * created) when the courier has nothing to record as income yet (see shouldHaveCourierIncome).
 */
const createIncomeForCourier = async (courier, { transaction, userId }) => {
  if (!shouldHaveCourierIncome(courier)) return null;

  const entryDate = courier.entryDate || dayjs().format("YYYY-MM-DD");

  await AccountEntry.create(
    {
      entryType: "INCOME",
      category: "Courier",
      customerName: courier.customerName || courier.name || "Unknown customer",
      customerPhone: courier.mobileNo || courier.phone || null,
      productName: courier.productName || null,
      amount: parseFloat(courier.charge) || 0,
      entryDate,
      referenceType: "courier",
      referenceId: courier.id,
      courierId: courier.id,
      description: buildCourierIncomeDescription(courier),
      // Same Admin-approval workflow as every other auto-created accounting entry (Sale's own
      // Income row, the Incoming-courier Expense row) — see income.controller.js#approveIncome.
      status: "PENDING",
      createdBy: userId,
    },
    { transaction }
  );

  return entryDate;
};

/**
 * Keeps the linked Income entry in sync with an edit to its source Courier record (see
 * courier.controller.js#updateCourier) — same reasoning as syncIncomeForSaleUpdate. Removes the
 * entry if the courier no longer qualifies (e.g. switched to Incoming, made a free pickup, or
 * charge cleared to 0), creates one if it now qualifies but never had one, otherwise updates the
 * existing row in place. Returns the entryDate to recalculate, or null if nothing changed.
 */
const syncIncomeForCourierUpdate = async (courier, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: "courier", referenceId: courier.id, entryType: "INCOME" },
    transaction,
  });

  if (!shouldHaveCourierIncome(courier)) {
    if (!existing) return null;
    const { entryDate } = existing;
    await existing.destroy({ transaction });
    return entryDate;
  }

  if (existing) {
    existing.customerName = courier.customerName || courier.name || "Unknown customer";
    existing.customerPhone = courier.mobileNo || courier.phone || null;
    existing.productName = courier.productName || null;
    existing.amount = parseFloat(courier.charge) || 0;
    existing.entryDate = courier.entryDate || existing.entryDate;
    existing.description = buildCourierIncomeDescription(courier);
    await existing.save({ transaction });
    return existing.entryDate;
  }

  return createIncomeForCourier(courier, { transaction, userId: courier.userId });
};

/**
 * Removes the linked Income entry when its source Courier record is deleted (see
 * courier.controller.js#deleteCourier) — mirrors removeIncomeForSale. Returns the removed
 * entry's date (for recalculation) or null if there was nothing linked.
 */
const removeIncomeForCourier = async (courierId, { transaction }) => {
  const existing = await AccountEntry.findOne({
    where: { referenceType: "courier", referenceId: courierId, entryType: "INCOME" },
    transaction,
  });
  if (!existing) return null;
  const { entryDate } = existing;
  await existing.destroy({ transaction });
  return entryDate;
};

module.exports = {
  buildSaleProductSummary,
  createIncomeForSale,
  syncIncomeForSaleUpdate,
  removeIncomeForSale,
  createIncomeForLedgerPayment,
  syncIncomeForLedgerEntryUpdate,
  removeIncomeForLedgerEntry,
  createIncomeForCourier,
  syncIncomeForCourierUpdate,
  removeIncomeForCourier,
};
