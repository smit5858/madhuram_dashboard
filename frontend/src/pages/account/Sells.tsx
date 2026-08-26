import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import type { RootState } from "@/store/store";
import salesService, { type PaymentData, type PaymentsFilters } from "@/services/sells.service";
import { useQuery } from "@tanstack/react-query";
import { Field, Form, Formik } from "formik";
import { useMemo, useState } from "react";
import { useSelector } from "react-redux";

interface ApiErrorLike {
    response?: { data?: { message?: string } };
    message?: string;
}

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const formatCurrency = (amount: number) =>
    new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(amount || 0);

const Sells = () => {
    const permission = useSelector((state: RootState) => state.auth.permissions);
    const sellsPermission = permission?.find(
        (item) => item.routeName === "Account Sells" || item.routePath === "/account/sells"
    );
    const canRead = sellsPermission?.canRead ?? false;

    const [appliedFilters, setAppliedFilters] = useState<PaymentsFilters>({});
    const [pageSize, setPageSize] = useState(10);

    const queryFilters = useMemo<PaymentsFilters>(
        () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize }),
        [appliedFilters, pageSize]
    );

    const {
        data: paymentsResponse,
        isLoading,
        isFetching,
        isError,
        error,
    } = useQuery({
        queryKey: ["account-payments", queryFilters],
        queryFn: () => salesService.getAllPayments(queryFilters),
        enabled: canRead,
    });

    const paymentsList: PaymentData[] = paymentsResponse?.data?.data || [];
    const paginationMeta = paymentsResponse?.data?.meta || { page: 1, limit: pageSize, total: 0, totalPages: 1 };

    const handleSubmit = (values: { search: string; start_date: string; end_date: string }) => {
        setAppliedFilters({
            search: values.search || undefined,
            start_date: values.start_date || undefined,
            end_date: values.end_date || undefined,
            page: 1,
        });
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-md">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <Formik
                    initialValues={{ search: "", start_date: "", end_date: "" }}
                    onSubmit={handleSubmit}
                    onReset={() => setAppliedFilters({})}
                >
                    {() => (
                        <Form className="flex items-center justify-center gap-4">
                            <Field
                                name="search"
                                type="text"
                                placeholder="Search customer..."
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                component={FormikInput}
                            />
                            <Field
                                name="start_date"
                                placeholder="Start Date"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                component={FormikDate}
                            />
                            <Field
                                name="end_date"
                                placeholder="End Date"
                                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                                component={FormikDate}
                            />
                            <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                Apply
                            </button>
                            <button type="reset" className="px-4 py-2 bg-gray-300 text-gray-700 rounded-md hover:bg-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500">
                                Reset
                            </button>
                        </Form>
                    )}
                </Formik>
            </div>

            <div className="mt-6 rounded-xl border border-gray-200 overflow-hidden">
                {!canRead ? (
                    <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                        You do not have permission to view payment records.
                    </div>
                ) : isLoading ? (
                    <div className="flex h-48 items-center justify-center">
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
                    </div>
                ) : isError ? (
                    <div className="flex h-48 flex-col items-center justify-center text-red-500 gap-1 text-center px-4">
                        <p className="text-sm font-semibold">
                            {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load payments"}
                        </p>
                    </div>
                ) : paymentsList.length === 0 ? (
                    <div className="flex h-48 items-center justify-center text-sm text-gray-500">
                        No payment records found.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200 text-left text-sm">
                            <thead className="bg-gray-50 text-xs font-semibold uppercase tracking-wider text-gray-600">
                                <tr>
                                    <th className="px-4 py-3 whitespace-nowrap">Date</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Customer</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Amount</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Method</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Notes</th>
                                    <th className="px-4 py-3 whitespace-nowrap">Collected By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paymentsList.map((payment) => (
                                    <tr key={payment.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">
                                            {payment.createdAt ? new Date(payment.createdAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">
                                            {payment.Sale?.customerName || "—"}
                                        </td>
                                        <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">
                                            {formatCurrency(payment.amount)}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">{payment.method || "—"}</td>
                                        <td className="px-4 py-3 max-w-50 truncate text-gray-500" title={payment.notes || ""}>
                                            {payment.notes || "—"}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-gray-500">{payment.creator?.name || "—"}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {canRead && !isLoading && !isError && paymentsList.length > 0 && (
                    <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500 sm:flex-row sm:items-center sm:justify-between">
                        <span>
                            Page {paginationMeta.page} of {paginationMeta.totalPages} · {paginationMeta.total} total payments
                            {isFetching && <span className="ml-2 text-gray-400">(refreshing…)</span>}
                        </span>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-1.5 text-gray-500">
                                Rows:
                                <select
                                    value={pageSize}
                                    onChange={(e) => {
                                        setPageSize(Number(e.target.value));
                                        setAppliedFilters((prev) => ({ ...prev, page: 1 }));
                                    }}
                                    className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs focus:border-blue-500 focus:outline-none"
                                >
                                    {PAGE_SIZE_OPTIONS.map((size) => (
                                        <option key={size} value={size}>
                                            {size}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    disabled={paginationMeta.page <= 1}
                                    onClick={() => setAppliedFilters((prev) => ({ ...prev, page: Math.max(1, paginationMeta.page - 1) }))}
                                    className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Previous
                                </button>
                                <button
                                    type="button"
                                    disabled={paginationMeta.page >= paginationMeta.totalPages}
                                    onClick={() =>
                                        setAppliedFilters((prev) => ({ ...prev, page: Math.min(paginationMeta.totalPages, paginationMeta.page + 1) }))
                                    }
                                    className="rounded-lg border border-gray-200 px-3 py-1.5 font-medium hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Next
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Sells;
