import { useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { useSelector } from "react-redux";
import { AlertTriangle, ArrowLeft, KanbanSquare, List, Plus, Settings2, Trash2, Users } from "lucide-react";
import type { RootState } from "@/store/store";
import projectService from "@/services/project.service";
import { useDocumentTitle } from "@/hook/useDocumentTitle";
import { formatDisplayDate, formatDateTime } from "@/shared/utils/date";
import TaskStatusBadge from "../tasks/components/TaskStatusBadge";
import TaskPriorityBadge from "../tasks/components/TaskPriorityBadge";
import TaskFormModal from "../tasks/components/TaskFormModal";
import TaskViewModal from "../tasks/components/TaskViewModal";
import TaskBoard from "../tasks/components/TaskBoard";
import ProjectMembersModal from "./components/ProjectMembersModal";
import ConfirmDeleteModal from "../tasks/components/ConfirmDeleteModal";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

const ProjectDetail = () => {
  const { id } = useParams<{ id: string }>();
  const projectId = Number(id);
  const navigate = useNavigate();
  const { role, userId } = useSelector((state: RootState) => state.auth);
  const isAdmin = role === "Admin";

  const [showTaskModal, setShowTaskModal] = useState(false);
  const [viewTaskId, setViewTaskId] = useState<number | null>(null);
  const [showMembersModal, setShowMembersModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [taskView, setTaskView] = useState<"list" | "board">("list");
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: () => projectService.deleteProject(projectId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Project deleted");
      queryClient.removeQueries({ queryKey: ["projects", "detail", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate("/projects");
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to delete project"),
  });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["projects", "detail", projectId],
    queryFn: () => projectService.getProjectById(projectId),
    enabled: Number.isFinite(projectId),
  });
  const project = data?.data?.data;

  useDocumentTitle(project?.name || "Project");

  const isMember = useMemo(
    () => !!project?.members?.some((m) => !m.removedAt && m.userId === userId),
    [project, userId]
  );

  const canCreateTask = isAdmin || (isMember && project?.taskCreationPermission === "ADMIN_AND_MEMBERS");

  if (isLoading) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="flex h-48 flex-col items-center justify-center text-red-500 gap-1 text-center px-4">
          <AlertTriangle className="h-8 w-8" />
          <p className="text-sm font-semibold">{(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load project"}</p>
        </div>
      </div>
    );
  }

  const activeMembers = (project.members || []).filter((m) => !m.removedAt);

  return (
    <div className="flex flex-col gap-6">
      <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-4">
        <button type="button" onClick={() => navigate("/projects")} className="inline-flex w-fit items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Projects
        </button>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{project.name}</h2>
            {project.description && <p className="mt-1 max-w-xl text-sm text-slate-500">{project.description}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span>Created by {project.creator?.name || "—"}</span>
              <span>·</span>
              <span>{formatDisplayDate(project.createdAt)}</span>
              <span>·</span>
              <span>{project.taskCreationPermission === "ADMIN_AND_MEMBERS" ? "Admin + Members can create tasks" : "Admin-only task creation"}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowMembersModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Settings2 className="h-3.5 w-3.5" /> Members
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 px-4 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
              >
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </button>
            )}
            {canCreateTask && (
              <button
                type="button"
                onClick={() => setShowTaskModal(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-[#3d6fe0] px-4 py-2 text-xs font-semibold text-white shadow-md shadow-blue-500/10 hover:bg-[#3162d2]"
              >
                <Plus className="h-3.5 w-3.5" /> New Task
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
          <Users className="h-3.5 w-3.5 text-slate-400" />
          {activeMembers.length === 0 ? (
            <span>No members yet.</span>
          ) : (
            activeMembers.map((m) => (
              <span key={m.id} className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                {m.user?.name || `#${m.userId}`}
              </span>
            ))
          )}
        </div>
      </div>

      <div className="p-6 bg-white rounded-xl shadow-md">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-bold uppercase tracking-wide text-slate-400">Tasks</h3>
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-0.5">
            {(
              [
                { mode: "list", label: "List", Icon: List },
                { mode: "board", label: "Board", Icon: KanbanSquare },
              ] as const
            ).map(({ mode, label, Icon }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTaskView(mode)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                  taskView === mode ? "bg-white text-[#3d6fe0] shadow-sm" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>
        </div>
        {taskView === "board" ? (
          <TaskBoard filters={{ projectId }} onOpenTask={setViewTaskId} />
        ) : !project.tasks || project.tasks.length === 0 ? (
          <div className="flex h-32 items-center justify-center text-sm text-slate-400">No tasks in this project yet.</div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
              <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                <tr>
                  <th className="px-4 py-3 whitespace-nowrap">Task</th>
                  <th className="px-4 py-3 whitespace-nowrap">Priority</th>
                  <th className="px-4 py-3 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3 whitespace-nowrap">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {project.tasks.map((task) => (
                  <tr key={task.id} className="cursor-pointer hover:bg-gray-50" onClick={() => setViewTaskId(task.id)}>
                    <td className="px-4 py-3 font-medium text-blue-700">{task.title}</td>
                    <td className="px-4 py-3">
                      <TaskPriorityBadge priority={task.priority} />
                    </td>
                    <td className="px-4 py-3">
                      <TaskStatusBadge status={task.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-500">{task.dueAt ? formatDateTime(task.dueAt) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="p-6 bg-white rounded-xl shadow-md">
        <h3 className="mb-4 text-sm font-bold uppercase tracking-wide text-slate-400">Activity</h3>
        {!project.activityLog || project.activityLog.length === 0 ? (
          <div className="flex h-24 items-center justify-center text-sm text-slate-400">No activity recorded yet.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {project.activityLog.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3 text-xs">
                <div className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-300" />
                <div>
                  <span className="font-semibold text-slate-700">{entry.actor?.name || "Someone"}</span>{" "}
                  <span className="text-slate-500">{entry.action.replace(/_/g, " ").toLowerCase()}</span>
                  <span className="ml-2 text-slate-400">{formatDateTime(entry.createdAt)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showTaskModal && (
        <TaskFormModal
          task={null}
          defaultTaskType="PROJECT_TASK"
          defaultProjectId={project.id}
          onClose={() => setShowTaskModal(false)}
        />
      )}
      {viewTaskId !== null && <TaskViewModal taskId={viewTaskId} onClose={() => setViewTaskId(null)} />}
      {showMembersModal && <ProjectMembersModal project={project} onClose={() => setShowMembersModal(false)} />}
      {showDeleteModal && (
        <ConfirmDeleteModal
          title="Delete Project"
          itemName={project.name}
          warning="All tasks in this project, with their notes and history, will be deleted too."
          isSubmitting={deleteMutation.isPending}
          onClose={() => setShowDeleteModal(false)}
          onConfirm={() => deleteMutation.mutate()}
        />
      )}
    </div>
  );
};

export default ProjectDetail;
