// A Pending Bill "account" is one Seller/Dealer/Company — every bill entered for the same seller
// is grouped under it, regardless of product. There is no separate accounts table: an account is
// simply the set of bills sharing an accountKey, derived from the seller name (dealerName) so
// "Thinkcar", " thinkcar " and "ThinkCar" all land in the same account. Older bills entered without
// a seller (e.g. "Office rent") fall back to the bill's own name, so each of those is its own account.
const normalizeAccountKey = (value) => String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

const accountKeyFor = ({ dealerName, name }) => normalizeAccountKey(dealerName) || normalizeAccountKey(name);

const accountNameFor = ({ dealerName, name }) => (dealerName && String(dealerName).trim()) || name;

module.exports = { normalizeAccountKey, accountKeyFor, accountNameFor };
