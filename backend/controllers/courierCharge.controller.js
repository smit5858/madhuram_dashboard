const { CourierCharge } = require("../models");
const dayjs = require("dayjs");

// GET /couriers/charge — current month's Courier Charge. No row yet this month => amount 0
// (nothing carries over from the previous month).
exports.getCurrentCourierCharge = async (req, res) => {
  try {
    const now = dayjs();
    const month = now.month() + 1;
    const year = now.year();

    const record = await CourierCharge.findOne({ where: { month, year } });

    return res.status(200).json({
      success: true,
      data: { month, year, amount: record ? record.amount : 0 },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /couriers/charge — create/update the current month's Courier Charge. Always resolves the
// month/year server-side (from the current date), never from the client, so a stale tab can't
// overwrite a different month's amount.
exports.setCurrentCourierCharge = async (req, res) => {
  try {
    const { amount } = req.body || {};
    const parsed = Number(amount);

    if (amount === undefined || amount === null || amount === "" || Number.isNaN(parsed) || parsed < 0) {
      return res.status(400).json({ success: false, message: "amount must be a valid non-negative number" });
    }

    const now = dayjs();
    const month = now.month() + 1;
    const year = now.year();

    const [record] = await CourierCharge.findOrCreate({
      where: { month, year },
      defaults: { amount: parsed },
    });
    record.amount = parsed;
    await record.save();

    return res.status(200).json({
      success: true,
      message: "Courier charge updated successfully",
      data: { month, year, amount: record.amount },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /couriers/charge/reset — resets the current month's Courier Charge to 0. Restricted to
// Admin or the Courier-role user named "Vraj" specifically (not every Courier-role user), so
// this is checked here inline rather than via the generic authorize("/couriers", "update")
// middleware — same pattern as income.controller.js#updateBalance.
exports.resetCurrentCourierCharge = async (req, res) => {
  try {
    const { roleName, name } = req.user;
    const isAllowed = roleName === "Admin" || (roleName === "Courier" && name === "Vraj");
    if (!isAllowed) {
      return res.status(403).json({ success: false, message: "Forbidden: you are not allowed to reset the courier charge" });
    }

    const now = dayjs();
    const month = now.month() + 1;
    const year = now.year();

    const [record] = await CourierCharge.findOrCreate({
      where: { month, year },
      defaults: { amount: 0 },
    });
    record.amount = 0;
    await record.save();

    return res.status(200).json({
      success: true,
      message: "Courier charge reset successfully",
      data: { month, year, amount: record.amount },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
