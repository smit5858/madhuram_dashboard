import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Clock, Edit2, Plus, Trash2 } from "lucide-react";
import timesheetService from "@/services/timesheet.service";
import { formatDateTime } from "@/shared/utils/date";

const ACTION_META: Record<string, { verb: string; icon: React.ComponentType<{ className?: string }>; dotClass: string }> = {
  TIMESHEET_ADDED: { verb: "added", icon: Plus, dotClass: "bg-green-50 text-green-600 ring-green-100" },
  TIMESHEET_UPDATED: { verb: "updated", icon: Edit2, dotClass: "bg-blue-50 text-blue-600 ring-blue-100" },
  TIMESHEET_DELETED: { verb: "deleted", icon: Trash2, dotClass: "bg-rose-50 text-rose-600 ring-rose-100" },
};

const FALLBACK = { verb: "changed", icon: Clock, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" };

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

/** Feed of who added/edited/deleted which work log, newest first. The backend scopes it: an
 *  employee sees their own history, an Admin (or anyone allowed to view all records) sees
 *  everyone's, optionally narrowed to one employee. */
const TimesheetHistory = ({ userId }: { userId?: number | string }) => {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["timesheets", "activity", { userId, page }],
    queryFn: () => timesheetService.getTimesheetActivity({ userId: userId || undefined, page, limit: 20 }),
  });

  const entries = data?.data?.data || [];
  const meta = data?.data?.meta;

  if (isLoading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-1 px-4 text-center text-red-500">
        <AlertTriangle className="h-8 w-8" />
        <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load history"}</p>
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 text-slate-400">
        <Clock className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-gray-500">No timesheet history yet.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ol className="relative flex flex-col gap-5 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
        {entries.map((entry) => {
          const action = ACTION_META[entry.action] || FALLBACK;
          const Icon = action.icon;
          return (
            <li key={entry.id} className="relative flex items-start gap-3">
              <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${action.dotClass}`}>
                <Icon className="h-3 w-3" />
              </div>
              <div className="min-w-0 text-xs">
                <div className="text-slate-500">
                  <span className="font-semibold text-slate-800">{entry.actor?.name || "Someone"}</span> {action.verb}{" "}
                  {entry.subject && entry.subject.id !== entry.actorId ? `${entry.subject.name}'s` : "a"} timesheet entry
                </div>
                {entry.note && (
                  <div className="mt-1 whitespace-pre-line rounded-md border-l-2 border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">{entry.note}</div>
                )}
                <div className="mt-0.5 text-[11px] text-slate-400">{(formatDateTime(entry.createdAt) || "").replace(", ", " ")}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-3 text-xs text-gray-500">
          <span>
            Page {meta.page} of {meta.totalPages} · {meta.total} entries
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={meta.page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={meta.page >= meta.totalPages}
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TimesheetHistory;
