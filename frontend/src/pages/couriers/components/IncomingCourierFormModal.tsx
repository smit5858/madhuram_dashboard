import { useState } from "react";
import { Field, Form, Formik } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import courierService, { type CourierData } from "../../../services/courier.service";
import courierCompanyService from "../../../services/courierCompany.service";
import FormikInput from "../../../shared/components/formik-fields/FormikInput";
import FormikSelect from "../../../shared/components/formik-fields/FormikSelect";
import FormikDate from "../../../shared/components/formik-fields/FormikDate";
import FormikPhoneInput from "../../../shared/components/formik-fields/FormikPhoneInput";
import { incomingCourierEditSchema, type IncomingCourierEditFormValues } from "../../../validation/courier.validation";
import { COURIER_COMPANY_OTHER } from "../../../shared/constants/courierCompanies";
import { getTodayISODate } from "../../../shared/utils/date";

interface IncomingCourierFormModalProps {
    /** null = creating a new Incoming Courier record */
    courier: CourierData | null;
    role: string | null;
    onClose: () => void;
}

/** Dedicated Create/Edit form for Incoming Courier — a customer/vendor sending a product to the
 *  office (repair/replacement/inspection/service/other). Deliberately its own component rather
 *  than reusing CourierEditModal: that shared modal carries Outgoing-only concerns (Direction
 *  picker, shipment-type/serial-number pickers, charge/free-pickup/weight) that don't apply here. */
