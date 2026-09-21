import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus, RotateCcw } from "lucide-react";
import type { RootState } from "@/store/store";
import timesheetService, { type TimesheetEntryData, type TimesheetFilters } from "@/services/timesheet.service";
import { useDocumentTitle } from "@/hook/useDocumentTitle";
import { formatDisplayDate, getTodayISODate } from "@/shared/utils/date";
import { addDays, endOfWeek, formatDuration, startOfWeek, weekdayName } from "@/shared/utils/timesheet";
import ConfirmDeleteModal from "@/pages/tasks/components/ConfirmDeleteModal";
import TimesheetFormModal from "./components/TimesheetFormModal";
import TimesheetEntriesTable from "./components/TimesheetEntriesTable";
import TimesheetWeekView from "./components/TimesheetWeekView";
import TimesheetBreakdown from "./components/TimesheetBreakdown";
import TimesheetHistory from "./components/TimesheetHistory";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

type ViewMode = "day" | "week" | "range";
type Tab = "log" | "history";

const RANGE_PAGE_SIZE = 20;
// A single day never has anywhere near this many entries; it just avoids paginating the day view.
const DAY_LIMIT = 200;

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "day", label: "Day" },
  { mode: "week", label: "Week" },
  { mode: "range", label: "Custom Range" },
];

const selectClass =
  "rounded-full border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer";
const dateClass = "rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none";
const navButtonClass =
  "inline-flex items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

