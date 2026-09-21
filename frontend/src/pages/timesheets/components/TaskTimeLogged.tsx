import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Clock, Plus } from "lucide-react";
import type { RootState } from "@/store/store";
import timesheetService, { type TimesheetTaskOption } from "@/services/timesheet.service";
import { formatDuration } from "@/shared/utils/timesheet";
import TimesheetFormModal from "./TimesheetFormModal";

/** "Time Logged" panel for the task details page: how long has been spent on this task, plus a
 *  one-click "Add Work Log" that opens the timesheet form with this task already selected.
 *  Hidden for users without access to the Timesheet module. The totals are scoped by the API —
 *  an employee sees their own time, an Admin sees everyone's. */
const TaskTimeLogged = ({ task }: { task: TimesheetTaskOption }) => {
  const { permissions } = useSelector((state: RootState) => state.auth);
  const [showForm, setShowForm] = useState(false);

  const permission = useMemo(() => permissions?.find((p) => p.routePath.toLowerCase() === "/timesheets"), [permissions]);

  const { data } = useQuery({
    queryKey: ["timesheets", "summary", { taskId: task.id }],
    queryFn: () => timesheetService.getTimesheetSummary({ taskId: task.id }),
    enabled: !!permission?.canRead,
  });
  const summary = data?.data?.data;

  if (!permission?.canRead) return null;

  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Time Logged</div>
        {permission.canCreate && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3560c4]"
          >
            <Plus className="h-3.5 w-3.5" /> Add Work Log
          </button>
        )}
      </div>

      {!summary || summary.entryCount === 0 ? (
        <p className="text-xs text-slate-400">No time logged against this task yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <Clock className="h-4 w-4 text-[#3d6fe0]" /> {formatDuration(summary.totalMinutes)} total
            <span className="text-xs font-normal text-slate-400">
              · {summary.entryCount} {summary.entryCount === 1 ? "entry" : "entries"}
            </span>
          </div>
          {summary.byUser.length > 1 &&
            summary.byUser.map((row) => (
              <div key={row.userId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <span className="text-slate-700">{row.name}</span>
                <span className="font-semibold text-slate-800">{formatDuration(row.minutes)}</span>
              </div>
            ))}
        </div>
      )}

      {showForm && <TimesheetFormModal entry={null} defaultTask={task} onClose={() => setShowForm(false)} />}
    </div>
  );
};

export default TaskTimeLogged;
