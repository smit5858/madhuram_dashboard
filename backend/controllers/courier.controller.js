const { Courier, User } = require("../models");
const { Op } = require("sequelize");

/**
 * Build a where-clause for city-scoped access.
 * - Admin: no restriction (returns {})
 * - Non-Admin with allowedCity: filter courier.city = allowedCity
 * - Non-Admin without allowedCity: fall back to userId ownership filter
 */
const buildScopeWhere = async (jwtUser) => {
  if (jwtUser.roleName === "Admin") {
    return {};
  }

  // Load the full user record to get allowedCity
  const userRecord = await User.findByPk(jwtUser.id, {
    attributes: ["id", "allowedCity"],
  });

  if (userRecord && userRecord.allowedCity) {
    return { city: userRecord.allowedCity };
  }

  // Fallback: scope by userId (original behaviour)
  return { userId: jwtUser.id };
};

/**
 * Verify that a given courier record is within the authenticated user's allowed scope.
 * Returns true if access is allowed.
 */
const verifyScope = async (courier, jwtUser) => {
  if (jwtUser.roleName === "Admin") return true;

  const userRecord = await User.findByPk(jwtUser.id, {
    attributes: ["id", "allowedCity"],
  });

  if (userRecord && userRecord.allowedCity) {
    return courier.city === userRecord.allowedCity;
  }

  // Fallback: ownership check
  return courier.userId === jwtUser.id;
};

// GET /couriers
exports.getCouriers = async (req, res) => {
  try {
    const user = req.user;
    const scopeWhere = await buildScopeWhere(user);

    // Optional Product Name filter (applies server-side alongside scope)
    if (req.query.productName) {
      scopeWhere.productName = { [Op.like]: `%${req.query.productName}%` };
    }

    const couriers = await Courier.findAll({
      where: scopeWhere,
      include: {
        model: User,
        attributes: ["id", "name", "email"],
      },
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      success: true,
      data: couriers,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// GET /couriers/:id
exports.getCourierById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id, {
      include: {
        model: User,
        attributes: ["id", "name", "email"],
      },
    });

    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Backend enforces scope — frontend cannot bypass this
    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    return res.status(200).json({ success: true, data: courier });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// POST /couriers
exports.createCourier = async (req, res) => {
  try {
    const user = req.user;
    const {
      name, email, phone,
      customerName, address, city, mobileNo,
      productName, charge, freePickup,
      courierName, trackId, kg, pending, note, completedDate,
    } = req.body || {};

    // Determine which userId to assign
    let targetUserId = user.id;
    if (user.roleName === "Admin" && req.body.userId) {
      targetUserId = parseInt(req.body.userId);
    }

    // For non-Admin, enforce city from their allowedCity
    let targetCity = city;
    if (user.roleName !== "Admin") {
      const userRecord = await User.findByPk(user.id, { attributes: ["allowedCity"] });
      if (userRecord && userRecord.allowedCity) {
        targetCity = userRecord.allowedCity; // non-admin cannot create outside their city
      }
    }

    const courier = await Courier.create({
      name: name || customerName || null,
      email: email || null,
      phone: phone || mobileNo || null,
      customerName: customerName || name || null,
      address: address || null,
      city: targetCity || null,
      mobileNo: mobileNo || phone || null,
      productName: productName || null,
      charge: charge !== undefined ? charge : null,
      freePickup: freePickup !== undefined ? freePickup : false,
      courierName: courierName || null,
      trackId: trackId || null,
      kg: kg !== undefined ? kg : null,
      pending: pending !== undefined ? pending : true,
      note: note || null,
      completedDate: completedDate || null,
      userId: targetUserId,
    });

    return res.status(201).json({
      success: true,
      message: "Courier created successfully",
      data: courier,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /couriers/:id
exports.updateCourier = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;
    const {
      name, email, phone,
      customerName, address, city, mobileNo,
      productName, charge, freePickup,
      courierName, trackId, kg, pending, note, completedDate,
    } = req.body || {};

    const courier = await Courier.findByPk(id);
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Backend enforces scope
    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    // Update fields — only override if provided
    if (customerName !== undefined) courier.customerName = customerName;
    if (name !== undefined) courier.name = name;
    if (email !== undefined) courier.email = email;
    if (phone !== undefined) courier.phone = phone;
    if (address !== undefined) courier.address = address;
    if (mobileNo !== undefined) courier.mobileNo = mobileNo;
    if (productName !== undefined) courier.productName = productName;
    if (charge !== undefined) courier.charge = charge;
    if (freePickup !== undefined) courier.freePickup = freePickup;
    if (courierName !== undefined) courier.courierName = courierName;
    if (trackId !== undefined) courier.trackId = trackId;
    if (kg !== undefined) courier.kg = kg;
    if (pending !== undefined) courier.pending = pending;
    if (note !== undefined) courier.note = note;
    if (completedDate !== undefined) courier.completedDate = completedDate;

    // City: Admin can update city; non-Admin city is locked to their allowedCity
    if (user.roleName === "Admin") {
      if (city !== undefined) courier.city = city;
      if (req.body.userId) courier.userId = parseInt(req.body.userId);
    } else {
      // Non-admin: city stays locked — silently ignore city changes
    }

    await courier.save();

    return res.status(200).json({
      success: true,
      message: "Courier updated successfully",
      data: courier,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /couriers/:id
exports.deleteCourier = async (req, res) => {
  try {
    const { id } = req.params;
    const user = req.user;

    const courier = await Courier.findByPk(id);
    if (!courier) {
      return res.status(404).json({ success: false, message: "Courier not found" });
    }

    // Backend enforces scope
    const allowed = await verifyScope(courier, user);
    if (!allowed) {
      return res.status(403).json({ success: false, message: "Access denied: courier is outside your allowed scope" });
    }

    await courier.destroy();

    return res.status(200).json({
      success: true,
      message: "Courier deleted successfully",
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};
