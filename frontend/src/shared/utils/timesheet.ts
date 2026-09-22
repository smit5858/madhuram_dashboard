/** Helpers for the Timesheet module. Dates are "YYYY-MM-DD" strings and times are 24h "HH:mm"
 *  strings (what <input type="date|time"> and the API speak); all date maths is done on UTC parts
 *  so a daylight-saving change can never shift a calendar day. */

const parseIso = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso: string, days: number): string => toIso(parseIso(iso) + days * 86400000);

/** Monday of the week containing `iso` (weeks run Monday → Sunday). */
export const startOfWeek = (iso: string): string => {
  const weekday = new Date(parseIso(iso)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((weekday + 6) % 7));
};

export const endOfWeek = (iso: string): string => addDays(startOfWeek(iso), 6);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export const weekdayName = (iso: string): string => WEEKDAYS[new Date(parseIso(iso)).getUTCDay()];

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** End − Start in minutes (+24h when the work ran past midnight). Returns null while the range
 *  is incomplete or invalid — the API re-validates, this only drives the live preview/errors. */
export const calcDurationMinutes = (start: string, end: string, endsNextDay: boolean): number | null => {
  if (!TIME_RE.test(start) || !TIME_RE.test(end)) return null;
  const minutes = toMinutes(end) - toMinutes(start) + (endsNextDay ? 1440 : 0);
  return minutes > 0 && minutes < 1440 ? minutes : null;
};

/** "2h 30m", "2h", "45m". With `pad`, a fixed "8h 00m" shape for the weekly totals column. */
export const formatDuration = (minutes: number, pad = false): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (pad) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (h && m) return `${h}h ${m}m`;
  return h ? `${h}h` : `${m}m`;
};

/** "13:05" → "01:05 PM". */
export const formatClock = (hhmm: string): string => {
  if (!TIME_RE.test(hhmm)) return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return `${String(h % 12 || 12).padStart(2, "0")}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

/** Live elapsed time since a stored ISO start timestamp, as "1:23:05" (or "23:05" under an hour).
 *  `nowMs` is injectable for testability; recomputed from the real timestamp on every call, so a
 *  ticking caller self-corrects after any tab-throttling instead of drifting. */
export const formatElapsed = (startedAtIso: string, nowMs: number = Date.now()): string => {
  const totalSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAtIso).getTime()) / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
};
