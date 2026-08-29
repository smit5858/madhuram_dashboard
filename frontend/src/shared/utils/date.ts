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