const IncomingCourierFormModal = ({ courier, role, onClose }: IncomingCourierFormModalProps) => {
    const queryClient = useQueryClient();
    const isEdit = !!courier?.id;

    // City is Admin-editable, locked to the non-Admin user's allowedCity — kept out of Formik so
    // the readOnly lock (which FormikInput doesn't expose) still works.
    const [city, setCity] = useState(courier?.city || "");

    // Courier company list is Admin-managed (see the Courier Companies module) — fetched live
    // rather than hardcoded, so a newly added company shows up here without a frontend deploy.
    const { data: companiesResponse } = useQuery({
        queryKey: ["courier-companies-picker"],
        queryFn: () => courierCompanyService.getCourierCompanies(),
    });
    const companies = (companiesResponse?.data?.data || []).filter((c) => c.isActive !== false);
    const COMPANY_OPTIONS = [
        ...companies.map((c) => ({ value: c.name, label: c.name })),
        { value: COURIER_COMPANY_OTHER, label: COURIER_COMPANY_OTHER },
    ];

    const initialCompanyIsOther =
        !!courier?.courierName && !companies.some((c) => c.name === courier.courierName);
    const [otherCompanyName, setOtherCompanyName] = useState(initialCompanyIsOther ? courier?.courierName || "" : "");

    const saveMutation = useMutation({
        mutationFn: (data: Partial<CourierData>) =>
            isEdit ? courierService.updateCourier(courier!.id!, data) : courierService.createCourier(data),
        onSuccess: (res) => {
            toast.success(res.data?.message || (isEdit ? "Incoming courier updated successfully" : "Incoming courier created successfully"));
            queryClient.invalidateQueries({ queryKey: ["couriers", "IN"] });
            onClose();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to save incoming courier record");
        },
    });

    type FormValues = Omit<IncomingCourierEditFormValues, "city"> & { entryDate: string };

    const initialValues: FormValues = {
        customerName: courier?.customerName || courier?.name || "",
        mobileNo: courier?.mobileNo || courier?.phone || "",
        pincode: courier?.pincode || "",
        productName: courier?.productName || "",
        address: courier?.address || "",
        courierCompany: initialCompanyIsOther ? COURIER_COMPANY_OTHER : courier?.courierName || "",
        trackId: courier?.trackId || "",
        reason: courier?.reason || "",
        note: courier?.note || "",
        entryDate: courier?.entryDate || getTodayISODate(),
    };

    const validate = (values: FormValues) => {
        const result = incomingCourierEditSchema.safeParse({ ...values, city });
        const errors: Partial<Record<keyof FormValues, string>> = {};
        if (!result.success) {
            for (const issue of result.error.issues) {
                const field = issue.path[0] as keyof FormValues;
                if (!errors[field]) errors[field] = issue.message;
            }
        }
        return errors;
    };

    const handleSubmit = (values: FormValues) => {
        const resolvedCourierName =
            values.courierCompany === COURIER_COMPANY_OTHER ? otherCompanyName.trim() : values.courierCompany;

        if (values.courierCompany === COURIER_COMPANY_OTHER && !resolvedCourierName) {
            toast.error("Please enter the courier company name");
            return;
        }

        const data: Partial<CourierData> = {
            customerName: values.customerName.trim(),
            name: values.customerName.trim(),
            mobileNo: values.mobileNo || undefined,
            phone: values.mobileNo || undefined,
            city: role === "Admin" ? city || undefined : undefined,
            pincode: values.pincode || null,
            address: values.address || null,
            productName: values.productName || null,
            courierName: resolvedCourierName || undefined,
            trackId: values.trackId || null,
            reason: values.reason || null,
            note: values.note || null,
            entryDate: values.entryDate || undefined,
            direction: "IN",
        };

        saveMutation.mutate(data);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-lg font-bold text-slate-900">{isEdit ? "Edit Incoming Courier" : "New Incoming Courier"}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XCircle className="h-5 w-5" />
                    </button>
                </div>

                <Formik initialValues={initialValues} validate={validate} enableReinitialize onSubmit={handleSubmit}>
                    {({ values }) => (
                        <Form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <Field name="customerName" label="Customer Name *" placeholder="Customer Name" component={FormikInput} />
                            </div>

                            <Field name="mobileNo" label="Mobile" placeholder="9876543210" component={FormikPhoneInput} />
                            <Field name="productName" label="Product Name" placeholder="e.g. Speedometer / ECM" component={FormikInput} />

                            <div className="sm:col-span-2">
                                <Field name="reason" label="Reason" placeholder="e.g. Repair, Replacement, Inspection, Service" component={FormikInput} />
                            </div>

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">City</label>
                                <input
                                    type="text" value={city} onChange={(e) => setCity(e.target.value)}
                                    placeholder="e.g. Rajkot"
                                    readOnly={role !== "Admin"}
                                    className={`mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-[#3d6fe0] focus:outline-none ${role !== "Admin" ? "bg-slate-100 text-slate-400 cursor-not-allowed" : "bg-slate-50 text-slate-900 focus:bg-white"}`}
                                />
                                {role !== "Admin" && (
                                    <p className="mt-0.5 text-[10px] text-slate-400">City is locked to your allowed scope.</p>
                                )}
                            </div>
                            <Field name="pincode" label="Pincode" placeholder="e.g. 360001" component={FormikInput} />

                            <div className="sm:col-span-2">
                                <Field name="address" label="Address" placeholder="Customer's address" multiline component={FormikInput} />
                            </div>

                            <Field
                                name="courierCompany"
                                label="Courier Company"
                                placeholder="Select a courier company"
                                options={COMPANY_OPTIONS}
                                component={FormikSelect}
                            />
                            {values.courierCompany === COURIER_COMPANY_OTHER && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Custom Courier Company Name</label>
                                    <input
                                        type="text"
                                        value={otherCompanyName}
                                        onChange={(e) => setOtherCompanyName(e.target.value)}
                                        placeholder="e.g. Local Courier Service"
                                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                                    />
                                </div>
                            )}

                            <Field name="trackId" label="Tracking Number" placeholder="Tracking number" component={FormikInput} />
                            <Field name="entryDate" label="Date" component={FormikDate} />

                            <div className="sm:col-span-2">
                                <Field name="note" label="Other Relevant Information" placeholder="Any additional notes..." multiline component={FormikInput} />
                            </div>

                            <div className="sm:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                    Cancel
                                </button>
                                <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]">
                                    {saveMutation.isPending ? "Saving..." : isEdit ? "Save Changes" : "Create Incoming Courier"}
                                </button>
                            </div>
                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
};

export default IncomingCourierFormModal;
