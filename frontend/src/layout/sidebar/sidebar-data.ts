/**
 * sidebar-data.ts
 *
 * Master list of all possible sidebar routes in the application.
 * The Sidebar component reads permissions from Redux state (loaded once at login)
 * and filters this list to show only routes where canRead === true.
 *
 * DO NOT call any API from this file.
 * Filtering is done by reading the already-stored permission state.
 */

export interface SidebarItem {
    /** Matches the routePath in the DB routes table */
    path: string;
    /** Display label */
    name: string;
}

/**
 * All possible sidebar entries.
 * The Sidebar component will show only entries where
 * the stored permissions include canRead === true for that path.
 */
export const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/couriers",  name: "Couriers"  },
    { path: "/users",     name: "Users"     },
    { path: "/reports",   name: "Reports"   },
];
