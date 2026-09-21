import { useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Field, Form, Formik, type FormikHelpers } from "formik";
import toast from "react-hot-toast";
import { FolderKanban, Timer, User, XCircle } from "lucide-react";
import type { RootState } from "@/store/store";
import timesheetService, {
  type SaveTimesheetPayload,
  type TimesheetEntryData,
  type TimesheetTaskOption,
} from "@/services/timesheet.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import TaskStatusBadge from "@/pages/tasks/components/TaskStatusBadge";
import { timesheetEntrySchema, type TimesheetEntryFormValues } from "@/validation/timesheet.validation";
import { getTodayISODate } from "@/shared/utils/date";
import { calcDurationMinutes, formatDuration } from "@/shared/utils/timesheet";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface TimesheetFormModalProps {
  /** null = adding a new work log */
  entry: TimesheetEntryData | null;
  /** Day the new log defaults to (the day currently open on the Timesheet page). */
  defaultDate?: string;
  /** Pre-selects the task — used by "Add Work Log" on the task details page. */
  defaultTask?: TimesheetTaskOption;
  onClose: () => void;
}

const NO_LINK = "none";

const linkValueOf = (entry: TimesheetEntryData | null, defaultTask?: TimesheetTaskOption): string => {
  if (entry) {
    if (entry.taskId) return `task:${entry.taskId}`;
    if (entry.projectId) return `project:${entry.projectId}`;
    return NO_LINK;
  }
  return defaultTask ? `task:${defaultTask.id}` : "";
};

