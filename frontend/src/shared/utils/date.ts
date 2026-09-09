/** Today's date as YYYY-MM-DD in the browser's local timezone — safe to feed straight into
 *  an <input type="date">. Deliberately not `toISOString().slice(0, 10)`, which reads the
 *  UTC date and would show "yesterday" during early-morning hours in timezones ahead of UTC. */
export const getTodayISODate = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

/** Formats any date-bearing value as "DD-MM-YYYY" — the app-wide display format. A plain
 *  `YYYY-MM-DD` value (e.g. a Sequelize DATEONLY field like `entryDate`/`billDate`) is
 *  reordered directly, without going through `Date`, so it can't drift a calendar day in
 *  timezones behind UTC; anything else (a full timestamp, or a `Date`) is read via its local
 *  getters, consistent with getTodayISODate above. */
export const formatDisplayDate = (value: string | Date | null | undefined): string => {
  if (!value) return "";
  if (typeof value === "string") {
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (dateOnly) {
      const [, year, month, day] = dateOnly;
      return `${day}-${month}-${year}`;
    }
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return typeof value === "string" ? value : "";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
};

/** Formats an ISO date/timestamp (e.g. a `createdAt`/`updatedAt`) as "29-08-2026, 05:30 PM" in
 *  the browser's local timezone — same local-time convention as getTodayISODate above, just with
 *  the time of day included. */
export const formatDateTime = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${formatDisplayDate(date)}, ${String(hours).padStart(2, "0")}:${minutes} ${period}`;
};
