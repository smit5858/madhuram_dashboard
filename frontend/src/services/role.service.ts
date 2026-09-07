import httpService from "./http-service";

export interface RoleData {
    id?: number;
    name: string;
    isActive?: boolean;
    /** Count of users currently holding this role — drives the "in use" delete guard message. */
    userCount?: number;
    createdAt?: string;
    updatedAt?: string;
}

const getRoles = () =>
    httpService.get<{ success: boolean; data: RoleData[] }>("/roles");

const createRole = (data: Partial<RoleData>) =>
    httpService.post<{ success: boolean; message: string; data: RoleData }>("/roles", data);

const updateRole = (id: number, data: Partial<RoleData>) =>
    httpService.put<{ success: boolean; message: string; data: RoleData }>(`/roles/${id}`, data);

const deleteRole = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/roles/${id}`);

const assignRoleToUser = (userId: number, roleId: number) =>
    httpService.put<{ success: boolean; message: string; data: unknown }>(`/roles/assign/${userId}`, { roleId });

export default {
    getRoles,
    createRole,
    updateRole,
    deleteRole,
    assignRoleToUser,
};
