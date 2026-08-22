const { verifyAccessToken } = require("../helper/token");
const { User } = require("../models");

module.exports = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = verifyAccessToken(token);
    const user = await User.findByPk(decoded.id, {
      attributes: ["id", "name", "email", "tokenInvalidatedAt"],
    });

    if (!user) {
      return res.status(401).json({ success: false, message: "User no longer exists" });
    }

    if (user.tokenInvalidatedAt) {
      const tokenIssuedAt = (decoded.iat || 0) * 1000; // jwt iat is in seconds, convert to ms
      if (tokenIssuedAt < user.tokenInvalidatedAt.getTime()) {
        return res.status(401).json({ success: false, message: "Session expired, please login again" });
      }
    }

    req.user = {
      ...decoded,
      name: user.name || decoded.name || null,
      email: user.email || decoded.email || null,
    };
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid or expired token" });
  }
};