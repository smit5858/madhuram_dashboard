const path = require("path");

// Static company details used on generated PDFs (invoices, statements). Not DB-backed —
// change these constants to update branding across all PDF exports.
module.exports = {
  COMPANY_NAME: "Saggu Auto Tech",
  COMPANY_ADDRESS: "Saggu auto tech Booth no. 633, new motor market, manimajra, chandigarh-160101",
  COMPANY_PHONE: "+91 7984333123",
  COMPANY_WEBSITE: "https://madhurammotors.com/",
  LOGO_PATH: path.join(__dirname, "../assets/logo.png"),
};
