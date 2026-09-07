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

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats an ISO date/timestamp (e.g. a `createdAt`/`updatedAt`) as "29 Aug 2026, 05:30 PM" in
 *  the browser's local timezone — same local-time convention as getTodayISODate above, just with
 *  the time of day included. */
export const formatDateTime = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const day = String(date.getDate()).padStart(2, "0");
  const month = MONTH_ABBR[date.getMonth()];
  const year = date.getFullYear();

  let hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const period = hours >= 12 ? "PM" : "AM";
  hours = hours % 12 || 12;

  return `${day} ${month} ${year}, ${String(hours).padStart(2, "0")}:${minutes} ${period}`;
};
