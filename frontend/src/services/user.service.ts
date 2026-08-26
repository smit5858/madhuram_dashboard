import httpService from "./http-service";

export interface UserRole {
  id: number;
  name: string;
}

export interface UserData {
  id: number;
  name: string;
  email: string;
  roleId: number;
  Role?: UserRole;
  isActive: boolean;
  allowedCity?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  password: string;
  roleId: number;
  allowedCity?: string;
  isActive?: boolean;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  password?: string;
  roleId?: number;
  allowedCity?: string;
  isActive?: boolean;
}

export interface UserFilters {
  search?: string;
  role?: string | number;
  status?: "active" | "inactive" | "";
  page?: number;
  limit?: number;
}

export interface UserListResponse {
  success: boolean;
  data: UserData[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const getUsers = (filters: UserFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<UserListResponse>("/users", { params: filters, signal: config?.signal });

const getRoles = (config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: UserRole[] }>("/users/roles", { signal: config?.signal });

const getUserById = (id: number) =>
  httpService.get<{ success: boolean; data: UserData }>(`/users/${id}`);

const createUser = (data: CreateUserPayload) =>
  httpService.post<{ success: boolean; message: string; data: UserData }>("/users", data);

const updateUser = (id: number, data: UpdateUserPayload) =>
  httpService.put<{ success: boolean; message: string; data: UserData }>(`/users/${id}`, data);

const deleteUser = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/users/${id}`);

export default {
  getUsers,
  getRoles,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
};
