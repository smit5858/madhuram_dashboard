import type { BankAccountData } from "@/services/bankAccount.service";

/** Builds the WhatsApp share message text for a bank account record, mirroring the
 *  emoji-labeled template used by courierShare.ts. Optional fields (UPI ID) are only
 *  included when present. */
export const buildBankAccountShareMessage = (account: BankAccountData): string => {
  const lines = [
    "🏦 Bank Account Details",
    "",
    `🏦 Bank Name: ${account.bankName || "N/A"}`,
    `👤 Account Holder: ${account.accountHolderName || "N/A"}`,
    `🔢 Account Number: ${account.accountNumber || "N/A"}`,
    `🏷️ IFSC Code: ${account.ifscCode || "N/A"}`,
  ];

  if (account.branchName) {
    lines.push(`📍 Branch: ${account.branchName}`);
  }
  if (account.upiId) {
    lines.push(`💳 UPI ID: ${account.upiId}`);
  }

  lines.push("", "— Shared from Madhuram Motors");

  return lines.join("\n");
};

/** No recipient number pre-filled — bank accounts aren't tied to a single customer's phone, so
 *  this opens WhatsApp's own contact picker with the message ready. Uses api.whatsapp.com/send
 *  rather than the wa.me short-link redirect: wa.me's redirect hop has a known bug that mangles
 *  multi-byte (emoji) characters in the `text` param into "�", on both WhatsApp Web and Desktop,
 *  while api.whatsapp.com/send (what wa.me itself forwards to) renders them correctly. */
export const getBankAccountShareUrl = (account: BankAccountData): string =>
  `https://api.whatsapp.com/send?text=${encodeURIComponent(buildBankAccountShareMessage(account))}`;
