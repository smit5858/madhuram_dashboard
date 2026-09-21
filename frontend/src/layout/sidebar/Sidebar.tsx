import { NavLink, useNavigate, useLocation } from "react-router-dom";
import { useSelector, useDispatch } from "react-redux";
import { useEffect, useState } from "react";
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
    ChevronLeft,
    ChevronRight,
    LogOut,
    Package,
    Settings,
    ArrowUpRight,
    ArrowDownLeft,
    Banknote,
    FileClock,
    Building2,
    ShieldCheck,
    UserCog,
    UserSquare2,
    Share2,
    ClipboardList,
    ListChecks,
    FolderKanban,
    Clock,
    type LucideIcon,
} from "lucide-react";

const SIDEBAR_COLLAPSED_STORAGE_KEY = "sidebar:collapsed";

// Keyed by exact `path` (or `path + search` for children that share a path,
// e.g. the couriers Outgoing/Incoming tabs) so each sidebar entry gets its
// own icon instead of falling back to a substring match.
const ROUTE_ICON_MAP: Record<string, LucideIcon> = {
    "/dashboard": LayoutDashboard,
    "/products": Package,
    "/sells": TrendingUp,
    "/couriers": Truck,
    "/couriers?direction=out": ArrowUpRight,
    "/couriers/incoming": ArrowDownLeft,
    "/couriers-companies": Building2,
    "/customers": Contact,
    "/leads": UserSquare2,
    "/users": Users,
    "/account": UserCircle2,
    "/account/income": Banknote,
    "/account/expense": Receipt,
    "/account/pending-bill": ClipboardList,
    "/account/debited": FileClock,
    "/account/bank-accounts": Wallet,
    "/setting": Settings,
    "/setting/route-setting": ShieldCheck,
    "/setting/role-management": UserCog,
    "/settings/platforms": Share2,
    "/tasks": ListChecks,
    "/projects": FolderKanban,
    "/timesheets": Clock,
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
                (child) => location.pathname.toLowerCase() === (child.navPath ?? child.path).toLowerCase()
            )
        );
        return activeGroup?.path ?? null;
    });

    // Sidebar open/close (collapse) state. Persisted so the user's preference
    // survives a refresh; purely a UI/layout concern, unrelated to permissions.
    const [collapsed, setCollapsed] = useState<boolean>(() => {
        try {
            return window.sessionStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
        } catch {
            return false;
        }
    });

    useEffect(() => {
        try {
            window.sessionStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, collapsed ? "1" : "0");
        } catch {
            // Ignore storage failures (e.g. private browsing) — collapse still works for the session.
        }
    }, [collapsed]);

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

    // Shared classes for a nav-item label: collapses to zero width/opacity
    // instead of unmounting, so the width/opacity change can animate.
    const labelClasses = `overflow-hidden whitespace-nowrap transition-all duration-200 ${
        collapsed ? "max-w-0 opacity-0" : "ml-3 max-w-[10rem] opacity-100"
    }`;

    return (
        <div
            className={`relative flex h-screen flex-col border-r border-[#e0e0e0] bg-[#1e293b] text-slate-300 transition-[width] duration-200 ease-in-out ${
                collapsed ? "w-20" : "w-75"
            }`}
        >
            {/* Collapse/expand toggle — floats on the sidebar edge so it never
                needs to reflow with the header content. */}
            <button
                type="button"
                onClick={() => setCollapsed((prev) => !prev)}
                title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                className="absolute -right-3 top-8 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-slate-600 bg-slate-800 text-slate-300 shadow-md transition-colors hover:bg-slate-700 hover:text-white"
            >
                {collapsed ? <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.8} /> : <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.8} />}
            </button>

            {/* Branding/Header */}
            <div
                className={`flex items-center border-b border-slate-700 py-5 shrink-0 transition-all duration-200 ${
                    collapsed ? "justify-center gap-0 px-2" : "gap-3 px-6"
                }`}
            >
                <img
                    src={LOGO}
                    alt="Madhuram Motors Logo"
                    className="h-10 w-10 shrink-0 rounded-full object-cover border-2 border-blue-500"
                />
                <div className={`overflow-hidden whitespace-nowrap transition-all duration-200 ${collapsed ? "max-w-0 opacity-0" : "max-w-[10rem] opacity-100"}`}>
                    <h2 className="text-base font-bold text-white tracking-wide">
                        Madhuram Motors
                    </h2>
                    <span className="text-xs text-blue-400 font-medium uppercase tracking-wider">
                        CRM Dashboard
                    </span>
                </div>
            </div>

            {/* Navigation Menu */}
            <nav className="flex-1 min-h-0 overflow-y-auto mt-6 px-4 pb-4 space-y-1.5">
                {visibleSidebarItems.length > 0 ? (
                    visibleSidebarItems.map((item) => {
                            if (item.children && item.children.length > 0) {
                                const hasActiveChild = item.children.some(
                                    (child) => location.pathname.toLowerCase() === (child.navPath ?? child.path).toLowerCase()
                                );
                                const isOpen = openGroupPath === item.path;

                                return (
                                    <div key={item.path}>
                                        <button
                                            type="button"
                                            onClick={() => toggleGroup(item.path)}
                                            title={collapsed ? item.name : undefined}
                                            className={`flex w-full items-center rounded-lg py-3 text-left text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800 hover:text-white ${
                                                collapsed ? "justify-center px-0" : "justify-between px-4"
                                            }`}
                                        >
                                            <span className={`flex items-center ${hasActiveChild ? "text-blue-400" : ""}`}>
                                                {getIconForRoute(item.path)}
                                                <span className={labelClasses}>{item.name}</span>
                                            </span>
                                            {!collapsed && (
                                                <ChevronDown
                                                    className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                                                    strokeWidth={1.8}
                                                />
                                            )}
                                        </button>

                                        <div
                                            className={`grid overflow-hidden transition-all duration-200 ${
                                                isOpen ? "grid-rows-[1fr] opacity-100 pt-1" : "grid-rows-[0fr] opacity-0"
                                            }`}
                                        >
                                            <div className="space-y-1 overflow-hidden">
                                                {item.children.map((child) => {
                                                    const childTarget = child.navPath ?? child.path;
                                                    const childHref = child.search ? `${childTarget}${child.search}` : childTarget;
                                                    const currentHref = `${location.pathname}${location.search}`;
                                                    const isChildActive = child.search
                                                        ? currentHref.toLowerCase() === childHref.toLowerCase()
                                                        : location.pathname.toLowerCase() === childTarget.toLowerCase();

                                                    return (
                                                        <NavLink
                                                            key={childHref}
                                                            to={childHref}
                                                            title={collapsed ? child.name : undefined}
                                                            className={`flex items-center rounded-lg py-3 text-sm font-medium transition-all duration-150 ${
                                                                collapsed ? "justify-center px-0" : "ml-3 px-4"
                                                            } ${
                                                                isChildActive
                                                                    ? "bg-[#3d6fe0] text-white shadow-md shadow-blue-500/20"
                                                                    : "hover:bg-slate-800 hover:text-white"
                                                            }`}
                                                        >
                                                            {getIconForRoute(child.path, child.search)}
                                                            <span className={labelClasses}>{child.name}</span>
                                                        </NavLink>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                );
                            }

                            const isActive = location.pathname.toLowerCase() === item.path.toLowerCase();

                            return (
                                <NavLink
                                    key={item.path}
                                    to={item.path}
                                    title={collapsed ? item.name : undefined}
                                    className={`flex items-center rounded-lg py-3 text-sm font-medium transition-all duration-150 ${
                                        collapsed ? "justify-center px-0" : "px-4"
                                    } ${
                                        isActive
                                            ? "bg-[#3d6fe0] text-white shadow-md shadow-blue-500/20"
                                            : "hover:bg-slate-800 hover:text-white"
                                    }`}
                                >
                                    {getIconForRoute(item.path)}
                                    <span className={labelClasses}>{item.name}</span>
                                </NavLink>
                            );
                        })
                    ) : (
                        <div className={`py-3 text-xs text-slate-500 transition-all duration-200 ${collapsed ? "px-0 text-center" : "px-4"}`}>
                            {collapsed ? "—" : "No menu routes loaded."}
                        </div>
                    )}
                </nav>

            {/* Profile & Logout Footer */}
            <div className={`border-t border-slate-700 shrink-0 transition-all duration-200 ${collapsed ? "p-2" : "p-4"}`}>
                <div className={`flex items-center rounded-lg bg-slate-800/60 transition-all duration-200 ${collapsed ? "flex-col gap-2 p-2" : "justify-between p-3"}`}>
                    {!collapsed && (
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold text-white">
                                {name || "Loading User..."}
                            </p>
                            <p className="text-xs text-blue-400 font-medium capitalize">
                                Role: {role || "Staff"}
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleLogout}
                        title="Logout"
                        className={`rounded-md p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors ${collapsed ? "" : "ml-3"}`}
                    >
                        <LogOut className="h-5 w-5" strokeWidth={1.5} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Sidebar;