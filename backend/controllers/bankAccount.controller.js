const { BankAccount } = require("../models");
const { Op } = require("sequelize");

const errorResponse = (res, err) => res.status(err.statusCode || 500).json({ success: false, message: err.message });

const buildBankAccountWhere = (query) => {
  const { search, isActive } = query;
  const where = {};

  if (isActive !== undefined && isActive !== "") where.isActive = isActive === "true" || isActive === true;
  if (search && search.trim()) {
    const term = `%${search.trim()}%`;
    where[Op.or] = [
      { bankName: { [Op.like]: term } },
      { accountHolderName: { [Op.like]: term } },
      { accountNumber: { [Op.like]: term } },
      { ifscCode: { [Op.like]: term } },
    ];
  }

  return where;
};

// GET /account/bank-accounts?search=&isActive=&page=&limit=
// Omitting page/limit returns every matching row (unpaginated) — used by the Sells module to
// populate the Bank Account dropdown, same pattern as courierCompany.controller.js.
exports.getBankAccounts = async (req, res) => {
  try {
    const where = buildBankAccountWhere(req.query);

    if (req.query.page || req.query.limit) {
      const pageNum = Math.max(parseInt(req.query.page, 10) || 1, 1);
      const limitNum = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);

      const { rows, count } = await BankAccount.findAndCountAll({
        where,
        order: [["bankName", "ASC"]],
        limit: limitNum,
        offset: (pageNum - 1) * limitNum,
      });

      return res.status(200).json({
        success: true,
        data: rows,
        meta: { page: pageNum, limit: limitNum, total: count, totalPages: Math.ceil(count / limitNum) || 1 },
      });
    }

    const accounts = await BankAccount.findAll({ where, order: [["bankName", "ASC"]] });
    return res.status(200).json({ success: true, data: accounts });
  } catch (err) {
    return errorResponse(res, err);
  }
};

// GET /account/bank-accounts/active — active bank accounts only, no pagination. Gated by Sells
// read access (not the Admin-only bank-accounts permission) since any Sales user recording a
// BankTransfer sale needs this list to populate the Bank Account dropdown — same reasoning as
// courierCompany.controller.js's plain getCourierCompanies being readable by the couriers module.
exports.getActiveBankAccounts = async (req, res) => {
  try {
    const accounts = await BankAccount.findAll({ where: { isActive: true }, order: [["bankName", "ASC"]] });
    return res.status(200).json({ success: true, data: accounts });
  } catch (err) {
    return errorResponse(res, err);
  }
};

const validateBankAccountPayload = (body) => {
  const { bankName } = body || {};
  if (!bankName || !String(bankName).trim()) return "Bank name is required";
  return null;
};

// POST /account/bank-accounts — Admin only (enforced by route-level permission)
exports.createBankAccount = async (req, res) => {
  try {
    const validationError = validateBankAccountPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const { bankName, accountHolderName, accountNumber, ifscCode, branchName, upiId, notes, isActive } = req.body;

    const account = await BankAccount.create({
      bankName: bankName.trim(),
      accountHolderName: accountHolderName ? accountHolderName.trim() : null,
      accountNumber: accountNumber ? accountNumber.trim() : null,
      ifscCode: ifscCode ? ifscCode.trim() : null,
      branchName: branchName ? branchName.trim() : null,
      upiId: upiId ? upiId.trim() : null,
      notes: notes ? notes.trim() : null,
      isActive: isActive !== undefined ? !!isActive : true,
    });

    return res.status(201).json({ success: true, message: "Bank account created successfully", data: account });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A bank account with this account number already exists" });
    }
    return errorResponse(res, err);
  }
};

// PUT /account/bank-accounts/:id — Admin only (enforced by route-level permission)
exports.updateBankAccount = async (req, res) => {
  try {
    const validationError = validateBankAccountPayload(req.body);
    if (validationError) return res.status(400).json({ success: false, message: validationError });

    const account = await BankAccount.findByPk(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    const { bankName, accountHolderName, accountNumber, ifscCode, branchName, upiId, notes, isActive } = req.body;

    account.bankName = bankName.trim();
    account.accountHolderName = accountHolderName ? accountHolderName.trim() : null;
    account.accountNumber = accountNumber ? accountNumber.trim() : null;
    account.ifscCode = ifscCode ? ifscCode.trim() : null;
    account.branchName = branchName ? branchName.trim() : null;
    account.upiId = upiId ? upiId.trim() : null;
    account.notes = notes ? notes.trim() : null;
    if (isActive !== undefined) account.isActive = !!isActive;

    await account.save();

    return res.status(200).json({ success: true, message: "Bank account updated successfully", data: account });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "A bank account with this account number already exists" });
    }
    return errorResponse(res, err);
  }
};

// DELETE /account/bank-accounts/:id — Admin only (enforced by route-level permission)
exports.deleteBankAccount = async (req, res) => {
  try {
    const account = await BankAccount.findByPk(req.params.id);
    if (!account) return res.status(404).json({ success: false, message: "Bank account not found" });

    await account.destroy();

    return res.status(200).json({ success: true, message: "Bank account deleted successfully" });
  } catch (err) {
    return errorResponse(res, err);
  }
};