const TimesheetFormModal = ({ entry, defaultDate, defaultTask, onClose }: TimesheetFormModalProps) => {
  const queryClient = useQueryClient();
  const { name: employeeName } = useSelector((state: RootState) => state.auth);
  const isEdit = !!entry;
  const addAnotherRef = useRef(false);

  const { data: optionsResp, isLoading: optionsLoading } = useQuery({
    queryKey: ["timesheets", "options"],
    queryFn: () => timesheetService.getTimesheetOptions(),
    staleTime: 60_000,
  });

  // The picker offers what the user can currently see, plus the task this modal was opened for /
  // the entry's own task, in case it falls outside that list (e.g. a long-finished task).
  const tasks = useMemo(() => {
    const list = [...(optionsResp?.data?.data?.tasks || [])];
    const extras: TimesheetTaskOption[] = [];
    if (defaultTask) extras.push(defaultTask);
    if (entry?.task) {
      extras.push({ id: entry.task.id, title: entry.task.title, status: entry.task.status, projectId: entry.projectId, project: entry.project });
    }
    for (const extra of extras) if (!list.some((t) => t.id === extra.id)) list.push(extra);
    return list;
  }, [optionsResp, defaultTask, entry]);

  const projects = useMemo(() => {
    const list = [...(optionsResp?.data?.data?.projects || [])];
    if (entry?.project && !list.some((p) => p.id === entry.project!.id)) list.push({ id: entry.project.id, name: entry.project.name });
    return list;
  }, [optionsResp, entry]);

  const today = getTodayISODate();
  const initialValues: TimesheetEntryFormValues = {
    workDate: entry?.workDate || defaultDate || today,
    link: linkValueOf(entry, defaultTask),
    description: entry?.description || "",
    startTime: entry?.startTime || "",
    endTime: entry?.endTime || "",
    endsNextDay: entry?.endsNextDay || false,
    notes: entry?.notes || "",
  };

  const saveMutation = useMutation({
    mutationFn: (values: TimesheetEntryFormValues) => {
      const [kind, rawId] = values.link.split(":");
      const payload: SaveTimesheetPayload = {
        workDate: values.workDate,
        taskId: kind === "task" ? Number(rawId) : null,
        projectId: kind === "project" ? Number(rawId) : null,
        description: values.description.trim(),
        startTime: values.startTime,
        endTime: values.endTime,
        endsNextDay: values.endsNextDay,
        notes: values.notes?.trim() || null,
      };
      return isEdit ? timesheetService.updateTimesheet(entry!.id, payload) : timesheetService.createTimesheet(payload);
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to save work log"),
  });

  const handleSubmit = (values: TimesheetEntryFormValues, helpers: FormikHelpers<TimesheetEntryFormValues>) => {
    saveMutation.mutate(values, {
      onSuccess: (res) => {
        toast.success(res.data?.message || "Work log saved");
        queryClient.invalidateQueries({ queryKey: ["timesheets"] });
        // The task's activity timeline mirrors work-log changes.
        queryClient.invalidateQueries({ queryKey: ["tasks", "detail"] });
        if (addAnotherRef.current) {
          // Keep the day and task, start the next log where this one ended.
          helpers.resetForm({ values: { ...values, description: "", notes: "", startTime: values.endsNextDay ? "" : values.endTime, endTime: "", endsNextDay: false } });
        } else {
          onClose();
        }
      },
    });
  };

  const validate = (values: TimesheetEntryFormValues) => {
    const result = timesheetEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof TimesheetEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof TimesheetEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  return (
    <div className="fixed inset-0 z-80 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Work Log" : "Add Work Log"}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
              <User className="h-3 w-3" /> {entry?.user?.name || employeeName}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={handleSubmit}>
          {({ values, errors, touched, setFieldValue }) => {
            const duration = calcDurationMinutes(values.startTime, values.endTime, values.endsNextDay);
            const selectedTask = values.link.startsWith("task:") ? tasks.find((t) => t.id === Number(values.link.slice(5))) : undefined;
            const linkError = touched.link && errors.link;

            return (
              <Form className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
                  <div className="form-field">
                    <label htmlFor="link" className="form-input-label">Task / Project</label>
                    <Field as="select" id="link" name="link" className={`form-input ${linkError ? "form-input-error" : ""}`} disabled={optionsLoading}>
                      <option value="">{optionsLoading ? "Loading..." : "Select a task or project"}</option>
                      {values.link === NO_LINK && <option value={NO_LINK}>{entry?.deletedTaskTitle || entry?.deletedProjectName || "Removed task"} (removed)</option>}
                      {tasks.length > 0 && (
                        <optgroup label="Tasks">
                          {tasks.map((t) => (
                            <option key={t.id} value={`task:${t.id}`}>
                              {t.title}
                              {t.project ? ` — ${t.project.name}` : ""}
                            </option>
                          ))}
                        </optgroup>
                      )}
                      {projects.length > 0 && (
                        <optgroup label="Projects (no specific task)">
                          {projects.map((p) => (
                            <option key={p.id} value={`project:${p.id}`}>
                              {p.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </Field>
                    {linkError && <div className="formik-input-error">{errors.link}</div>}
                    {selectedTask && (
                      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                        <span className="font-semibold text-slate-800">{selectedTask.title}</span>
                        {selectedTask.project && (
                          <span className="inline-flex items-center gap-1 text-slate-500">
                            <FolderKanban className="h-3 w-3" /> {selectedTask.project.name}
                          </span>
                        )}
                        <TaskStatusBadge status={selectedTask.status} />
                      </div>
                    )}
                  </div>

                  <Field
                    name="description"
                    label="What did you work on?"
                    placeholder="e.g. Fixed the Pending Bill UI"
                    multiline
                    component={FormikInput}
                  />

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Field name="workDate" label="Date" type="date" component={FormikInput} />
                    <Field name="startTime" label="Start Time" type="time" component={FormikInput} />
                    <Field name="endTime" label="End Time" type="time" component={FormikInput} />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={values.endsNextDay}
                        onChange={(e) => setFieldValue("endsNextDay", e.target.checked)}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      Ends next day (worked past midnight)
                    </label>
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
                        duration ? "bg-blue-50 text-blue-700" : "bg-slate-50 text-slate-400"
                      }`}
                    >
                      <Timer className="h-3.5 w-3.5" /> Duration: {duration ? formatDuration(duration) : "—"}
                    </div>
                  </div>

                  <Field name="notes" label="Notes (optional)" placeholder="Anything else worth recording" multiline component={FormikInput} />
                </div>

                {/* DOM order puts the primary Save first so Enter-to-submit uses it; `order-*` keeps the visual order Cancel → Add Another → Save. */}
                <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-6 py-4">
                  <button
                    type="submit"
                    disabled={saveMutation.isPending}
                    onClick={() => { addAnotherRef.current = false; }}
                    className="order-3 rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
                  >
                    {saveMutation.isPending ? "Saving..." : isEdit ? "Update Work Log" : "Save Work Log"}
                  </button>
                  {!isEdit && (
                    <button
                      type="submit"
                      disabled={saveMutation.isPending}
                      onClick={() => { addAnotherRef.current = true; }}
                      className="order-2 rounded-lg border border-[#3d6fe0] px-4 py-2 text-xs font-bold text-[#3d6fe0] hover:bg-blue-50 disabled:opacity-50"
                    >
                      Save &amp; Add Another
                    </button>
                  )}
                  <button type="button" onClick={onClose} className="order-1 rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Cancel
                  </button>
                </div>
              </Form>
            );
          }}
        </Formik>
      </div>
    </div>
  );
};

export default TimesheetFormModal;
