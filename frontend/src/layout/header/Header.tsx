import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { type RootState } from "@/store/store";
import saleService from "@/services/sells.service";
import NotificationBell from "@/shared/components/NotificationBell";

const Header = () => {
    const location = useLocation();
    const auth = useSelector((state: RootState) => state.auth);
    const isAdmin = auth.role === "Admin";
    const isSellsRoute = location.pathname.toLowerCase().includes("sells");

    const { data: headerTotalsResponse } = useQuery({
        queryKey: ["sells-totals-header"],
        queryFn: () => saleService.getSellsTotals(),
        enabled: isSellsRoute && Boolean(auth.token),
    });

    const headerTotalAmount = headerTotalsResponse?.data?.data?.totalSellingAmount || 0;

    const getTitleFromPath = (pathname: string) => {
        const p = pathname.toLowerCase();
        if (p.includes('/users') || p.includes('users')) return 'User Management';
        if (p.includes('/clients') || p.includes('clients')) return 'Client Management';
        if (p.includes('/programs') || p.includes('programs')) return 'Program Management';
        if (p.includes('/dashboard') || p.includes('dashboard')) return 'Dashboard';
        if (p.includes('/couriers') || p.includes('couriers')) return 'Couriers Management';
        if (p.includes('/sells') || p.includes('sells')) return 'Sells & Inventory';
        if (p === '/' || p.includes('/home') || p.includes('home')) return 'Home';
        if (p.includes('/attendance') || p.includes('attendance')) return 'Attendance Management';
        // fallback: use first non-empty segment as a capitalized word + ' Management'
        const seg = pathname.replace(/^\/+|\/+$/g, '').split('/')[0];
        if (seg) return `${seg.charAt(0).toUpperCase()}${seg.slice(1)} Management`;
        return 'Management';
    }

    const title = getTitleFromPath(location.pathname);

    const nounForSubtitle = () => {
        if (title.includes('User')) return 'Manage all users in one place. Control access, assign roles, and monitor activity across your platform.';
        if (title.includes('Courier')) return 'Track, dispatch, and manage courier records with real-time updates.';
        if (title.includes('Sells')) return 'Create sells entries, manage stock levels, and monitor customer payments.';
        if (title.includes('Dashboard')) return 'Overview of your operations, shipments, and sells metrics.';
        return 'Manage and monitor records seamlessly across your platform.';
    }

    return (
        <div className="header w-full bg-white px-6 py-4 border-b border-slate-100">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 tracking-tight">{title}</h2>
                    <p className="text-xs text-slate-500 mt-0.5">{nounForSubtitle()}</p>
                </div>
                <div className="flex items-center gap-3">
                    {isSellsRoute && (
                        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-1.5 border border-blue-200 text-xs font-semibold text-blue-800 shadow-xs">
                            <span className="text-[11px] text-blue-600 font-medium">
                                {isAdmin ? "Total Sells:" : "My Total Sells:"}
                            </span>
                            <span className="font-mono font-bold text-blue-900">
                                ₹{headerTotalAmount.toLocaleString("en-IN")}
                            </span>
                        </div>
                    )}
                    <NotificationBell />
                </div>
            </div>
        </div>
    )
}

export default Header;