const Timesheets = () => {
  useDocumentTitle("Timesheet");
  const queryClient = useQueryClient();
  const { permissions, name: ownName } = useSelector((state: RootState) => state.auth);

  const pagePermission = useMemo(() => {
    const fallback = { canRead: false, canCreate: false, canUpdate: false, canDelete: false, viewAllRecords: false };
    if (!permissions) return fallback;
    return permissions.find((p) => p.routePath.toLowerCase() === "/timesheets") ?? fallback;
  }, [permissions]);

  const today = getTodayISODate();
  const [tab, setTab] = useState<Tab>("log");
  const [mode, setMode] = useState<ViewMode>("day");
  const [date, setDate] = useState(today);
  const [rangeFrom, setRangeFrom] = useState(addDays(today, -6));
  const [rangeTo, setRangeTo] = useState(today);
  const [userId, setUserId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [taskId, setTaskId] = useState("");
  const [pageState, setPageState] = useState({ key: "", page: 1 });
  const [formEntry, setFormEntry] = useState<TimesheetEntryData | null | undefined>(undefined); // undefined = closed, null = new
  const [deleting, setDeleting] = useState<TimesheetEntryData | null>(null);

  const { data: optionsResp } = useQuery({
    queryKey: ["timesheets", "options"],
    queryFn: () => timesheetService.getTimesheetOptions(),
    enabled: pagePermission.canRead,
    staleTime: 60_000,
  });
  const options = optionsResp?.data?.data;
  const canViewAll = !!options?.canViewAll;

  const from = mode === "day" ? date : mode === "week" ? startOfWeek(date) : rangeFrom;
  const to = mode === "day" ? date : mode === "week" ? endOfWeek(date) : rangeTo;
  const rangeValid = !!from && !!to && from <= to;

  const filters = useMemo<TimesheetFilters>(
    () => ({ from, to, userId: userId || undefined, projectId: projectId || undefined, taskId: taskId || undefined }),
    [from, to, userId, projectId, taskId]
  );

  // The page number belongs to one particular period + filter combination; when any of them
  // changes the stored page no longer matches and reads as page 1.
  const pageKey = `${mode}|${from}|${to}|${userId}|${projectId}|${taskId}`;
  const page = pageState.key === pageKey ? pageState.page : 1;
  const setPage = (next: number) => setPageState({ key: pageKey, page: next });

  const logVisible = pagePermission.canRead && tab === "log" && rangeValid;

  const entriesQuery = useQuery({
    queryKey: ["timesheets", "list", filters, mode === "day" ? 1 : page],
    queryFn: ({ signal }) =>
      timesheetService.getTimesheets(mode === "day" ? { ...filters, limit: DAY_LIMIT } : { ...filters, page, limit: RANGE_PAGE_SIZE }, { signal }),
    enabled: logVisible && mode !== "week",
  });
  const summaryQuery = useQuery({
    queryKey: ["timesheets", "summary", filters],
    queryFn: ({ signal }) => timesheetService.getTimesheetSummary(filters, { signal }),
    enabled: logVisible && mode !== "day",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => timesheetService.deleteTimesheet(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Work log deleted");
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      setDeleting(null);
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to delete work log"),
  });

  const entries = entriesQuery.data?.data?.data || [];
  const meta = entriesQuery.data?.data?.meta;
  const summary = summaryQuery.data?.data?.data;
  const totalMinutes = mode === "day" ? entriesQuery.data?.data?.summary?.totalMinutes || 0 : summary?.totalMinutes || 0;

  const visibleTasks = (options?.tasks || []).filter((t) => !projectId || String(t.projectId) === projectId);
  const employeeName = userId ? options?.users.find((u) => String(u.id) === userId)?.name : canViewAll ? undefined : ownName;
  const employeeLabel = employeeName || "All employees";

  const hasActiveFilters = Boolean(userId || projectId || taskId);
  const clearFilters = () => {
    setUserId("");
    setProjectId("");
    setTaskId("");
  };

  const step = mode === "week" ? 7 : 1;
  const atPresent = mode === "week" ? endOfWeek(date) >= today : date >= today;
  const periodLabel =
    mode === "day"
      ? `${weekdayName(date)}, ${formatDisplayDate(date)}`
      : mode === "week"
        ? `${formatDisplayDate(startOfWeek(date))} – ${formatDisplayDate(endOfWeek(date))}`
        : rangeValid
          ? `${formatDisplayDate(rangeFrom)} – ${formatDisplayDate(rangeTo)}`
          : "Select a valid date range";
  const totalLabel = mode === "day" ? "Total" : mode === "week" ? "Weekly Total" : "Total";

  if (!pagePermission.canRead) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 items-center justify-center text-sm text-gray-500">You do not have permission to view timesheets.</div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex self-start rounded-full border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                { id: "log", label: "Work Logs" },
                { id: "history", label: "History" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-xs font-semibold transition ${tab === t.id ? "bg-white text-[#3d6fe0] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {pagePermission.canCreate && (
            <button
              type="button"
              onClick={() => setFormEntry(null)}
              className="inline-flex items-center justify-center gap-1.5 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" /> Add Work Log
            </button>
          )}
        </div>

        {tab === "log" && (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
                {VIEW_MODES.map((v) => (
                  <button
                    key={v.mode}
                    type="button"
                    onClick={() => setMode(v.mode)}
                    className={`rounded-full px-3.5 py-2 text-xs font-semibold transition ${mode === v.mode ? "bg-white text-[#3d6fe0] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              {mode !== "range" ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setDate(addDays(date, -step))} className={navButtonClass} title={mode === "week" ? "Previous week" : "Previous day"}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button type="button" onClick={() => setDate(today)} disabled={atPresent && (mode === "day" ? date === today : true)} className={navButtonClass}>
                    {mode === "week" ? "This Week" : "Today"}
                  </button>
                  <button type="button" onClick={() => setDate(addDays(date, step))} disabled={atPresent} className={navButtonClass} title={mode === "week" ? "Next week" : "Next day"}>
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                  <input
                    type="date"
                    value={date}
                    max={today}
                    onChange={(e) => e.target.value && setDate(e.target.value)}
                    className={dateClass}
                    aria-label="Pick a date"
                  />
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <input type="date" value={rangeFrom} max={rangeTo || today} onChange={(e) => setRangeFrom(e.target.value)} className={dateClass} aria-label="From date" />
                  to
                  <input type="date" value={rangeTo} min={rangeFrom} max={today} onChange={(e) => setRangeTo(e.target.value)} className={dateClass} aria-label="To date" />
                </div>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {canViewAll && (
                <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectClass} aria-label="Filter by employee">
                  <option value="">All Employees</option>
                  {(options?.users || []).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}
              <select
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setTaskId("");
                }}
                className={selectClass}
                aria-label="Filter by project"
              >
                <option value="">All Projects</option>
                {(options?.projects || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <select value={taskId} onChange={(e) => setTaskId(e.target.value)} className={`${selectClass} max-w-64`} aria-label="Filter by task">
                <option value="">All Tasks</option>
                {visibleTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={clearFilters}
                title="Clear filters"
                className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-xs font-semibold ${
                  hasActiveFilters ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <RotateCcw className="h-3.5 w-3.5" /> Clear
              </button>
            </div>
          </>
        )}
      </div>

      {tab === "history" ? (
        <div className="rounded-xl border border-gray-200 p-5 flex flex-col gap-4">
          {canViewAll && (
            <div className="flex items-center gap-2 border-b border-gray-100 pb-3 text-xs text-slate-500">
              Showing history for
              <select value={userId} onChange={(e) => setUserId(e.target.value)} className={selectClass} aria-label="Filter history by employee">
                <option value="">everyone</option>
                {(options?.users || []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <TimesheetHistory userId={canViewAll ? userId : undefined} />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <CalendarDays className="h-3.5 w-3.5" /> {periodLabel}
              </div>
              <div className="mt-1 text-sm text-slate-600">
                Employee: <span className="font-semibold text-slate-800">{employeeLabel}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                {mode === "day" ? "Total Hours Worked" : `${totalLabel} Hours`}
              </div>
              <div className="flex items-center justify-end gap-2 text-2xl font-bold text-[#3d6fe0]">
                <Clock className="h-5 w-5" /> {formatDuration(totalMinutes, mode === "week")}
              </div>
            </div>
          </div>

          {!rangeValid ? (
            <div className="flex h-32 items-center justify-center rounded-xl border border-gray-200 text-sm text-slate-500">Choose a start date that is on or before the end date.</div>
          ) : mode === "week" ? (
            <>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <TimesheetWeekView
                  weekStart={startOfWeek(date)}
                  summary={summary}
                  isLoading={summaryQuery.isLoading}
                  error={summaryQuery.error}
                  onOpenDay={(day) => {
                    setDate(day);
                    setMode("day");
                  }}
                />
              </div>
              <TimesheetBreakdown summary={summary} showEmployees={canViewAll && !userId} />
            </>
          ) : (
            <>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <TimesheetEntriesTable
                  entries={entries}
                  isLoading={entriesQuery.isLoading}
                  error={entriesQuery.error}
                  showDate={mode === "range"}
                  showEmployee={canViewAll}
                  onEdit={(entry) => setFormEntry(entry)}
                  onDelete={setDeleting}
                />
                {mode === "range" && meta && entries.length > 0 && (
                  <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
                    <span>
                      Page {meta.page} of {meta.totalPages} · {meta.total} total entries
                      {entriesQuery.isFetching && <span className="ml-2 text-gray-400">(refreshing…)</span>}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={meta.page <= 1}
                        onClick={() => setPage(Math.max(1, meta.page - 1))}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        Previous
                      </button>
                      <button
                        type="button"
                        disabled={meta.page >= meta.totalPages}
                        onClick={() => setPage(Math.min(meta.totalPages, meta.page + 1))}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
                {mode === "day" && entries.length > 0 && (
                  <div className="flex items-center justify-end gap-3 border-t-2 border-slate-300 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-900">
                    Total: {formatDuration(totalMinutes)}
                  </div>
                )}
              </div>
              {mode === "range" && <TimesheetBreakdown summary={summary} showEmployees={canViewAll && !userId} />}
            </>
          )}
        </>
      )}

      {formEntry !== undefined && (
        <TimesheetFormModal entry={formEntry} defaultDate={mode === "day" ? date : undefined} onClose={() => setFormEntry(undefined)} />
      )}
      {deleting && (
        <ConfirmDeleteModal
          title="Delete Work Log"
          itemName={`${formatDisplayDate(deleting.workDate)} · ${formatDuration(deleting.durationMinutes)}`}
          warning={`This removes ${deleting.user?.name ? `${deleting.user.name}'s` : "the"} work log from the timesheet. The deletion is recorded in the history.`}
          isSubmitting={deleteMutation.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() => deleteMutation.mutate(deleting.id)}
        />
      )}
    </div>
  );
};

export default Timesheets;
