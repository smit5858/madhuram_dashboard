import { ArrowRightLeft, Calendar, CheckCircle2, Clock, Edit2, Flag, Plus, RotateCcw, StickyNote, UserMinus, UserPlus } from "lucide-react";
import type { TaskActivityEntry } from "@/services/task.service";
import { formatDateTime } from "@/shared/utils/date";
import { taskStatusLabel } from "@/shared/constants/taskStatus";

interface ActivityMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  dotClass: string;
}

const ACTION_META: Record<string, ActivityMeta> = {
  TASK_CREATED: { label: "Task Created", icon: Plus, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" },
  ASSIGNEE_ADDED: { label: "Task Assigned", icon: UserPlus, dotClass: "bg-indigo-50 text-indigo-600 ring-indigo-100" },
  ASSIGNEE_REMOVED: { label: "Assignee Removed", icon: UserMinus, dotClass: "bg-rose-50 text-rose-600 ring-rose-100" },
  TASK_REASSIGNED: { label: "Task Reassigned", icon: ArrowRightLeft, dotClass: "bg-indigo-50 text-indigo-600 ring-indigo-100" },
  STATUS_CHANGED: { label: "Status Changed", icon: ArrowRightLeft, dotClass: "bg-blue-50 text-blue-600 ring-blue-100" },
  TASK_COMPLETED: { label: "Task Completed", icon: CheckCircle2, dotClass: "bg-green-50 text-green-600 ring-green-100" },
  TASK_REOPENED: { label: "Task Reopened", icon: RotateCcw, dotClass: "bg-amber-50 text-amber-600 ring-amber-100" },
  NOTE_ADDED: { label: "Note Added", icon: StickyNote, dotClass: "bg-amber-50 text-amber-600 ring-amber-100" },
  NOTE_UPDATED: { label: "Note Edited", icon: StickyNote, dotClass: "bg-amber-50 text-amber-600 ring-amber-100" },
  TASK_UPDATED: { label: "Task Updated", icon: Edit2, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" },
  DESCRIPTION_CHANGED: { label: "Task Updated", icon: Edit2, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" },
  PRIORITY_CHANGED: { label: "Priority Changed", icon: Flag, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" },
  DUE_DATE_CHANGED: { label: "Due Date Changed", icon: Calendar, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" },
  TIMESHEET_ADDED: { label: "Time Logged", icon: Clock, dotClass: "bg-green-50 text-green-600 ring-green-100" },
  TIMESHEET_UPDATED: { label: "Work Log Updated", icon: Clock, dotClass: "bg-blue-50 text-blue-600 ring-blue-100" },
  TIMESHEET_DELETED: { label: "Work Log Deleted", icon: Clock, dotClass: "bg-rose-50 text-rose-600 ring-rose-100" },
};

const FALLBACK_META: ActivityMeta = { label: "Activity", icon: Edit2, dotClass: "bg-slate-100 text-slate-600 ring-slate-200" };

const truncate = (text: string, max = 140) => (text.length > max ? `${text.slice(0, max)}…` : text);

const shortDate = (value?: string | null) => (value ? formatDateTime(value) || value : "none");

const Strong = ({ children }: { children: React.ReactNode }) => <span className="font-semibold text-slate-700">{children}</span>;

/** Human sentence for one activity entry. Old/new values are stored as plain strings, so status
 *  codes are mapped to labels here at display time. */
const describe = (entry: TaskActivityEntry): { text: React.ReactNode; quote?: string } => {
  const actor = <Strong>{entry.actor?.name || "Someone"}</Strong>;
  const from = entry.oldValue;
  const to = entry.newValue;

  switch (entry.action) {
    case "TASK_CREATED":
      return { text: <>{actor} created this task</> };
    case "ASSIGNEE_ADDED":
      return { text: <>{actor} assigned this task to <Strong>{to || "someone"}</Strong></> };
    case "ASSIGNEE_REMOVED":
      return { text: <>{actor} removed <Strong>{from || "an assignee"}</Strong> from this task</> };
    case "TASK_REASSIGNED":
      return { text: <>{actor} reassigned this task from <Strong>{from || "nobody"}</Strong> to <Strong>{to || "someone"}</Strong></> };
    case "STATUS_CHANGED":
      return {
        text: <>{actor} changed status from <Strong>{taskStatusLabel(from)}</Strong> → <Strong>{taskStatusLabel(to)}</Strong></>,
        quote: entry.note || undefined,
      };
    case "TASK_COMPLETED":
      return { text: <>{actor} marked this task as completed</> };
    case "TASK_REOPENED":
      return { text: <>{actor} reopened this task</> };
    case "NOTE_ADDED":
      return { text: <>{actor} added a note</>, quote: to ? truncate(to) : undefined };
    case "NOTE_UPDATED":
      return { text: <>{actor} edited a note</>, quote: to ? truncate(to) : undefined };
    case "TASK_UPDATED":
      if (entry.note === "start date") return { text: <>{actor} changed the start date from <Strong>{shortDate(from)}</Strong> to <Strong>{shortDate(to)}</Strong></> };
      return { text: <>{actor} changed the title from <Strong>{from || "—"}</Strong> to <Strong>{to || "—"}</Strong></> };
    case "DESCRIPTION_CHANGED":
      return { text: <>{actor} updated the description</> };
    case "PRIORITY_CHANGED":
      return { text: <>{actor} changed priority from <Strong>{from || "—"}</Strong> → <Strong>{to || "—"}</Strong></> };
    case "DUE_DATE_CHANGED":
      return { text: <>{actor} changed the due date from <Strong>{shortDate(from)}</Strong> to <Strong>{shortDate(to)}</Strong></> };
    // The backend writes these with the details (date, duration, what changed) in `note`.
    case "TIMESHEET_ADDED":
      return { text: <>{actor} logged time on this task</>, quote: entry.note || undefined };
    case "TIMESHEET_UPDATED":
      return { text: <>{actor} updated a work log on this task</>, quote: entry.note || undefined };
    case "TIMESHEET_DELETED":
      return { text: <>{actor} deleted a work log on this task</>, quote: entry.note || undefined };
    default:
      return { text: <>{actor} {entry.action.replace(/_/g, " ").toLowerCase()}</> };
  }
};

const TaskActivityTimeline = ({ entries }: { entries?: TaskActivityEntry[] }) => {
  if (!entries || entries.length === 0) {
    return <p className="text-xs text-slate-400">No activity recorded yet.</p>;
  }

  return (
    <ol className="relative flex flex-col gap-4 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
      {entries.map((entry) => {
        const meta = ACTION_META[entry.action] || FALLBACK_META;
        const Icon = meta.icon;
        const { text, quote } = describe(entry);
        return (
          <li key={entry.id} className="relative flex items-start gap-3 pl-0">
            <div className={`relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${meta.dotClass}`}>
              <Icon className="h-3 w-3" />
            </div>
            <div className="min-w-0 text-xs">
              <div className="font-semibold text-slate-800">{meta.label}</div>
              <div className="mt-0.5 text-slate-500">{text}</div>
              {quote && <div className="mt-1 whitespace-pre-line rounded-md border-l-2 border-slate-200 bg-slate-50 px-2 py-1 text-slate-500">{quote}</div>}
              <div className="mt-0.5 text-[11px] text-slate-400">{(formatDateTime(entry.createdAt) || "").replace(", ", " ")}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
};

export default TaskActivityTimeline;
