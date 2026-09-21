import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";
import type { TaskActivityEntry } from "./task.service";
import type { TaskStatus } from "@/shared/constants/taskStatus";

export interface TimesheetEntryData {
  id: number;
  userId: number;
  /** The employee who logged the entry. */
  user?: { id: number; name: string } | null;
  /** The Admin who last corrected the entry, if anyone has. */
  updatedBy?: number | null;
  editor?: { id: number; name: string } | null;
  taskId?: number | null;
  task?: { id: number; title: string; status: TaskStatus; projectId?: number | null } | null;
  projectId?: number | null;
  project?: { id: number; name: string } | null;
  /** YYYY-MM-DD */
  workDate: string;
  description: string;
  /** 24h "HH:mm" */
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  durationMinutes: number;
  notes?: string | null;
  /** What the entry was linked to before that task/project was deleted. */
  deletedTaskTitle?: string | null;
  deletedProjectName?: string | null;
  /** True only for Admin — employees add entries but cannot edit or delete them. */
  canEdit: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface TimesheetTaskOption {
  id: number;
  title: string;
  status: TaskStatus;
  projectId?: number | null;
  project?: { id: number; name: string } | null;
}

export interface TimesheetProjectOption {
  id: number;
  name: string;
  status?: string;
}

export interface TimesheetOptions {
  canViewAll: boolean;
  tasks: TimesheetTaskOption[];
  projects: TimesheetProjectOption[];
  /** Only populated for users who can view everyone's timesheets. */
  users: { id: number; name: string }[];
}

export interface TimesheetFilters {
  userId?: number | string;
  projectId?: number | string;
  taskId?: number | string;
  /** Single day (YYYY-MM-DD) — shorthand for from = to. */
  date?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface TimesheetSummary {
  totalMinutes: number;
  entryCount: number;
  byDate: { date: string; minutes: number }[];
  byTask: {
    taskId: number | null;
    title: string | null;
    status: TaskStatus | null;
    projectId: number | null;
    projectName: string | null;
    minutes: number;
  }[];
  byUser: { userId: number; name: string; minutes: number }[];
}

export interface SaveTimesheetPayload {
  workDate: string;
  taskId: number | null;
  projectId: number | null;
  description: string;
  startTime: string;
  endTime: string;
  endsNextDay: boolean;
  notes?: string | null;
}

const getTimesheets = (filters: TimesheetFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: TimesheetEntryData[]; meta: PaginationMeta; summary: { totalMinutes: number } }>("/timesheets", {
    params: filters,
    signal: config?.signal,
  });

const getTimesheetSummary = (filters: TimesheetFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: TimesheetSummary }>("/timesheets/summary", { params: filters, signal: config?.signal });

const getTimesheetOptions = () => httpService.get<{ success: boolean; data: TimesheetOptions }>("/timesheets/options");

const getTimesheetActivity = (params: { userId?: number | string; page?: number; limit?: number } = {}) =>
  httpService.get<{ success: boolean; data: TaskActivityEntry[]; meta: PaginationMeta }>("/timesheets/activity", { params });

const createTimesheet = (data: SaveTimesheetPayload) =>
  httpService.post<{ success: boolean; message: string; data: TimesheetEntryData }>("/timesheets", data);

const updateTimesheet = (id: number, data: SaveTimesheetPayload) =>
  httpService.put<{ success: boolean; message: string; data: TimesheetEntryData }>(`/timesheets/${id}`, data);

const deleteTimesheet = (id: number) => httpService.delete<{ success: boolean; message: string }>(`/timesheets/${id}`);

export default {
  getTimesheets,
  getTimesheetSummary,
  getTimesheetOptions,
  getTimesheetActivity,
  createTimesheet,
  updateTimesheet,
  deleteTimesheet,
};
