import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { type RootState } from "../store/store";
import { setPermissions } from "../store/slices/authSlice";
import permissionService from "../services/permission.service";

/**
 * AuthGuard — redirects to login if no token is present.
 */
export const AuthGuard = ({ children }: { children: React.ReactElement }) => {
    const { token } = useSelector((state: RootState) => state.auth);
    const location = useLocation();

    if (!token) {
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    return children;
};

/**
 * PermissionGuard — checks the already-loaded permission state (stored after login).
 *
 * Does NOT call the permission API. Permissions are loaded once in Login.tsx and stored
 * in Redux + sessionStorage. On session restore (page refresh), permissions are rehydrated
 * from sessionStorage. If somehow permissions are null despite having a token (edge case),
 * it re-fetches once, then caches for the rest of the session.
 *
 * Navigation between modules uses the stored permissions — no API call per module.
 */
export const PermissionGuard = ({ children, requiredPath }: { children: React.ReactElement; requiredPath: string }) => {
    const { allowedRoutes, permissions, token } = useSelector((state: RootState) => state.auth);
    const dispatch = useDispatch();

    // If permissions are null but token exists (session restore edge case), do a single re-fetch
    const needsRestore = token && permissions === null;
    const [restoring, setRestoring] = useState(needsRestore);

    useEffect(() => {
        if (!needsRestore) return;

        permissionService.getAllPermissionsService()
            .then((res) => {
                const allPermissions = res.data?.permissions || [];
                dispatch(setPermissions(allPermissions));
            })
            .catch((err) => {
                console.error("Failed to restore permissions from session", err);
            })
            .finally(() => {
                setRestoring(false);
            });
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Run only once on mount

    if (restoring) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-[#f3f6ff]">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
                    <div className="text-sm font-medium text-[#3d6fe0]">Verifying credentials...</div>
                </div>
            </div>
        );
    }

    // Check if the current route path is in allowedRoutes (canRead === true)
    const hasAccess = allowedRoutes?.some(
        (r: any) => r.path.toLowerCase() === requiredPath.toLowerCase()
    );

    if (!hasAccess) {
        return <Navigate to="/forbidden" replace />;
    }

    return children;
};
