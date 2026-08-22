import React, { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { type RootState } from "../store/store";
import { setAllowedRoutes } from "../store/slices/authSlice";
import permissionService from "../services/permission.service";

export const AuthGuard = ({ children }: { children: React.ReactElement }) => {
    const { token } = useSelector((state: RootState) => state.auth);
    const location = useLocation();

    if (!token) {
        return <Navigate to="/" state={{ from: location }} replace />;
    }

    return children;
};

export const PermissionGuard = ({ children, requiredPath }: { children: React.ReactElement; requiredPath: string }) => {
    const { allowedRoutes, token } = useSelector((state: RootState) => state.auth);
    const dispatch = useDispatch();
    const [loading, setLoading] = useState(!allowedRoutes);

    useEffect(() => {
        if (token && !allowedRoutes) {
            permissionService.getSidebarPermissionsService()
                .then((res) => {
                    // AxiosResponse might expose standard .data structure
                    const routes = res.data?.routes || [];
                    dispatch(setAllowedRoutes(routes));
                    setLoading(false);
                })
                .catch((err) => {
                    console.error("Failed to load permissions", err);
                    setLoading(false);
                });
        } else if (allowedRoutes) {
            setLoading(false);
        }
    }, [token, allowedRoutes, dispatch]);

    if (loading) {
        return (
            <div className="flex h-screen w-screen items-center justify-center bg-[#f3f6ff]">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
                    <div className="text-sm font-medium text-[#3d6fe0]">Verifying credentials...</div>
                </div>
            </div>
        );
    }

    // Check if the current route path is in allowedRoutes
    const hasAccess = allowedRoutes?.some(
        (r:any) => r.path.toLowerCase() === requiredPath.toLowerCase()
    );

    if (!hasAccess) {
        return <Navigate to="/forbidden" replace />;
    }

    return children;
};
