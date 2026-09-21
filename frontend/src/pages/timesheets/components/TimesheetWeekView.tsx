import { AlertTriangle } from "lucide-react";
import type { TimesheetSummary } from "@/services/timesheet.service";
import { formatDisplayDate } from "@/shared/utils/date";
import { addDays, formatDuration, weekdayName } from "@/shared/utils/timesheet";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface TimesheetWeekViewProps {
  /** Monday of the week being shown. */
  weekStart: string;
  summary?: TimesheetSummary;
  isLoading: boolean;
  error?: unknown;
  /** Clicking a day opens it in the daily view. */
  onOpenDay: (date: string) => void;
}

const TimesheetWeekView = ({ weekStart, summary, isLoading, error, onOpenDay }: TimesheetWeekViewProps) => {
  if (isLoading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-1 px-4 text-center text-red-500">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load timesheet"}</p>
      </div>
    );
  }

  const minutesByDate = new Map((summary?.byDate || []).map((d) => [d.date, d.minutes]));
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const busiest = Math.max(1, ...days.map((d) => minutesByDate.get(d) || 0));

  return (
    <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
      <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
        <tr>
          <th className="px-4 py-3">Day</th>
          <th className="px-4 py-3">Date</th>
          <th className="w-1/2 px-4 py-3" aria-label="Share of the busiest day" />
          <th className="px-4 py-3 text-right">Hours</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {days.map((day) => {
          const minutes = minutesByDate.get(day) || 0;
          return (
            <tr key={day} className={`${minutes ? "cursor-pointer hover:bg-gray-50" : "text-slate-400"}`} onClick={() => onOpenDay(day)} title="Open this day">
              <td className="px-4 py-3 font-medium">{weekdayName(day)}</td>
              <td className="px-4 py-3 whitespace-nowrap">{formatDisplayDate(day)}</td>
              <td className="px-4 py-3">
                <div className="h-2 w-full rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-[#3d6fe0]" style={{ width: `${(minutes / busiest) * 100}%` }} />
                </div>
              </td>
              <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{formatDuration(minutes, true)}</td>
            </tr>
          );
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-slate-300 bg-slate-50 font-bold text-slate-900">
          <td className="px-4 py-3" colSpan={3}>
            Total
          </td>
          <td className="px-4 py-3 text-right whitespace-nowrap">{formatDuration(summary?.totalMinutes || 0, true)}</td>
        </tr>
      </tfoot>
    </table>
  );
};

export default TimesheetWeekView;
