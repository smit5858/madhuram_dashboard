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
    /** Optional child routes for grouped modules */
    children?: SidebarItem[];
}

/**
 * All possible sidebar entries.
 * The Sidebar component will show only entries where
 * the stored permissions include canRead === true for that path.
 */
export const ALL_SIDEBAR_ITEMS: SidebarItem[] = [
    { path: "/dashboard", name: "Dashboard" },
    { path: "/couriers",  name: "Couriers"  },
    { path: "/customers", name: "Customers" },
    { path: "/sells",     name: "Sells"     },
    { path: "/users",     name: "Users"     },
    {
        path: "/account",
        name: "Account",
        children: [
            { path: "/account/sells", name: "Sells" },
            { path: "/account/expense", name: "Expense" },
            { path: "/account/debited", name: "Debited" },
        ],
    },
];
