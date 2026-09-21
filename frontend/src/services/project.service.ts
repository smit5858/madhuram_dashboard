import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export interface ProjectMemberData {
  id: number;
  projectId: number;
  userId: number;
  user?: { id: number; name: string; email: string } | null;
  addedBy: number;
  addedAt: string;
  removedAt?: string | null;
}

export interface ProjectTaskSummary {
  id: number;
  title: string;
  status: string;
  priority: string;
  dueAt?: string | null;
  createdAt: string;
}

export interface ProjectActivityEntry {
  id: number;
  action: string;
  actorId: number;
  actor?: { id: number; name: string } | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
  createdAt: string;
}

export type TaskCreationPermission = "ADMIN_ONLY" | "ADMIN_AND_MEMBERS";

export interface ProjectData {
  id: number;
  name: string;
  description?: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
  taskCreationPermission: TaskCreationPermission;
  createdBy: number;
  creator?: { id: number; name: string; email: string } | null;
  members?: ProjectMemberData[];
  tasks?: ProjectTaskSummary[];
  activityLog?: ProjectActivityEntry[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateProjectPayload {
  name: string;
  description?: string;
  taskCreationPermission?: TaskCreationPermission;
  memberIds?: number[];
}

export interface UpdateProjectPayload {
  name?: string;
  description?: string;
  status?: ProjectData["status"];
  taskCreationPermission?: TaskCreationPermission;
}

export interface ProjectFilters {
  search?: string;
  status?: ProjectData["status"] | "";
  page?: number;
  limit?: number;
}

const getProjects = (filters: ProjectFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: ProjectData[]; meta: PaginationMeta }>("/projects", {
    params: filters,
    signal: config?.signal,
  });

const getProjectById = (id: number) => httpService.get<{ success: boolean; data: ProjectData }>(`/projects/${id}`);

const createProject = (data: CreateProjectPayload) =>
  httpService.post<{ success: boolean; message: string; data: ProjectData }>("/projects", data);

const updateProject = (id: number, data: UpdateProjectPayload) =>
  httpService.put<{ success: boolean; message: string; data: ProjectData }>(`/projects/${id}`, data);

const deleteProject = (id: number) => httpService.delete<{ success: boolean; message: string }>(`/projects/${id}`);

const addProjectMembers = (id: number, memberIds: number[]) =>
  httpService.post<{ success: boolean; message: string; data: ProjectMemberData[] }>(`/projects/${id}/members`, { memberIds });

const removeProjectMember = (id: number, memberId: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/projects/${id}/members/${memberId}`);

export default {
  getProjects,
  getProjectById,
  createProject,
  updateProject,
  deleteProject,
  addProjectMembers,
  removeProjectMember,
};
