import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { Search, XCircle } from "lucide-react";
import { type RootState } from "../../store/store";
import courierCompanyService, { type CourierCompanyData } from "../../services/courierCompany.service";
import FormikInput from "../../shared/components/formik-fields/FormikInput";
import { courierCompanySchema, type CourierCompanyFormValues } from "../../validation/courierCompany.validation";

/** Combined Create/Edit modal for a courier company. */
const CourierCompanyEditModal = ({
    company,
    onClose,
}: {
    company: CourierCompanyData | null;
    onClose: () => void;
}) => {
    const queryClient = useQueryClient();
    const isEdit = !!company?.id;
    const [isActive, setIsActive] = useState(company?.isActive ?? true);

    const saveMutation = useMutation({
        mutationFn: (data: Partial<CourierCompanyData>) =>
            isEdit
                ? courierCompanyService.updateCourierCompany(company!.id!, data)
                : courierCompanyService.createCourierCompany(data),
        onSuccess: (res) => {
            toast.success(res.data?.message || (isEdit ? "Courier company updated" : "Courier company created"));
            queryClient.invalidateQueries({ queryKey: ["courier-companies"] });
            onClose();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to save courier company");
        },
    });

    const initialValues: CourierCompanyFormValues = {
        name: company?.name || "",
        trackingLinkTemplate: company?.trackingLinkTemplate || "",
    };

    const validate = (values: CourierCompanyFormValues) => {
        const result = courierCompanySchema.safeParse(values);
        if (result.success) return {};
        return result.error.issues.reduce((errors, issue) => {
            const field = issue.path[0] as keyof CourierCompanyFormValues;
            if (!errors[field]) errors[field] = issue.message;
            return errors;
        }, {} as Partial<Record<keyof CourierCompanyFormValues, string>>);
    };

    const handleSubmit = (values: CourierCompanyFormValues) => {
        saveMutation.mutate({
            name: values.name.trim(),
            trackingLinkTemplate: values.trackingLinkTemplate || null,
            isActive,
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-lg font-bold text-slate-900">{isEdit ? "Edit Courier Company" : "New Courier Company"}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XCircle className="h-5 w-5" />
                    </button>
                </div>

                <Formik initialValues={initialValues} validate={validate} onSubmit={handleSubmit}>
                    <Form className="mt-4 flex flex-col gap-4">
                        <Field name="name" label="Company Name *" placeholder="e.g. Delhivery" component={FormikInput} />
                        <div>
                            <Field
                                name="trackingLinkTemplate"
                                label="Tracking Link Template"
                                placeholder="https://example.com/track/{trackId}"
                                component={FormikInput}
                            />
                            <p className="mt-1 text-[10px] text-slate-400">
                                Include the literal text <span className="font-mono font-semibold">{"{trackId}"}</span> where the
                                Track ID should go — it's substituted automatically to build a clickable tracking link.
                            </p>
                        </div>

                        <div className="flex items-center gap-3">
                            <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Status</label>
                            <button
                                type="button"
                                onClick={() => setIsActive(!isActive)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isActive ? "bg-[#3d6fe0]" : "bg-slate-300"}`}
                            >
                                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${isActive ? "translate-x-6" : "translate-x-1"}`} />
                            </button>
                            <span className="text-xs text-slate-500">{isActive ? "Active" : "Inactive"}</span>
                        </div>
                        <p className="text-[10px] text-slate-400 -mt-2">
                            Inactive companies are hidden from the Courier Company dropdown but existing records keep their value.
                        </p>

                        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                Cancel
                            </button>
                            <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]">
                                {saveMutation.isPending ? "Saving..." : "Save"}
                            </button>
                        </div>
                    </Form>
                </Formik>
            </div>
        </div>
    );
};

const DeleteCourierCompanyModal = ({
    company,
    onClose,
    onConfirm,
    isSubmitting,
}: {
    company: CourierCompanyData;
    onClose: () => void;
    onConfirm: () => void;
    isSubmitting?: boolean;
}) => (
    <div
        className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
        <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="text-sm font-bold text-slate-900">Delete Courier Company</h3>
                <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
                    <XCircle className="h-5 w-5" />
                </button>
            </div>
            <p className="text-xs text-slate-500">
                Are you sure you want to delete <span className="font-semibold text-slate-700">{company.name}</span>? Existing
                courier records that already used this name are unaffected. This cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                    Cancel
                </button>
                <button type="button" disabled={isSubmitting} onClick={onConfirm} className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-bold text-white hover:bg-rose-700 disabled:opacity-50">
                    {isSubmitting ? "Deleting..." : "Delete"}
                </button>
            </div>
        </div>
    </div>
);

