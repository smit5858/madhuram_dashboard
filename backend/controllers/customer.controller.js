const { Customer, Sale, User, Notification } = require("../models");
const { Op } = require("sequelize");
const { getIO } = require("../socket");

// GET /customers
exports.getCustomers = async (req, res) => {
  try {
    const { search, city, phone, name, page, limit } = req.query;

    const where = {};
    if (city) {
      where.city = { [Op.like]: `%${city.trim()}%` };
    }
    if (phone) {
      where.phone = { [Op.like]: `%${phone.trim()}%` };
    }
    if (name) {
      where.name = { [Op.like]: `%${name.trim()}%` };
    }

    if (search && search.trim()) {
      const s = `%${search.trim()}%`;
      where[Op.or] = [
        { name: { [Op.like]: s } },
        { phone: { [Op.like]: s } },
        { city: { [Op.like]: s } },
        { email: { [Op.like]: s } },
        { pincode: { [Op.like]: s } },
      ];
    }

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const offset = (pageNum - 1) * limitNum;

    const { count, rows } = await Customer.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: limitNum,
      offset: offset,
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
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /customers/phone/:phone
// Lightweight lookup specifically for Sales Entry
exports.getCustomerByPhone = async (req, res) => {
  try {
    const { phone } = req.params;
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: "Phone number is required" });
    }

    const cleanPhone = phone.trim();
    const customer = await Customer.findOne({
      where: {
        [Op.or]: [
          { phone: cleanPhone },
          { phone: { [Op.like]: `%${cleanPhone.slice(-10)}` } },
        ],
      },
      attributes: ["id", "name", "phone", "email", "address", "city", "pincode", "notes", "createdAt"],
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found", data: null });
    }

    return res.status(200).json({ success: true, data: customer });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /customers/:id
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findByPk(id, {
      include: [
        {
          model: User,
          as: "creator",
          attributes: ["id", "name", "email"],
        },
        {
          model: Sale,
          as: "sales",
          attributes: ["id", "invoiceNumber", "sellingAmount", "collectedAmount", "pendingAmount", "status", "createdAt"],
          limit: 10,
          order: [["createdAt", "DESC"]],
        },
      ],
    });

    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    return res.status(200).json({ success: true, data: customer });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /customers
exports.createCustomer = async (req, res) => {
  try {
    const user = req.user;
    const { name, phone, email, address, city, pincode, notes } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: "Customer name is required" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, message: "Customer phone is required" });
    }

    const trimmedPhone = phone.trim();

    // Check duplicate phone
    const existing = await Customer.findOne({ where: { phone: trimmedPhone } });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: `Customer already exists with phone number ${trimmedPhone}`,
        data: existing,
      });
    }

    const customer = await Customer.create({
      name: name.trim(),
      phone: trimmedPhone,
      email: email ? email.trim() : null,
      address: address ? address.trim() : null,
      city: city ? city.trim() : null,
      pincode: pincode ? pincode.trim() : null,
      notes: notes ? notes.trim() : null,
      createdBy: user ? user.id : null,
    });

    // Notify Admin after customer creation
    try {
      const creatorName = user ? (user.name || user.email || `User #${user.id}`) : "Sells Member";
      const notifDate = new Date().toLocaleString();
      const notifData = {
        recipientModule: "admin",
        type: "NEW_CUSTOMER",
        title: "New Customer Added",
        message: `Customer: ${customer.name}\nAdded by: ${creatorName}\nDate/Time: ${notifDate}`,
        referenceType: "customer",
        referenceId: customer.id,
      };

      const adminNotif = await Notification.create(notifData);
      try {
        const io = getIO();
        io.to("admin").emit("new_customer", {
          notification: adminNotif,
          customer: { id: customer.id, name: customer.name, phone: customer.phone },
        });
      } catch (sockErr) {
        console.warn("WebSocket notification emit failed:", sockErr.message);
      }
    } catch (notifErr) {
      console.warn("Customer creation notification failed:", notifErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "Customer created successfully",
      data: customer,
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Customer with this phone already exists" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /customers/:id
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, phone, email, address, city, pincode, notes, isActive } = req.body || {};

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    if (phone && phone.trim() !== customer.phone) {
      const existing = await Customer.findOne({
        where: { phone: phone.trim(), id: { [Op.ne]: id } },
      });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: `Another customer already exists with phone number ${phone.trim()}`,
        });
      }
      customer.phone = phone.trim();
    }

    if (name !== undefined) customer.name = name.trim();
    if (email !== undefined) customer.email = email ? email.trim() : null;
    if (address !== undefined) customer.address = address ? address.trim() : null;
    if (city !== undefined) customer.city = city ? city.trim() : null;
    if (pincode !== undefined) customer.pincode = pincode ? pincode.trim() : null;
    if (notes !== undefined) customer.notes = notes ? notes.trim() : null;
    if (isActive !== undefined) customer.isActive = isActive;

    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Customer updated successfully",
      data: customer,
    });
  } catch (err) {
    if (err.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({ success: false, message: "Phone number already in use" });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /customers/:id
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findByPk(id);
    if (!customer) {
      return res.status(404).json({ success: false, message: "Customer not found" });
    }

    // Soft delete or destroy
    customer.isActive = false;
    await customer.save();

    return res.status(200).json({
      success: true,
      message: "Customer deactivated successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
