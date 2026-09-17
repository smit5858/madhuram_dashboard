export const normalizePhoneDigits = (value: string | null | undefined): string =>
  (value || "").replace(/\D/g, "").slice(0, 10);

/** Formats a raw phone value as "00000 00000" for display, without mutating the underlying
 *  digits-only value it was given. Safe to call on already-formatted or space-pasted input. */
export const formatPhoneDisplay = (value: string | null | undefined): string => {
  const digits = normalizePhoneDigits(value);
  return digits.length > 5 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : digits;
};