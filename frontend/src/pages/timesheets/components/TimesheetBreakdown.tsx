import type { TimesheetSummary } from "@/services/timesheet.service";
import TaskStatusBadge from "@/pages/tasks/components/TaskStatusBadge";
import { formatDuration } from "@/shared/utils/timesheet";

interface TimesheetBreakdownProps {
  summary?: TimesheetSummary;
  /** Show the per-employee table (viewers of everyone's timesheets, not narrowed to one employee). */
  showEmployees: boolean;
}

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="overflow-hidden rounded-xl border border-gray-200">
    <div className="border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-gray-600">{title}</div>
    {children}
  </div>
);

/** "How much time went where": totals per task (with project + current status) and, for viewers of
 *  everyone's timesheets, per employee — for the same period and filters as the rest of the page. */
const TimesheetBreakdown = ({ summary, showEmployees }: TimesheetBreakdownProps) => {
  if (!summary || summary.entryCount === 0) return null;
  const total = summary.totalMinutes || 1;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Panel title="Time by Task">
        <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
          <tbody className="divide-y divide-gray-100">
            {summary.byTask.map((row) => (
              <tr key={`${row.taskId}-${row.projectId}-${row.title}`}>
                <td className="px-4 py-2.5">
                  <div className="font-medium text-slate-800">{row.title || (row.projectName ? "No specific task" : "—")}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    {row.projectName && <span>{row.projectName}</span>}
                    {row.status && <TaskStatusBadge status={row.status} />}
                    {!row.taskId && row.title && <span className="text-slate-400">(task removed)</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right whitespace-nowrap">
                  <div className="font-semibold text-slate-800">{formatDuration(row.minutes)}</div>
                  <div className="text-xs text-slate-400">{Math.round((row.minutes / total) * 100)}%</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>

      {showEmployees && (
        <Panel title="Time by Employee">
          <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
            <tbody className="divide-y divide-gray-100">
              {summary.byUser.map((row) => (
                <tr key={row.userId}>
                  <td className="px-4 py-2.5 font-medium text-slate-800">{row.name}</td>
                  <td className="px-4 py-2.5 text-right font-semibold whitespace-nowrap text-slate-800">{formatDuration(row.minutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
};

export default TimesheetBreakdown;
