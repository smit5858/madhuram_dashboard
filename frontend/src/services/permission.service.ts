import httpService from "./http-service";
import type { RoutePermission } from "../store/slices/authSlice";

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

/**
 * Called ONCE after login — returns the full permission set for the logged-in user's role.
 * All modules use the stored result; this is NOT called again when navigating between pages.
 */
const getAllPermissionsService = () =>
    httpService.get<{ success: boolean; permissions: RoutePermission[] }>("/permissions/all");

/** Legacy — returns sidebar-visible routes only (canRead === true), no CRUD flags */
const getSidebarPermissionsService = () =>
    httpService.get<{ success: boolean; routes: SidebarRoute[] }>("/permissions/sidebar");

/** Legacy — returns CRUD flags for a single route by routeId or path */
const getPagePermissionsService = (routeId?: number, path?: string) =>
    httpService.get<PagePermissions>("/permissions", {
        params: { routeId, path },
    });

export default {
    getAllPermissionsService,
    getSidebarPermissionsService,
    getPagePermissionsService,
};
