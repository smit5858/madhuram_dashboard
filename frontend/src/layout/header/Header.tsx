import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { RotateCcw, Wallet } from "lucide-react";
import { type RootState } from "@/store/store";
import saleService from "@/services/sells.service";
import courierService from "@/services/courier.service";
import incomeService from "@/services/income.service";
import expenseService from "@/services/expense.service";
import NotificationBell from "@/shared/components/NotificationBell";
import UpdateBalanceModal from "@/pages/account/components/UpdateBalanceModal";

const Header = () => {
    const location = useLocation();
    const queryClient = useQueryClient();
    const auth = useSelector((state: RootState) => state.auth);
    const isAdmin = auth.role === "Admin";
    const isSellsRoute = location.pathname.toLowerCase().includes("sells");
    const isCouriersRoute = location.pathname.toLowerCase().includes("couriers");
    const isIncomeRoute = location.pathname.toLowerCase().includes("income");
    const isExpenseRoute = location.pathname.toLowerCase().includes("expense");
    const canReadCouriers = !!auth.permissions?.find((p) => p.routePath.toLowerCase() === "/couriers")?.canRead;
    const canReadIncome = !!auth.permissions?.find((p) => p.routePath.toLowerCase() === "/account/income")?.canRead;
    const canReadExpense = !!auth.permissions?.find((p) => p.routePath.toLowerCase() === "/account/expense")?.canRead;
    const canManageBalance = auth.role === "Admin" || auth.role === "Account";
    const [showBalanceModal, setShowBalanceModal] = useState(false);

    // Resetting the Courier Charge is restricted to Admin, or the Courier-role user "Vraj"
    // specifically — not every Courier-role user. Backend enforces the same check inline (see
    // courierCharge.controller.js#resetCurrentCourierCharge), independent of the generic
    // canUpdate permission.
    const canResetCourierCharge = auth.role === "Admin" || (auth.role === "Courier" && auth.name === "Vraj");
    const [showResetChargeConfirm, setShowResetChargeConfirm] = useState(false);

    const resetChargeMutation = useMutation({
        mutationFn: () => courierService.resetCourierCharge(),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier charge reset successfully");
            queryClient.invalidateQueries({ queryKey: ["courier-charge"] });
            setShowResetChargeConfirm(false);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to reset courier charge");
        },
    });

    const { data: headerTotalsResponse } = useQuery({
        queryKey: ["sells-totals-header"],
        queryFn: () => saleService.getSellsTotals(),
        enabled: isSellsRoute && Boolean(auth.token),
    });

    const headerTotalAmount = headerTotalsResponse?.data?.data?.totalSellingAmount || 0;

    // Same queryKey the Reset action above invalidates — the pill updates immediately
    // without a page reload once the reset succeeds.
    const { data: courierChargeResponse } = useQuery({
        queryKey: ["courier-charge"],
        queryFn: () => courierService.getCurrentCourierCharge(),
        enabled: isCouriersRoute && canReadCouriers && Boolean(auth.token),
    });

    const courierChargeAmount = Number(courierChargeResponse?.data?.data?.amount || 0);

    // Same queryKey the Account > Income page's create/update/delete mutations and the
    // Update Balance modal invalidate — this pill refreshes right along with those, and on a
    // fresh navigation to the Income page it always refetches (queries default to staleTime 0).
    const { data: incomeTotalsResponse } = useQuery({
        queryKey: ["income-totals"],
        queryFn: () => incomeService.getIncomeTotals(),
        enabled: isIncomeRoute && canReadIncome && Boolean(auth.token),
    });

    const totalIncomeAmount = Number(incomeTotalsResponse?.data?.data?.totalIncome || 0);

    // Approved-only expense total/count (see expense.controller.js#getExpenseTotals) — this pill
    // is the "Expense count/number" that updates once an Admin approves a Pending expense (a
    // Pending expense is deliberately excluded, same as it is from the Total Out balance).
    const { data: expenseTotalsResponse } = useQuery({
        queryKey: ["expense-totals"],
        queryFn: () => expenseService.getExpenseTotals(),
        enabled: isExpenseRoute && canReadExpense && Boolean(auth.token),
    });

    const totalExpenseAmount = Number(expenseTotalsResponse?.data?.data?.totalExpense || 0);
    const totalExpenseCount = Number(expenseTotalsResponse?.data?.data?.totalCount || 0);

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
                    {isCouriersRoute && canReadCouriers && (
                        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-1.5 border border-blue-200 text-xs font-semibold text-blue-800 shadow-xs">
                            <span className="text-[11px] text-blue-600 font-medium">
                                Courier Charge:
                            </span>
                            <span className="font-mono font-bold text-blue-900">
                                ₹{courierChargeAmount.toLocaleString("en-IN")}
                            </span>
                        </div>
                    )}
                    {isCouriersRoute && canResetCourierCharge && (
                        <button
                            type="button"
                            onClick={() => setShowResetChargeConfirm(true)}
                            title="Reset this month's Courier Charge to ₹0"
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3.5 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                        >
                            <RotateCcw className="h-3.5 w-3.5" /> Reset
                        </button>
                    )}
                    {isIncomeRoute && canReadIncome && (
                        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-blue-50 px-3.5 py-1.5 border border-blue-200 text-xs font-semibold text-blue-800 shadow-xs">
                            <span className="text-[11px] text-blue-600 font-medium">
                                Total Income:
                            </span>
                            <span className="font-mono font-bold text-blue-900">
                                ₹{totalIncomeAmount.toLocaleString("en-IN")}
                            </span>
                        </div>
                    )}
                    {isExpenseRoute && canReadExpense && (
                        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-rose-50 px-3.5 py-1.5 border border-rose-200 text-xs font-semibold text-rose-800 shadow-xs">
                            <span className="text-[11px] text-rose-600 font-medium">
                                Expense {totalExpenseCount}:
                            </span>
                            <span className="font-mono font-bold text-rose-900">
                                ₹{totalExpenseAmount.toLocaleString("en-IN")}
                            </span>
                        </div>
                    )}
                    {isIncomeRoute && canManageBalance && (
                        <button
                            type="button"
                            onClick={() => setShowBalanceModal(true)}
                            className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                            <Wallet className="h-3.5 w-3.5" /> Update Balance
                        </button>
                    )}
                    <NotificationBell />
                </div>
            </div>
            {showBalanceModal && <UpdateBalanceModal onClose={() => setShowBalanceModal(false)} />}

            {showResetChargeConfirm && (
                <div
                    className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
                    onClick={(e) => { if (e.target === e.currentTarget) setShowResetChargeConfirm(false); }}
                >
                    <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
                        <h3 className="text-sm font-bold text-slate-900 mb-2">Reset Courier Charge</h3>
                        <p className="text-xs text-slate-500 mb-4">
                            Are you sure you want to reset this month's Courier Charge to ₹0? This cannot be undone.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowResetChargeConfirm(false)}
                                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={resetChargeMutation.isPending}
                                onClick={() => resetChargeMutation.mutate()}
                                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50"
                            >
                                {resetChargeMutation.isPending ? "Resetting..." : "Reset"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default Header;
