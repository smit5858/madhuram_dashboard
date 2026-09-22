import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { FolderKanban, Play, Square, Timer } from "lucide-react";
import timesheetService, { type TimesheetEntryData } from "@/services/timesheet.service";
import { formatElapsed } from "@/shared/utils/timesheet";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const NO_LINK = "";
// Work that was never an assigned task/project — resolves to taskId:null/projectId:null, same as
// picking nothing, but is an always-offered, explicit choice rather than the empty placeholder.
const OTHER_WORK = "other";

/** One running timer's card: its own elapsed clock and its own "End Time" form. */
const ActiveTimerCard = ({
  entry,
  isStopping,
  onToggleStop,
  onStopped,
}: {
  entry: TimesheetEntryData;
  isStopping: boolean;
  onToggleStop: () => void;
  onStopped: () => void;
}) => {
  const queryClient = useQueryClient();
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [, forceTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const stopMutation = useMutation({
    mutationFn: () => timesheetService.stopTimesheet(entry.id, { description: description.trim(), notes: notes.trim() || null }),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Timer stopped");
      setDescription("");
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
      // The task's activity timeline mirrors work-log changes, same as TimesheetFormModal.
      queryClient.invalidateQueries({ queryKey: ["tasks", "detail"] });
      onStopped();
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to stop timer"),
  });

  const label = entry.task?.title || entry.project?.name || "Other Work";

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold text-slate-800">{label}</span>
          {entry.project && entry.task && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <FolderKanban className="h-3 w-3" /> {entry.project.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-sm font-bold tabular-nums text-emerald-700 shadow-sm">
            <Timer className="h-4 w-4" /> {entry.startedAt ? formatElapsed(entry.startedAt) : "0:00"}
          </div>
          {!isStopping && (
            <button
              type="button"
              onClick={onToggleStop}
              className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700"
            >
              <Square className="h-3.5 w-3.5" /> End Time
            </button>
          )}
        </div>
      </div>

      {isStopping && (
        <div className="flex flex-col gap-2 border-t border-emerald-200 pt-3">
          <div className="form-field">
            <label htmlFor={`timer-stop-description-${entry.id}`} className="form-input-label">
              What did you work on?
            </label>
            <textarea
              id={`timer-stop-description-${entry.id}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Fixed the Pending Bill UI"
              rows={2}
              className={`form-input ${!description.trim() && stopMutation.isError ? "form-input-error" : ""}`}
            />
          </div>
          <div className="form-field">
            <label htmlFor={`timer-stop-notes-${entry.id}`} className="form-input-label">
              Notes (optional)
            </label>
            <textarea
              id={`timer-stop-notes-${entry.id}`}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth recording"
              rows={2}
              className="form-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                onToggleStop();
                setDescription("");
                setNotes("");
              }}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!description.trim() || stopMutation.isPending}
              onClick={() => stopMutation.mutate()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Square className="h-3.5 w-3.5" /> {stopMutation.isPending ? "Stopping..." : "Stop & Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Clockify-style "Start Time" / "End Time" widget: one click starts a live timer (task/project/
 *  Other Work, no typed times); several may run at once — an employee genuinely working more than
 *  one task in parallel isn't limited to timing just one of them — and each is stopped
 *  independently with its own short description prompt. Always visible on the Timesheets page
 *  regardless of tab/view mode, separate from the "Add Work Log" modal which still handles
 *  manual/back-dated entries. */
const TimesheetTimerBar = () => {
  const queryClient = useQueryClient();
  const [link, setLink] = useState(NO_LINK);
  const [stoppingId, setStoppingId] = useState<number | null>(null);

  const { data: optionsResp, isLoading: optionsLoading } = useQuery({
    queryKey: ["timesheets", "options"],
    queryFn: () => timesheetService.getTimesheetOptions(),
    staleTime: 60_000,
  });
  const tasks = optionsResp?.data?.data?.tasks || [];
  const projects = optionsResp?.data?.data?.projects || [];

  const activeQuery = useQuery({
    queryKey: ["timesheets", "active"],
    queryFn: () => timesheetService.getActiveTimesheet(),
    refetchOnWindowFocus: true,
  });
  const actives = activeQuery.data?.data?.data || [];
  // What's already running, so the picker doesn't offer (and the server would reject) starting
  // the same task/project/Other-Work a second time. A task-linked entry's projectId is the task's
  // own project (copied by the server), not "no task" — so a task match is by taskId alone, and a
  // project match only counts entries with no task at all.
  const isTaskRunning = (taskId: number) => actives.some((a) => a.taskId === taskId);
  const isProjectRunning = (projectId: number) => actives.some((a) => !a.taskId && a.projectId === projectId);
  const isOtherWorkRunning = actives.some((a) => !a.taskId && !a.projectId);

  const startMutation = useMutation({
    mutationFn: () => {
      const [kind, rawId] = link.split(":");
      return timesheetService.startTimesheet({
        taskId: kind === "task" ? Number(rawId) : null,
        projectId: kind === "project" ? Number(rawId) : null,
      });
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || "Timer started");
      setLink(NO_LINK);
      queryClient.invalidateQueries({ queryKey: ["timesheets"] });
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to start timer");
      // A 409 (already running for this task) means our idle view is stale — resync it.
      queryClient.invalidateQueries({ queryKey: ["timesheets", "active"] });
    },
  });

  if (activeQuery.isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-400">
        <Timer className="h-4 w-4 animate-pulse" /> Loading timer…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {actives.map((entry) => (
        <ActiveTimerCard
          key={entry.id}
          entry={entry}
          isStopping={stoppingId === entry.id}
          onToggleStop={() => setStoppingId((cur) => (cur === entry.id ? null : entry.id))}
          onStopped={() => setStoppingId(null)}
        />
      ))}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
        <select
          value={link}
          onChange={(e) => setLink(e.target.value)}
          disabled={optionsLoading}
          className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:outline-none max-w-64"
          aria-label="Task or project to time"
        >
          <option value="">{optionsLoading ? "Loading..." : actives.length ? "Start another timer…" : "What are you working on?"}</option>
          {!isOtherWorkRunning && <option value={OTHER_WORK}>Other Work (not tied to a task/project)</option>}
          {tasks.length > 0 && (
            <optgroup label="Tasks">
              {tasks
                .filter((t) => !isTaskRunning(t.id))
                .map((t) => (
                  <option key={t.id} value={`task:${t.id}`}>
                    {t.title}
                    {t.project ? ` — ${t.project.name}` : ""}
                  </option>
                ))}
            </optgroup>
          )}
          {projects.length > 0 && (
            <optgroup label="Projects (no specific task)">
              {projects
                .filter((p) => !isProjectRunning(p.id))
                .map((p) => (
                  <option key={p.id} value={`project:${p.id}`}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          )}
        </select>
        <button
          type="button"
          disabled={!link || startMutation.isPending}
          onClick={() => startMutation.mutate()}
          className="inline-flex items-center gap-1.5 rounded-full bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3162d2] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Play className="h-3.5 w-3.5" /> {startMutation.isPending ? "Starting..." : "Start Time"}
        </button>
      </div>
    </div>
  );
};

export default TimesheetTimerBar;
