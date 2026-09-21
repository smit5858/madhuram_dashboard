import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { UserMinus, UserPlus, XCircle } from "lucide-react";
import projectService, { type ProjectData } from "@/services/project.service";
import userService from "@/services/user.service";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface ProjectMembersModalProps {
  /** Initial snapshot (from the list row) — superseded once the live detail query resolves, so
   *  adds/removes made in this modal show up immediately without waiting for it to be reopened. */
  project: ProjectData;
  onClose: () => void;
}

const ProjectMembersModal = ({ project: initialProject, onClose }: ProjectMembersModalProps) => {
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<number | "">("");

  const detailQueryKey = ["projects", "detail", initialProject.id];

  const { data: detailResp } = useQuery({
    queryKey: detailQueryKey,
    queryFn: () => projectService.getProjectById(initialProject.id),
  });
  const project = detailResp?.data?.data || initialProject;

  const { data: usersResp } = useQuery({
    queryKey: ["users", "for-project-members"],
    queryFn: () => userService.getUsers({ limit: 100, status: "active" }),
  });

  const activeMembers = (project.members || []).filter((m) => !m.removedAt);
  const activeMemberUserIds = new Set(activeMembers.map((m) => m.userId));
  const addableUsers = (usersResp?.data?.data || []).filter((u) => !activeMemberUserIds.has(u.id));

  const addMutation = useMutation({
    mutationFn: (userId: number) => projectService.addProjectMembers(project.id, [userId]),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Member added");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
      setSelectedUserId("");
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to add member");
    },
  });

  const removeMutation = useMutation({
    mutationFn: (userId: number) => projectService.removeProjectMember(project.id, userId),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Member removed");
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: detailQueryKey });
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to remove member");
    },
  });

  return (
    <div className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">Manage Members — {project.name}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : "")}
              className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700"
            >
              <option value="">Select a user to add...</option>
              {addableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.email})
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedUserId || addMutation.isPending}
              onClick={() => selectedUserId && addMutation.mutate(selectedUserId)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3560c4] disabled:opacity-50"
            >
              <UserPlus className="h-3.5 w-3.5" /> Add
            </button>
          </div>

          <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
            {activeMembers.length === 0 ? (
              <p className="p-4 text-center text-xs text-slate-400">No members yet.</p>
            ) : (
              activeMembers.map((m) => (
                <div key={m.id} className="flex items-center justify-between px-4 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{m.user?.name || `User #${m.userId}`}</p>
                    <p className="text-xs text-slate-400">{m.user?.email}</p>
                  </div>
                  <button
                    type="button"
                    disabled={removeMutation.isPending}
                    onClick={() => removeMutation.mutate(m.userId)}
                    className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    title="Remove"
                  >
                    <UserMinus className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProjectMembersModal;
