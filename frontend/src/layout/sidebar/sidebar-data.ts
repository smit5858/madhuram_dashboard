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
    /**
     * Optional query string appended to `path` when navigating (e.g. "?direction=IN").
     * Permission checks and icon lookup still key off `path` alone — this is purely
     * for distinguishing children that share one underlying permission-guarded route.
     */
    search?: string;
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
    { path: "/products",  name: "Products"  },
    { path: "/sells",     name: "Sells"     },
    {
        path: "/couriers",
        name: "Couriers",
        children: [
            { path: "/couriers", name: "Outgoing Couriers", search: "?direction=OUT" },
            { path: "/couriers", name: "Incoming Couriers", search: "?direction=IN" },
        ],
    },
    { path: "/customers", name: "Customers" },
    { path: "/users",     name: "Users"     },
    {
        path: "/account",
        name: "Account",
        children: [
            { path: "/account/income", name: "Income" }, 
            { path: "/account/expense", name: "Expense" },
            { path: "/account/credit", name: "Credit" },
            { path: "/account/pending-bills", name: "Pending Bills" },
            { path: "/account/account", name: "Account" },
        ],
    },
    { path: "/setting",     name: "Setting"     },
];
