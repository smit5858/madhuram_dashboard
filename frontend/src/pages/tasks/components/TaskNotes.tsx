import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { Edit2 } from "lucide-react";
import taskService, { type TaskNoteData } from "@/services/task.service";
import { formatDateTime } from "@/shared/utils/date";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface TaskNotesProps {
  taskId: number;
  notes: TaskNoteData[];
  /** Admin or currently-assigned user — mirrors the backend's canNoteOnTask (UX only). */
  canNote: boolean;
  isAdmin: boolean;
  currentUserId?: number | null;
}

const MAX_NOTE_LENGTH = 5000;

const TaskNotes = ({ taskId, notes, canNote, isAdmin, currentUserId }: TaskNotesProps) => {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["tasks", "detail", taskId] });
  };

  const addMutation = useMutation({
    mutationFn: (content: string) => taskService.addTaskNote(taskId, content),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Note added");
      setDraft("");
      refresh();
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to add note"),
  });

  const editMutation = useMutation({
    mutationFn: ({ noteId, content }: { noteId: number; content: string }) => taskService.updateTaskNote(taskId, noteId, content),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Note updated");
      setEditingId(null);
      refresh();
    },
    onError: (err: ApiErrorLike) => toast.error(err.response?.data?.message || err.message || "Failed to update note"),
  });

  return (
    <div className="flex flex-col gap-3">
      {canNote && (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            maxLength={MAX_NOTE_LENGTH}
            rows={2}
            placeholder="Add a note..."
            className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!draft.trim() || addMutation.isPending}
              onClick={() => addMutation.mutate(draft.trim())}
              className="rounded-lg bg-[#3d6fe0] px-3 py-2 text-xs font-semibold text-white hover:bg-[#3560c4] disabled:opacity-50"
            >
              {addMutation.isPending ? "Adding..." : "Add Note"}
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-xs text-slate-400">No notes yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {notes.map((note) => {
            const canEdit = canNote && (isAdmin || note.createdBy === currentUserId);
            const edited = new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000;
            return (
              <div key={note.id} className="rounded-lg bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    <span className="font-semibold text-slate-600">{note.author?.name || "Someone"}</span> ·{" "}
                    {(formatDateTime(note.createdAt) || "").replace(", ", " ")}
                    {edited && <span className="ml-1 italic">(edited)</span>}
                  </span>
                  {canEdit && editingId !== note.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(note.id);
                        setEditDraft(note.content);
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      title="Edit note"
                    >
                      <Edit2 className="h-3 w-3" />
                    </button>
                  )}
                </div>
                {editingId === note.id ? (
                  <div className="mt-1 flex flex-col gap-2">
                    <textarea
                      value={editDraft}
                      onChange={(e) => setEditDraft(e.target.value)}
                      maxLength={MAX_NOTE_LENGTH}
                      rows={3}
                      className="w-full resize-y rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:border-[#3d6fe0] focus:outline-none"
                    />
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setEditingId(null)} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-white">
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={!editDraft.trim() || editMutation.isPending}
                        onClick={() => editMutation.mutate({ noteId: note.id, content: editDraft.trim() })}
                        className="rounded-lg bg-[#3d6fe0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3560c4] disabled:opacity-50"
                      >
                        {editMutation.isPending ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{note.content}</p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default TaskNotes;
