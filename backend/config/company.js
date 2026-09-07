const path = require("path");

// Static company details used on generated PDFs (invoices, statements). Not DB-backed —
// change these constants to update branding across all PDF exports.
module.exports = {
  COMPANY_NAME: "Madhuram Motors",
  COMPANY_ADDRESS: "1407, North Zone, Twin Star, Nana Mava Circle, 150 Feet Ring Road, Rajkot - 360005",
  COMPANY_PHONE: "+91 7984333123",
  COMPANY_WEBSITE: "https://madhurammotors.com/",
  LOGO_PATH: path.join(__dirname, "../assets/logo.jpg"),
};
