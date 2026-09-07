import httpService from "./http-service";

export interface RouteSettingPermission {
  routeId: number;
  routeName: string;
  routePath: string;
  /** Parent grouping label for the permission matrix (e.g. "Courier", "Account", "Setting") */
  module?: string | null;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  viewAllRecords: boolean;
  isOverride: boolean;
}

export interface RouteSettingUserPermissionsResponse {
  success: boolean;
  data: {
    user: { id: number; name: string; email: string; roleId: number; roleName?: string };
    permissions: RouteSettingPermission[];
  };
}

export interface UpdatePermissionEntry {
  routeId: number;
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  viewAllRecords: boolean;
}

const getUserPermissions = (userId: number) =>
  httpService.get<RouteSettingUserPermissionsResponse>(`/route-settings/${userId}/permissions`);

const updateUserPermissions = (userId: number, permissions: UpdatePermissionEntry[]) =>
  httpService.put<{ success: boolean; message: string }>(`/route-settings/${userId}/permissions`, {
    permissions,
  });

export default {
  getUserPermissions,
  updateUserPermissions,
};
