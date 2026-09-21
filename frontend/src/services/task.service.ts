import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";
import type { TaskType } from "@/shared/constants/taskType";
import type { TaskPriority } from "@/shared/constants/taskPriority";
import type { TaskStatus } from "@/shared/constants/taskStatus";

export interface TaskUserRef {
  id: number;
  name: string;
  email?: string;
}

export interface TaskAssigneeData {
  id: number;
  taskId: number;
  userId: number;
  user?: TaskUserRef | null;
  assignedBy: number;
  assignedAt: string;
  removedAt?: string | null;
}

export interface TaskStatusHistoryEntry {
  id: number;
  taskId: number;
  oldStatus: string | null;
  newStatus: string;
  changedBy: number;
  changedByUser?: TaskUserRef | null;
  changedAt: string;
  note?: string | null;
}

export interface TaskActivityEntry {
  id: number;
  action: string;
  actorId: number;
  actor?: TaskUserRef | null;
  /** Whose record the entry is about, when that isn't the actor (timesheet entries an Admin edits). */
  subject?: TaskUserRef | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
  createdAt: string;
}

export interface TaskNoteData {
  id: number;
  taskId: number;
  content: string;
  createdBy: number;
  author?: TaskUserRef | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskData {
  id: number;
  title: string;
  description?: string | null;
  taskType: TaskType;
  projectId?: number | null;
  project?: { id: number; name: string; taskCreationPermission?: string } | null;
  priority: TaskPriority;
  status: TaskStatus;
  startAt?: string | null;
  dueAt?: string | null;
  createdBy: number;
  creator?: TaskUserRef | null;
  completedBy?: number | null;
  completer?: TaskUserRef | null;
  completedAt?: string | null;
  assignees?: TaskAssigneeData[];
  statusHistory?: TaskStatusHistoryEntry[];
  activityLog?: TaskActivityEntry[];
  notes?: TaskNoteData[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateTaskPayload {
  title: string;
  description?: string;
  taskType: TaskType;
  projectId?: number;
  priority?: TaskPriority;
  startAt?: string;
  dueAt?: string;
  assigneeIds?: number[];
}

export interface UpdateTaskPayload {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  startAt?: string;
  dueAt?: string;
}

export interface TaskFilters {
  search?: string;
  status?: TaskStatus | "";
  priority?: TaskPriority | "";
  taskType?: TaskType | "";
  projectId?: number | string;
  assigneeId?: number | string;
  page?: number;
  limit?: number;
}

const getTasks = (filters: TaskFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: TaskData[]; meta: PaginationMeta }>("/tasks", {
    params: filters,
    signal: config?.signal,
  });

const getTaskById = (id: number) => httpService.get<{ success: boolean; data: TaskData }>(`/tasks/${id}`);

const createTask = (data: CreateTaskPayload) => httpService.post<{ success: boolean; message: string; data: TaskData }>("/tasks", data);

const updateTask = (id: number, data: UpdateTaskPayload) =>
  httpService.put<{ success: boolean; message: string; data: TaskData }>(`/tasks/${id}`, data);

const updateTaskStatus = (id: number, status: TaskStatus, note?: string) =>
  httpService.put<{ success: boolean; message: string; data: TaskData }>(`/tasks/${id}/status`, { status, note });

const deleteTask = (id: number) => httpService.delete<{ success: boolean; message: string }>(`/tasks/${id}`);

const reassignTask = (id: number, assigneeId: number) =>
  httpService.put<{ success: boolean; message: string; data: TaskData }>(`/tasks/${id}/assign`, { assigneeId });

const addTaskNote = (id: number, content: string) =>
  httpService.post<{ success: boolean; message: string; data: TaskNoteData }>(`/tasks/${id}/notes`, { content });

const updateTaskNote = (id: number, noteId: number, content: string) =>
  httpService.put<{ success: boolean; message: string; data: TaskNoteData }>(`/tasks/${id}/notes/${noteId}`, { content });

const addTaskAssignees = (id: number, assigneeIds: number[]) =>
  httpService.post<{ success: boolean; message: string; data: TaskAssigneeData[] }>(`/tasks/${id}/assignees`, { assigneeIds });

const removeTaskAssignee = (id: number, userId: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/tasks/${id}/assignees/${userId}`);

export default {
  getTasks,
  getTaskById,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
  reassignTask,
  addTaskNote,
  updateTaskNote,
  addTaskAssignees,
  removeTaskAssignee,
};
