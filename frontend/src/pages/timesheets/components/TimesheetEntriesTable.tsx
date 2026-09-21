import { AlertTriangle, Clock, Edit2, FolderKanban, Trash2 } from "lucide-react";
import type { TimesheetEntryData } from "@/services/timesheet.service";
import TaskStatusBadge from "@/pages/tasks/components/TaskStatusBadge";
import { formatDateTime, formatDisplayDate } from "@/shared/utils/date";
import { formatClock, formatDuration } from "@/shared/utils/timesheet";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface TimesheetEntriesTableProps {
  entries: TimesheetEntryData[];
  isLoading: boolean;
  error?: unknown;
  /** Show the Date column (multi-day views). */
  showDate: boolean;
  /** Show the "Logged By" column (viewers of everyone's timesheets). */
  showEmployee: boolean;
  onEdit: (entry: TimesheetEntryData) => void;
  onDelete: (entry: TimesheetEntryData) => void;
}

const TaskCell = ({ entry }: { entry: TimesheetEntryData }) => {
  if (entry.task) {
    return (
      <div className="flex flex-col gap-1">
        <span className="font-medium text-slate-800">{entry.task.title}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
          {entry.project && (
            <span className="inline-flex items-center gap-1">
              <FolderKanban className="h-3 w-3" /> {entry.project.name}
            </span>
          )}
          <TaskStatusBadge status={entry.task.status} />
        </span>
      </div>
    );
  }
  if (entry.project) {
    return (
      <div className="flex flex-col gap-1">
        <span className="inline-flex items-center gap-1 font-medium text-slate-800">
          <FolderKanban className="h-3.5 w-3.5 text-slate-400" /> {entry.project.name}
        </span>
        <span className="text-xs text-slate-400">No specific task</span>
      </div>
    );
  }
  const removed = entry.deletedTaskTitle || entry.deletedProjectName;
  return <span className="text-slate-400">{removed ? `${removed} (removed)` : "—"}</span>;
};

/** Who entered the log and when — plus who corrected it afterwards, if an Admin did. */
const LoggedByCell = ({ entry }: { entry: TimesheetEntryData }) => (
  <div className="flex flex-col gap-0.5">
    <span className="inline-flex items-center gap-2 font-medium text-slate-800">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-50 text-[11px] font-bold text-indigo-600">
        {(entry.user?.name || "?").charAt(0).toUpperCase()}
      </span>
      {entry.user?.name || `#${entry.userId}`}
    </span>
    {entry.createdAt && <span className="text-[11px] text-slate-400">Logged {formatDateTime(entry.createdAt)}</span>}
    {entry.editor && (
      <span className="text-[11px] text-amber-600">
        Edited by {entry.editor.name}
        {entry.updatedAt ? ` · ${formatDateTime(entry.updatedAt)}` : ""}
      </span>
    )}
  </div>
);

const TimesheetEntriesTable = ({ entries, isLoading, error, showDate, showEmployee, onEdit, onDelete }: TimesheetEntriesTableProps) => {
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
  if (entries.length === 0) {
    return (
      <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
        <Clock className="h-10 w-10 text-slate-300" />
        <p className="text-sm font-medium text-gray-500">No work logged for this period.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
        <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
          <tr>
            {showDate && <th className="px-4 py-3 whitespace-nowrap">Date</th>}
            {showEmployee && <th className="px-4 py-3 whitespace-nowrap">Logged By</th>}
            <th className="px-4 py-3 whitespace-nowrap">Task / Project</th>
            <th className="px-4 py-3">Work Done</th>
            <th className="px-4 py-3 whitespace-nowrap">Start</th>
            <th className="px-4 py-3 whitespace-nowrap">End</th>
            <th className="px-4 py-3 whitespace-nowrap">Duration</th>
            <th className="px-4 py-3 whitespace-nowrap text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {entries.map((entry) => (
            <tr key={entry.id} className="align-top hover:bg-gray-50">
              {showDate && <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDisplayDate(entry.workDate)}</td>}
              {showEmployee && (
                <td className="px-4 py-3 whitespace-nowrap">
                  <LoggedByCell entry={entry} />
                </td>
              )}
              <td className="px-4 py-3">
                <TaskCell entry={entry} />
              </td>
              <td className="px-4 py-3 max-w-md">
                <p className="whitespace-pre-line text-slate-700">{entry.description}</p>
                {entry.notes && <p className="mt-1 whitespace-pre-line text-xs text-slate-400">Note: {entry.notes}</p>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatClock(entry.startTime)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                {formatClock(entry.endTime)}
                {entry.endsNextDay && <span className="ml-1 rounded-full bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600">+1 day</span>}
              </td>
              <td className="px-4 py-3 whitespace-nowrap font-semibold text-slate-800">{formatDuration(entry.durationMinutes)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-right">
                {entry.canEdit && (
                  <div className="inline-flex items-center gap-1">
                    <button type="button" onClick={() => onEdit(entry)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Edit">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => onDelete(entry)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600" title="Delete">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TimesheetEntriesTable;
