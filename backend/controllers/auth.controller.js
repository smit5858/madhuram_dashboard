const { User, Role } = require("../models");
const { checkPassword } = require("../helper/common");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../helper/token");

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Email and password are required" });
    }

    const user = await User.findOne({
      where: { email },
      include: { model: Role },
    });

    if (!user || !user.isActive) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const isValid = checkPassword(password, user.password);
    if (!isValid) {
      return res
        .status(401)
        .json({ success: false, message: "Invalid credentials" });
    }

    const roleName = user.Role ? user.Role.name : null;

    const payload = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: roleName,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken({ id: user.id });

    // Save refresh token to user record
    await user.update({ refreshToken });

    // Optionally set HTTP-only cookie if cookie-parser is used
    if (res.cookie) {
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return res.status(200).json({
      success: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        roleId: user.roleId,
        roleName: roleName,
        allowedCity: user.allowedCity || null,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const token =
      (req.cookies && req.cookies.refreshToken) ||
      (req.body && req.body.refreshToken) ||
      (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")
        ? req.headers.authorization.split(" ")[1]
        : null);

    if (!token) {
      return res.status(401).json({ success: false, message: "Refresh token is required" });
    }

    let decoded;
    try {
      decoded = verifyRefreshToken(token);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired refresh token" });
    }

    const user = await User.findByPk(decoded.id, {
      include: { model: Role },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: "User no longer active or exists" });
    }

    if (user.tokenInvalidatedAt) {
      const tokenIssuedAt = (decoded.iat || 0) * 1000;
      if (tokenIssuedAt < user.tokenInvalidatedAt.getTime()) {
        return res.status(401).json({ success: false, message: "Session revoked" });
      }
    }

    if (user.refreshToken && user.refreshToken !== token) {
      return res.status(401).json({ success: false, message: "Refresh token revoked or mismatched" });
    }

    const roleName = user.Role ? user.Role.name : null;
    const payload = {
      id: user.id,
      email: user.email,
      roleId: user.roleId,
      roleName: roleName,
    };

    const newAccessToken = generateAccessToken(payload);
    const newRefreshToken = generateRefreshToken({ id: user.id });

    await user.update({ refreshToken: newRefreshToken });

    if (res.cookie) {
      res.cookie("refreshToken", newRefreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
    }

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.logout = async (req, res) => {
  try {
    if (req.user && req.user.id) {
      await User.update(
        { tokenInvalidatedAt: new Date(), refreshToken: null },
        { where: { id: req.user.id } }
      );
    }
    if (res.clearCookie) {
      res.clearCookie("refreshToken");
    }
    return res.status(200).json({ success: true, message: "Logged out" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