const CourierCompanies = () => {
    const queryClient = useQueryClient();
    const { permissions } = useSelector((state: RootState) => state.auth);

    const pagePermission = useMemo(() => {
        if (!permissions) return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
        const p = permissions.find((p) => p.routePath.toLowerCase() === "/couriers-companies");
        return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }, [permissions]);

    const [search, setSearch] = useState("");

    const { data: response, isLoading, error } = useQuery({
        queryKey: ["courier-companies"],
        queryFn: () => courierCompanyService.getCourierCompanies(),
        enabled: pagePermission.canRead,
    });
    const companies = response?.data?.data || [];
    const filtered = companies.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));

    const [editingCompany, setEditingCompany] = useState<CourierCompanyData | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [deletingCompany, setDeletingCompany] = useState<CourierCompanyData | null>(null);

    const isEditModalOpen = isCreating || !!editingCompany;
    const closeEditModal = () => {
        setIsCreating(false);
        setEditingCompany(null);
    };

    const deleteMutation = useMutation({
        mutationFn: (id: number) => courierCompanyService.deleteCourierCompany(id),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Courier company deleted");
            queryClient.invalidateQueries({ queryKey: ["courier-companies"] });
            setDeletingCompany(null);
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to delete courier company");
        },
    });

    return (
        <div className="p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900">Courier Companies</h2>
                {pagePermission.canCreate && (
                    <button
                        onClick={() => setIsCreating(true)}
                        className="inline-flex items-center justify-center gap-2 rounded-full bg-[#3d6fe0] px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-500/10 transition hover:bg-[#3162d2] active:scale-[0.98]"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                        </svg>
                        Add Courier Company
                    </button>
                )}
            </div>

            <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Filter by name..."
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                />
            </div>

            {isLoading ? (
                <div className="flex min-h-40 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
                </div>
            ) : error ? (
                <p className="text-sm font-medium text-red-500">Failed to load courier companies</p>
            ) : !pagePermission.canRead ? (
                <p className="text-sm font-medium text-slate-500">You do not have permission to view courier companies.</p>
            ) : (
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    {filtered.length === 0 ? (
                        <p className="px-4 py-6 text-center text-xs text-slate-500">
                            {companies.length === 0 ? "No courier companies yet." : "Nothing matches this filter."}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left text-sm text-slate-500">
                                <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wider text-slate-700">
                                    <tr>
                                        <th className="px-4 py-3 whitespace-nowrap">Name</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Tracking Link Template</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Status</th>
                                        <th className="px-4 py-3 text-right whitespace-nowrap">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filtered.map((company) => (
                                        <tr key={company.id} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">{company.name}</td>
                                            <td className="px-4 py-3 font-mono text-xs max-w-[280px] truncate" title={company.trackingLinkTemplate || ""}>
                                                {company.trackingLinkTemplate || <span className="text-slate-300 font-sans">—</span>}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${company.isActive ? "bg-green-50 text-green-700 border border-green-100" : "bg-slate-100 text-slate-500"}`}>
                                                    {company.isActive ? "Active" : "Inactive"}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex justify-end gap-2">
                                                    {pagePermission.canUpdate && (
                                                        <button
                                                            onClick={() => setEditingCompany(company)}
                                                            className="rounded p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-950"
                                                            title="Edit"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                    {pagePermission.canDelete && (
                                                        <button
                                                            onClick={() => setDeletingCompany(company)}
                                                            className="rounded p-1.5 text-red-500 hover:bg-red-50 hover:text-red-700"
                                                            title="Delete"
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-4 w-4">
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                                                            </svg>
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {isEditModalOpen && <CourierCompanyEditModal company={editingCompany} onClose={closeEditModal} />}
            {deletingCompany && (
                <DeleteCourierCompanyModal
                    company={deletingCompany}
                    onClose={() => setDeletingCompany(null)}
                    isSubmitting={deleteMutation.isPending}
                    onConfirm={() => deletingCompany.id && deleteMutation.mutate(deletingCompany.id)}
                />
            )}
        </div>
    );
};

export default CourierCompanies;
