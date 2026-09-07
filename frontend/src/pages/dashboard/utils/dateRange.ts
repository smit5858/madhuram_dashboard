export type RangeKey = "1D" | "1W" | "1M" | "3M" | "6M" | "1Y" | "5Y";

export const RANGE_OPTIONS: RangeKey[] = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"];

const toISODate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Anchored on "today" (local time, same convention as shared/utils/date.ts#getTodayISODate).
// 1D intentionally produces a single-day window — see TrendChart.tsx for how that's rendered,
// since DailyAccountBalance only has one row per day (no intraday data exists to show).
export const computeRange = (key: RangeKey): { startDate: string; endDate: string } => {
  const end = new Date();
  const start = new Date(end);

  switch (key) {
    case "1D":
      break;
    case "1W":
      start.setDate(start.getDate() - 7);
      break;
    case "1M":
      start.setMonth(start.getMonth() - 1);
      break;
    case "3M":
      start.setMonth(start.getMonth() - 3);
      break;
    case "6M":
      start.setMonth(start.getMonth() - 6);
      break;
    case "1Y":
      start.setFullYear(start.getFullYear() - 1);
      break;
    case "5Y":
      start.setFullYear(start.getFullYear() - 5);
      break;
  }

  return { startDate: toISODate(start), endDate: toISODate(end) };
};
