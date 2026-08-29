import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { useState } from "react";
import type { RootState } from "../../store/store";
import { logout } from "../../store/slices/authSlice";
import LOGO from "@/assets/logo.jpg";
import { ALL_SIDEBAR_ITEMS, type SidebarItem } from "./sidebar-data";
import {
    LayoutDashboard,
    Truck,
    Users,
    UserCircle2,
    TrendingUp,
    Receipt,
    Wallet,
    Contact,
    ChevronDown,
    LogOut,
    Package,
    Settings,
    ArrowUpRight,
    ArrowDownLeft,
    Banknote,
    CreditCard,
    FileClock,
    Building2,
    type LucideIcon,
} from "lucide-react";

// Keyed by exact `path` (or `path + search` for children that share a path,
// e.g. the couriers Outgoing/Incoming tabs) so each sidebar entry gets its
// own icon instead of falling back to a substring match.
const ROUTE_ICON_MAP: Record<string, LucideIcon> = {
    "/dashboard": LayoutDashboard,
    "/products": Package,
    "/sells": TrendingUp,
    "/couriers": Truck,
    "/couriers?direction=out": ArrowUpRight,
    "/couriers?direction=in": ArrowDownLeft,
    "/couriers-companies": Building2,
    "/customers": Contact,
    "/users": Users,
    "/account": UserCircle2,
    "/account/income": Banknote,
    "/account/expense": Receipt,
    "/account/credit": CreditCard,
    "/account/pending-bills": FileClock,
    "/account/account": Wallet,
    "/setting": Settings,
};

const getIconForRoute = (path: string, search?: string, className = "h-5 w-5") => {
    const key = `${path}${search ?? ""}`.toLowerCase();
    const Icon = ROUTE_ICON_MAP[key] ?? ROUTE_ICON_MAP[path.toLowerCase()] ?? LayoutDashboard;
    return <Icon className={className} strokeWidth={1.5} />;
};

const Sidebar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const dispatch = useDispatch();

    const { allowedRoutes, permissions, name, role } = useSelector(
        (state: RootState) => state.auth
    );
    // Only one parent group can be expanded at a time. Defaults to whichever
    // group contains the currently active route.
    const [openGroupPath, setOpenGroupPath] = useState<string | null>(() => {
        const activeGroup = ALL_SIDEBAR_ITEMS.find((item) =>
            item.children?.some(
                (child) => location.pathname.toLowerCase() === child.path.toLowerCase()
            )
        );
        return activeGroup?.path ?? null;
    });

    const canReadRoutePaths = new Set(
        (permissions ?? [])
            .filter((permission) => permission.canRead)
            .map((permission) => permission.routePath.toLowerCase())
    );

    const hasLegacyAccess = (path: string) =>
        (allowedRoutes ?? []).some(
            (route) => route.path.toLowerCase() === path.toLowerCase()
        );

    const hasRouteAccess = (path: string) => {
        if (canReadRoutePaths.size > 0) {
            return canReadRoutePaths.has(path.toLowerCase());
        }

        // Fallback for legacy flows where only allowedRoutes may be present.
        return hasLegacyAccess(path);
    };

    const visibleSidebarItems: SidebarItem[] = ALL_SIDEBAR_ITEMS
        .map((item) => {
            if (!item.children || item.children.length === 0) {
                return hasRouteAccess(item.path) ? item : null;
            }

            const visibleChildren = item.children.filter((child) => hasRouteAccess(child.path));
            if (visibleChildren.length === 0) {
                return null;
            }

            return {
                ...item,
                children: visibleChildren,
            };
        })
        .filter((item): item is SidebarItem => item !== null);

    const handleLogout = () => {
        dispatch(logout());
        navigate("/");
    };

    const toggleGroup = (path: string) => {
        setOpenGroupPath((prev) => (prev === path ? null : path));
    };

    return (
        <div className="flex h-screen w-75 flex-col justify-between border-r border-[#e0e0e0] bg-[#1e293b] text-slate-300">
            <div>
                {/* Branding/Header */}
                <div className="flex items-center gap-3 border-b border-slate-700 px-6 py-5">
                    <img
                        src={LOGO}
                        alt="Madhuram Motors Logo"
                        className="h-10 w-10 rounded-full object-cover border-2 border-blue-500"
                    />
                    <div>
                        <h2 className="text-base font-bold text-white tracking-wide">
                            Madhuram Motors
                        </h2>
                        <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">
                            CRM Dashboard
                        </span>
                    </div>
                </div>

                {/* Navigation Menu */}
                <nav className="mt-6 px-4 space-y-1.5">
                    {visibleSidebarItems.length > 0 ? (
                        visibleSidebarItems.map((item) => {
                            if (item.children && item.children.length > 0) {
                                const hasActiveChild = item.children.some(
                                    (child) => location.pathname.toLowerCase() === child.path.toLowerCase()
                                );
                                const isOpen = openGroupPath === item.path;

                                return (
                                    <div key={item.path}>
                                        <button
                                            type="button"
                                            onClick={() => toggleGroup(item.path)}
                                            className="flex w-full items-center justify-between rounded-lg px-4 py-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white"
                                        >
                                            <span className={`flex items-center gap-3 ${hasActiveChild ? "text-blue-400" : ""}`}>
                                                {getIconForRoute(item.path)}
                                                <span>{item.name}</span>
                                            </span>
                                            <ChevronDown
                                                className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                strokeWidth={1.8}
                                            />
                                        </button>

                                        <div className={`${isOpen ? "block" : "hidden"} space-y-1 pt-1`}>
                                            {item.children.map((child) => {
                                                const childHref = child.search ? `${child.path}${child.search}` : child.path;
                                                const currentHref = `${location.pathname}${location.search}`;
                                                const isChildActive = child.search
                                                    ? currentHref.toLowerCase() === childHref.toLowerCase()
                                                    : location.pathname.toLowerCase() === child.path.toLowerCase();

                                                return (
                                                    <NavLink
                                                        key={childHref}
                                                        to={childHref}
                                                        className={`ml-3 flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-150 ${
                                                            isChildActive
                                                                ? "bg-[#3d6fe0] text-white shadow-md shadow-blue-500/20"
                                                                : "hover:bg-slate-800 hover:text-white"
                                                        }`}
                                                    >
                                                        {getIconForRoute(child.path, child.search)}
                                                        <span>{child.name}</span>
                                                    </NavLink>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            }

                            const isActive = location.pathname.toLowerCase() === item.path.toLowerCase();

                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    className={`flex items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-150 ${
                                        isActive
                                            ? "bg-[#3d6fe0] text-white shadow-md shadow-blue-500/20"
                                            : "hover:bg-slate-800 hover:text-white"
                                    }`}
                                >
                                    {getIconForRoute(item.path)}
                                    <span>{item.name}</span>
                                </NavLink>
                            );
                        })
                    ) : (
                        <div className="px-4 py-3 text-xs text-slate-500">
                            No menu routes loaded.
                        </div>
                    )}
                </nav>
            </div>

            {/* Profile & Logout Footer */}
            <div className="border-t border-slate-700 p-4">
                <div className="flex items-center justify-between rounded-lg bg-slate-800/60 p-3">
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-white">
                            {name || "Loading User..."}
                        </p>
                        <p className="text-xs text-blue-400 font-medium capitalize">
                            Role: {role || "Staff"}
                        </p>
                    </div>

                    <button
                        onClick={handleLogout}
                        title="Logout"
                        className="ml-3 rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                    >
                        <LogOut className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;