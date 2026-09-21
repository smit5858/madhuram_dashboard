import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import projectService, { type ProjectData } from "@/services/project.service";
import userService from "@/services/user.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import { projectEntrySchema, type ProjectEntryFormValues } from "@/validation/project.validation";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface ProjectFormModalProps {
  /** null = creating a new project */
  project: ProjectData | null;
  onClose: () => void;
}

const PERMISSION_OPTIONS = [
  { value: "ADMIN_ONLY", label: "Admin Only" },
  { value: "ADMIN_AND_MEMBERS", label: "Admin + Project Employees" },
];

const ProjectFormModal = ({ project, onClose }: ProjectFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!project?.id;

  const { data: usersResp } = useQuery({
    queryKey: ["users", "for-project-members"],
    queryFn: () => userService.getUsers({ limit: 100, status: "active" }),
  });
  const userOptions = usersResp?.data?.data || [];

  const initialValues: ProjectEntryFormValues = {
    name: project?.name || "",
    description: project?.description || "",
    taskCreationPermission: project?.taskCreationPermission || "ADMIN_ONLY",
    memberIds: (project?.members || []).filter((m) => !m.removedAt).map((m) => m.userId),
  };

  const saveMutation = useMutation({
    mutationFn: (values: ProjectEntryFormValues) => {
      if (isEdit) {
        return projectService.updateProject(project!.id, {
          name: values.name.trim(),
          description: values.description?.trim() || undefined,
          taskCreationPermission: values.taskCreationPermission as ProjectEntryFormValues["taskCreationPermission"],
        });
      }
      return projectService.createProject({
        name: values.name.trim(),
        description: values.description?.trim() || undefined,
        taskCreationPermission: values.taskCreationPermission as ProjectEntryFormValues["taskCreationPermission"],
        memberIds: (values.memberIds || []).map(Number),
      });
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Project updated successfully" : "Project created successfully"));
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save project");
    },
  });

  const validate = (values: ProjectEntryFormValues) => {
    const result = projectEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof ProjectEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof ProjectEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Project" : "New Project"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)} enableReinitialize>
          {({ values, setFieldValue }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
                <Field name="name" label="Project Name" placeholder="e.g. TNM Setup" component={FormikInput} />
                <Field name="description" label="Description (optional)" placeholder="Optional description" multiline component={FormikInput} />
                <Field
                  name="taskCreationPermission"
                  label="Who can create tasks?"
                  options={PERMISSION_OPTIONS}
                  component={FormikSelect}
                />

                {!isEdit && (
                  <div>
                    <div className="form-input-label mb-2">Project Employees</div>
                    <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3 flex flex-col gap-2">
                      {userOptions.length === 0 ? (
                        <p className="text-xs text-slate-400">No users available.</p>
                      ) : (
                        userOptions.map((u) => {
                          const checked = (values.memberIds || []).map(Number).includes(u.id);
                          return (
                            <label key={u.id} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  const current = (values.memberIds || []).map(Number);
                                  if (e.target.checked) {
                                    setFieldValue("memberIds", [...current, u.id]);
                                  } else {
                                    setFieldValue("memberIds", current.filter((id) => id !== u.id));
                                  }
                                }}
                                className="h-4 w-4 rounded border-slate-300"
                              />
                              {u.name} <span className="text-slate-400">({u.email})</span>
                            </label>
                          );
                        })
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Project" : "Create Project"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default ProjectFormModal;
