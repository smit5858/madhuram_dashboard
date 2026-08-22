import httpService from "./http-service";

export interface SidebarRoute {
    id: number;
    name: string;
    path: string;
}

export interface PagePermissions {
    canRead: boolean;
    canCreate: boolean;
    canUpdate: boolean;
    canDelete: boolean;
}

const getSidebarPermissionsService = () =>
    httpService.get<{ success: boolean; routes: SidebarRoute[] }>("/permissions/sidebar");

const getPagePermissionsService = (routeId?: number, path?: string) =>
    httpService.get<PagePermissions>("/permissions", {
        params: { routeId, path }
    });

export default {
    getSidebarPermissionsService,
    getPagePermissionsService,
};
