const crypto = require("crypto");
const authenticate = require("./authenticate");
const authorize = require("./authorize");

const readStockAccess = authorize("/stock", "read");

// Constant-time compare. Hashing both sides first gives equal-length buffers, so
// timingSafeEqual never throws and the key length isn't leaked through timing.
const keysMatch = (provided, expected) => {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
};

module.exports = (req, res, next) => {
  const key = req.headers["x-api-key"];
  const serviceKey = process.env.STOCK_SERVICE_KEY;

  // Branch-Dashboard → correct secret key → allow directly (read-only: only GET /stock uses this)
  if (typeof key === "string" && key && serviceKey && keysMatch(key, serviceKey)) {
    req.isServiceClient = true;
    return next();
  }

  // Normal Madhuram user → run your existing authenticate, then authorize
  authenticate(req, res, (err) => {
    if (err) return next(err);
    readStockAccess(req, res, next);
  });
};