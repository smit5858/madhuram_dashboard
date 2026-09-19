import { useState } from "react";
import { Field, Form, Formik } from "formik";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import courierService, { type CourierData } from "../../../services/courier.service";
import courierCompanyService from "../../../services/courierCompany.service";
import saleService from "../../../services/sells.service";
import FormikInput from "../../../shared/components/formik-fields/FormikInput";
import FormikSelect from "../../../shared/components/formik-fields/FormikSelect";
import FormikDate from "../../../shared/components/formik-fields/FormikDate";
import FormikSerialPicker from "../../../shared/components/formik-fields/FormikSerialPicker";
import CustomerAutocompleteField from "../../../shared/components/CustomerAutocompleteField";
import { normalizePhoneDigits } from "../../../shared/utils/phone";
import { courierEditSchema, validateSerialNumbers, type CourierEditFormValues } from "../../../validation/courier.validation";
import { COURIER_COMPANY_OTHER } from "../../../shared/constants/courierCompanies";
import { SHIPMENT_TYPE_LABEL, type ShipmentType } from "../../../shared/constants/courierStatus";
import { DELIVERY_MODE_OPTIONS, type DeliveryMode } from "../../../shared/constants/deliveryMode";
import { getTodayISODate } from "../../../shared/utils/date";

const SHIPMENT_TYPE_OPTIONS = (Object.keys(SHIPMENT_TYPE_LABEL) as ShipmentType[]).map((value) => ({
    value,
    label: SHIPMENT_TYPE_LABEL[value],
}));

interface CourierEditModalProps {
    /** null = creating a new (manual, non-sale) courier record */
    courier: CourierData | null;
    /** Default direction for a newly created record — matches whichever page (Outgoing/Incoming) the user opened the modal from. */
    direction: "IN" | "OUT";
    onClose: () => void;
}

/** Combined Create/Edit modal for a courier record — the fuller field set (company, pincode,
 *  entry date, serial numbers when applicable, shipment type for sale-linked orders). Scalar
 *  fields go through the shared Formik field components; the free-pickup toggle and "Other"
 *  company name stay as sibling state (not naturally Formik-shaped) and are merged in at submit. */
const CourierEditModal = ({ courier, direction, onClose }: CourierEditModalProps) => {
    const queryClient = useQueryClient();
    const isEdit = !!courier?.id;

    const [freePickup, setFreePickup] = useState(courier?.freePickup ?? false);
    // City is always editable, regardless of role or entry source (manual or sale-generated) —
    // kept out of Formik purely for parity with the shared validate() pattern below.
    const [city, setCity] = useState(courier?.city || "");
    // Direction is always editable, regardless of entry source — defaults to whichever page
    // (Outgoing/Incoming) the modal was opened from, or the record's own direction when editing.
    const [formDirection, setFormDirection] = useState<"IN" | "OUT">(courier?.direction || direction);

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

    // Sale-linked couriers (direction OUT, created by order.service.js#createOrder) get one
    // Courier row per SaleItem — the whole shipment is shown/edited as a group here rather
    // than just the one row that happened to be clicked, so editing a multi-product order
    // shows (and can update) every product in it, not only the first one.
    const isSaleLinked = !!courier?.saleId;

    // Serial numbers stay editable whether a line is still reserved (not yet fulfilled) or
    // already sold — inventoryService.reassignSerials swaps whichever state the unit is
    // currently in, so a wrong pick can still be corrected after fulfillment. Reserved takes
    // priority since a line is never in both states at once.
    const { data: saleDetailResponse } = useQuery({
        queryKey: ["courier-edit-sale-detail", courier?.saleId],
        queryFn: () => saleService.getSaleById(courier!.saleId!),
        enabled: isSaleLinked,
    });
    const sale = saleDetailResponse?.data?.data;

    // Every product line of this shipment with its serial-number state, straight from the Courier
    // API (GET /couriers/:id/serials) — the authoritative "what's actually part of this shipment"
    // list (non-cancelled Courier rows only: a SaleItem doesn't always get one, e.g. SOFTWARE
    // lines, so building from sale.items would render un-saveable rows), and the only serial source
    // that works for a Courier Employee who has no Sells/Products access. Product A's serials can
    // never leak into Product B's picker: each line carries its own assigned/available lists.
    // Refetched on every open (no cache reuse, no focus refetch) so it always mirrors the DB, and
    // never mid-edit, which would reset the in-progress selection.
    const { data: serialLinesResponse, isLoading: serialLinesLoading, error: serialLinesError } = useQuery({
        queryKey: ["courier-serials", courier?.id],
        queryFn: () => courierService.getCourierSerials(courier!.id!),
        enabled: isSaleLinked && !!courier?.id,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
    });
    const productRows = (serialLinesResponse?.data?.data || []).map((line) => {
        const currentSerials = line.assigned.map((u) => u.serialNumber);
        return {
            saleItemId: line.saleItemId,
            courierId: line.courierId,
            productId: line.productId,
            name: line.productName || "Product",
            quantity: line.quantity,
            isSerialized: line.isSerialized,
            isNonInventory: line.isNonInventory,
            serialNumber: line.serialNumber || "",
            requiredSerialCount: line.requiredCount,
            currentSerials,
            // Assigned units first (stable order), then the other AVAILABLE units of this product.
            serialOptions: [...currentSerials, ...line.available.map((u) => u.serialNumber)],
            backorderedQuantity: line.backorderedQuantity,
        };
    });

    // The Ship Complete Order vs Ship Available Products choice only means anything when this
    // sale actually has a product still waiting on stock — with every line already allocated
    // there's nothing to split, so the control would just be a confusing no-op.
    const hasBackorderedItems = (sale?.items || []).some((i) => (i.backorderedQuantity ?? 0) > 0);
    const showShipmentType = !!courier?.saleId && (sale?.items?.length ?? 0) > 1 && hasBackorderedItems;

    const saveMutation = useMutation({
        mutationFn: (data: Partial<CourierData> & { serialNumbers?: string[] }) =>
            isEdit ? courierService.updateCourier(courier!.id!, data) : courierService.createCourier(data),
        onSuccess: (res) => {
            toast.success(res.data?.message || (isEdit ? "Courier updated successfully" : "Courier created successfully"));
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            // Charge/freePickup/entryDate changes shift the backend-computed monthly Courier
            // Charge total — refresh the header pill along with the list.
            queryClient.invalidateQueries({ queryKey: ["courier-charge"] });
            onClose();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to save courier record");
        },
    });

    // Sale-linked, multi-row save: one PUT per product's own Courier row (there is no
    // single-record "update the whole shipment" endpoint — each product is its own row, see
    // order.service.js#createOrder), each carrying the shared shipment fields plus that
    // product's own serial selection, so every product's serials update independently in one
    // Save without disturbing its siblings.
    //
    // Each PUT is its own backend transaction, so this isn't atomic across the shipment — if two
    // rows somehow raced for the same serial (the excludeSerials guard above should prevent this
    // in normal use) the loser's PUT fails with a 409 while its siblings already committed.
    // Requests run one after another (not in parallel): each one row-locks serial units of the
    // same product, and concurrent PUTs locking overlapping units in different orders can
    // deadlock. Settling each one individually (not bailing on the first error) surfaces exactly
    // which product failed instead of a generic error.
    const groupSaveMutation = useMutation({
        mutationFn: async (updates: { courierId: number; productId?: number; productName: string; payload: Partial<CourierData> & { serialNumbers?: string[] } }[]) => {
            const results: PromiseSettledResult<unknown>[] = [];
            for (const u of updates) {
                try {
                    results.push({ status: "fulfilled", value: await courierService.updateCourier(u.courierId, u.payload) });
                } catch (reason) {
                    results.push({ status: "rejected", reason });
                }
            }
            const failures = results
                .map((r, i) => ({ r, u: updates[i] }))
                .filter(({ r }) => r.status === "rejected") as { r: PromiseRejectedResult; u: (typeof updates)[number] }[];
            return { results, failures };
        },
        onSuccess: ({ failures, results }) => {
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            queryClient.invalidateQueries({ queryKey: ["courier-charge"] });
            // The serial-lines query (gcTime 0) is discarded when this modal closes, so reopening
            // always reads the saved state from the DB. It's deliberately not invalidated here:
            // on a partial failure the modal stays open, and a refetch would re-initialize the
            // form and wipe the pick the employee still needs to correct and retry.
            if (failures.length === 0) {
                toast.success("Courier shipment updated successfully");
                onClose();
                return;
            }
            const names = failures.map(({ u }) => u.productName).join(", ");
            const firstErr = failures[0].r.reason as { response?: { data?: { message?: string } }; message?: string };
            const detail = firstErr?.response?.data?.message || firstErr?.message || "unknown error";
            toast.error(
                results.length > failures.length
                    ? `Saved ${results.length - failures.length} of ${results.length} products. Failed: ${names} (${detail})`
                    : `Failed to update: ${names} (${detail})`
            );
            // Keep the modal open on partial/total failure so the employee can re-pick the
            // conflicting product's serial and retry — the rows that already saved are no-ops
            // on resubmit since reassignSerials short-circuits when the selection is unchanged.
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to update courier shipment");
        },
    });

    const shipmentTypeMutation = useMutation({
        mutationFn: (shipmentType: ShipmentType) => courierService.updateShipmentType(courier!.id!, shipmentType),
        onSuccess: (res) => {
            toast.success(res.data?.message || "Shipment type updated");
            queryClient.invalidateQueries({ queryKey: ["couriers"] });
            onClose();
        },
        onError: (err: any) => {
            toast.error(err.response?.data?.message || err.message || "Failed to update shipment type");
        },
    });

    type FormValues = Omit<CourierEditFormValues, "city"> & {
        entryDate: string;
        // Keyed by saleItemId — each sale-linked product's serial selection lives independently
        // here so Product A's picker can never touch Product B's selection.
        serialsByItem: Record<number, string[]>;
        // Optional free-text serial for each non-inventory (Quick Add / Other) line, keyed by
        // saleItemId — these have no serial units to pick from, so it's a plain text field.
        freeSerialsByItem: Record<number, string>;
    };
    type ScalarFormKey = Exclude<keyof FormValues, "serialsByItem" | "freeSerialsByItem">;

    const initialValues: FormValues = {
        customerName: courier?.customerName || courier?.name || "",
        mobileNo: normalizePhoneDigits(courier?.mobileNo || courier?.phone) || "",
        pincode: courier?.pincode || "",
        charge: courier?.charge !== undefined && courier?.charge !== null ? String(courier.charge) : "",
        productName: courier?.productName || "",
        address: courier?.address || "",
        courierCompany: initialCompanyIsOther ? COURIER_COMPANY_OTHER : courier?.courierName || "",
        kg: courier?.kg !== undefined && courier?.kg !== null ? String(courier.kg) : "",
        quantity: courier?.quantity !== undefined && courier?.quantity !== null ? String(courier.quantity) : "",
        serialNumber: courier?.serialNumber || "",
        trackId: courier?.trackId || "",
        note: courier?.note || "",
        entryDate: courier?.entryDate || getTodayISODate(),
        deliveryMode: courier?.deliveryMode || "COURIER",
        to: courier?.to || "Madhuram Motor",
        serialsByItem: Object.fromEntries(
            productRows.filter((r) => r.isSerialized && r.requiredSerialCount > 0).map((r) => [r.saleItemId, r.currentSerials])
        ),
        freeSerialsByItem: Object.fromEntries(productRows.filter((r) => r.isNonInventory).map((r) => [r.saleItemId, r.serialNumber])),
    };

    const validate = (values: FormValues) => {
        const result = courierEditSchema.safeParse({ ...values, city });
        const errors: Partial<Record<ScalarFormKey, string>> & {
            serialsByItem?: Record<number, string>;
        } = {};
        if (!result.success) {
            for (const issue of result.error.issues) {
                const field = issue.path[0] as ScalarFormKey;
                if (!errors[field]) errors[field] = issue.message;
            }
        }
        const serialErrors: Record<number, string> = {};
        for (const row of productRows) {
            if (!row.isSerialized || row.requiredSerialCount === 0) continue;
            const err = validateSerialNumbers(values.serialsByItem?.[row.saleItemId] || [], row.requiredSerialCount);
            if (err) serialErrors[row.saleItemId] = err;
        }
        // Belt-and-braces cross-row check: two sibling rows for the same product (e.g. a sale
        // with two separate lines of the same serialized item) must never claim the same unit —
        // the picker already excludes a sibling's live pick from its own choices (see
        // FormikSerialPicker's excludeSerials), but this catches it too in case values change
        // out from under that (e.g. a row unmounting/remounting while a pick is in flight).
        for (const row of productRows) {
            if (!row.isSerialized || row.requiredSerialCount === 0 || serialErrors[row.saleItemId]) continue;
            const mySerials = values.serialsByItem?.[row.saleItemId] || [];
            const claimedBySiblings = productRows
                .filter((r) => r.saleItemId !== row.saleItemId && r.productId === row.productId)
                .flatMap((r) => values.serialsByItem?.[r.saleItemId] || []);
            const conflict = mySerials.find((s) => claimedBySiblings.includes(s));
            if (conflict) {
                serialErrors[row.saleItemId] = `${conflict} is already selected for another product row`;
            }
        }
        if (Object.keys(serialErrors).length > 0) errors.serialsByItem = serialErrors;
        return errors;
    };

    const handleSubmit = (values: FormValues) => {
        const resolvedCourierName =
            values.courierCompany === COURIER_COMPANY_OTHER ? otherCompanyName.trim() : values.courierCompany;

        if (values.courierCompany === COURIER_COMPANY_OTHER && !resolvedCourierName) {
            toast.error("Please enter the courier company name");
            return;
        }

        const data: Partial<CourierData> & { serialNumbers?: string[] } = {
            customerName: values.customerName.trim(),
            name: values.customerName.trim(),
            mobileNo: values.mobileNo || undefined,
            phone: values.mobileNo || undefined,
            city: city || undefined,
            pincode: values.pincode || null,
            charge: values.charge ? parseFloat(values.charge) : null,
            address: values.address || null,
            // Product Name/Quantity are per-product for a sale-linked shipment (see the Products
            // section below) — sending one shared value here would overwrite every product's own
            // name/quantity with the same text, so they're only included for manual entries.
            ...(isSaleLinked ? {} : { productName: values.productName || null, quantity: values.quantity ? parseInt(values.quantity, 10) : null, serialNumber: values.serialNumber?.trim() || null }),
            freePickup,
            courierName: resolvedCourierName || undefined,
            trackId: values.trackId || null,
            kg: values.kg ? parseFloat(values.kg) : null,
            note: values.note || null,
            entryDate: values.entryDate || undefined,
            to: values.to || "Madhuram Motor",
            direction: formDirection,
            // Delivery Mode is user-editable (see the field above) — always send whatever the
            // form currently holds, so switching it (e.g. to Office Pickup) on an existing or
            // sale-generated record actually persists instead of being silently dropped.
            deliveryMode: (values.deliveryMode || "COURIER") as DeliveryMode,
        };

        if (isSaleLinked && productRows.length > 0) {
            const updates = productRows
                .filter((row) => !!row.courierId)
                .map((row) => {
                    const payload: Partial<CourierData> & { serialNumbers?: string[] } = { ...data };
                    if (row.isSerialized && row.requiredSerialCount > 0) {
                        payload.serialNumbers = values.serialsByItem?.[row.saleItemId] || [];
                    }
                    // Optional free-text serial for a Quick Add / Other line — blank is fine.
                    if (row.isNonInventory) {
                        payload.serialNumber = values.freeSerialsByItem?.[row.saleItemId]?.trim() || null;
                    }
                    return { courierId: row.courierId as number, productId: row.productId, productName: row.name, payload };
                });
            groupSaveMutation.mutate(updates);
            return;
        }

        saveMutation.mutate(data);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
            onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-lg font-bold text-slate-900">{isEdit ? "Edit Courier Record" : "New Courier Record"}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <XCircle className="h-5 w-5" />
                    </button>
                </div>

                {showShipmentType && courier?.id && (
                    <Formik
                        initialValues={{ shipmentType: (courier.shipmentType || "SHIP_COMPLETE") as ShipmentType }}
                        onSubmit={(values) => shipmentTypeMutation.mutate(values.shipmentType)}
                    >
                        {({ values }) => (
                            <Form className="mt-4 rounded-lg border border-blue-200 bg-blue-50/40 p-3">
                                <div className="flex items-end gap-3">
                                    <div className="flex-1">
                                        <Field
                                            name="shipmentType"
                                            label="Shipment Decision"
                                            options={SHIPMENT_TYPE_OPTIONS}
                                            component={FormikSelect}
                                        />
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={shipmentTypeMutation.isPending || values.shipmentType === courier.shipmentType}
                                        className="mb-1 rounded-lg border border-[#3d6fe0] px-3 py-2 text-xs font-semibold text-[#3d6fe0] hover:bg-blue-100 disabled:opacity-50"
                                    >
                                        {shipmentTypeMutation.isPending ? "Applying..." : "Apply"}
                                    </button>
                                </div>
                                <p className="mt-1 text-[10px] text-slate-500">
                                    Choose whether to wait for every product in this order or ship the in-stock products now
                                    and track the rest separately as Waiting for Stock.
                                </p>
                            </Form>
                        )}
                    </Formik>
                )}

                <Formik initialValues={initialValues} validate={validate} enableReinitialize onSubmit={handleSubmit}>
                    {({ values, errors, touched, setFieldValue }) => (
                        <Form className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                                <Field name="customerName" label="Customer Name *" placeholder="Customer Name" component={FormikInput} />
                            </div>

                            {/* Same customer search-as-you-type used by Sells/Leads (GET /customers?search=)
                                — selecting a suggestion fills name, mobile, city, pincode and address from
                                the matched Customer; a number with no match can still be typed in manually. */}
                            <CustomerAutocompleteField
                                label="Mobile"
                                value={values.mobileNo || ""}
                                onPhoneChange={(phone) => setFieldValue("mobileNo", phone)}
                                onSelectCustomer={(customer) => {
                                    setFieldValue("mobileNo", customer.phone);
                                    setFieldValue("customerName", customer.name);
                                    if (customer.city) setCity(customer.city);
                                    if (customer.pincode) setFieldValue("pincode", customer.pincode);
                                    if (customer.address) setFieldValue("address", customer.address);
                                }}
                                error={touched.mobileNo ? errors.mobileNo : undefined}
                            />
                            {/* Product Name is per-product for a sale-linked shipment (see the Products
                                section below) — shown here only for manual (non-sale) entries. */}
                            {!isSaleLinked && (
                                <Field name="productName" label="Product Name" placeholder="e.g. Engine Oil" component={FormikInput} />
                            )}

                            <div>
                                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">City</label>
                                <input
                                    type="text" value={city} onChange={(e) => setCity(e.target.value)}
                                    placeholder="e.g. Rajkot"
                                    className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                                />
                            </div>
                            <Field name="pincode" label="Pincode" placeholder="e.g. 360001" component={FormikInput} />

                            <div className="sm:col-span-2">
                                <Field name="address" label="Address" placeholder="Delivery address" multiline component={FormikInput} />
                            </div>

                            <Field
                                name="courierCompany"
                                label="Courier Company Name"
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

                            {/* type="text" (not "number"): Formik coerces number-typed inputs to a JS
                                number on change, which broke the string-based Zod regex validation. */}
                            <Field name="kg" label="Weight (KG)" type="text" inputMode="decimal" placeholder="0.000" component={FormikInput} />

                            <div className="flex items-center gap-3 pt-2">
                                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Courier</label>
                                <button
                                    type="button"
                                    onClick={() => setFreePickup(!freePickup)}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${freePickup ? "bg-[#3d6fe0]" : "bg-slate-300"}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${freePickup ? "translate-x-6" : "translate-x-1"}`} />
                                </button>
                                <span className="text-xs text-slate-500">{freePickup ? "Free" : "Paid"}</span>
                            </div>

                            {!freePickup && <Field name="charge" label="Charge (₹)" placeholder="0.00" type="number" component={FormikInput} />}

                            <Field name="trackId" label="Track ID" placeholder="Tracking number" component={FormikInput} />
                            <Field name="entryDate" label="Date" component={FormikDate} />
                            {/* Quantity is per-product for a sale-linked shipment (see the Products
                                section below) — shown here only for manual (non-sale) entries. */}
                            {!isSaleLinked && (
                                <Field name="quantity" label="Quantity" type="number" placeholder="Units to ship" component={FormikInput} />
                            )}
                            {/* Optional — a manual entry isn't tied to a serial-tracked product, so this is
                                plain free text and may be left empty. Sale-linked shipments show a per-product
                                Serial Number in the Products section below instead. */}
                            {!isSaleLinked && (
                                <Field name="serialNumber" label="Serial Number (optional)" placeholder="Leave empty if none" component={FormikInput} />
                            )}
                            <Field name="to" label="To" placeholder="Madhuram Motor" component={FormikInput} />

                            {/* Direction is always editable, regardless of entry source (manual or sale-generated)
                                — no picker needed on the Incoming Courier form since it's always "IN" there. */}
                            {direction === "OUT" && (
                                <div>
                                    <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Direction</label>
                                    <select
                                        value={formDirection}
                                        onChange={(e) => setFormDirection(e.target.value as "IN" | "OUT")}
                                        className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                                    >
                                        <option value="OUT">Outgoing — we ship to the customer</option>
                                        <option value="IN">Incoming — a customer/vendor ships to us</option>
                                    </select>
                                </div>
                            )}

                            {/* Delivery Mode — how this outgoing shipment is being handled (independent of the
                                pipeline Status above). Editable at any time, regardless of entry source, so a
                                sale-generated shipment can still be switched to Office Pickup if the customer
                                ends up collecting it in person instead of having it shipped. */}
                            {direction === "OUT" && (
                                <Field
                                    name="deliveryMode"
                                    label="Delivery Mode"
                                    component={FormikSelect}
                                    options={DELIVERY_MODE_OPTIONS}
                                />
                            )}

                            {/* Every product in this sale, each with its own quantity and (when serialized)
                                its own independent serial-number picker — Product A's serials can never
                                leak into Product B's since each Field below is scoped to that product's
                                own productId and its own `serialsByItem.<saleItemId>` form field. */}
                            {isSaleLinked && (
                                <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
                                        Products{productRows.length > 0 ? ` (${productRows.length})` : ""}
                                    </p>
                                    {serialLinesLoading ? (
                                        <p className="text-xs text-slate-400">Loading products…</p>
                                    ) : serialLinesError ? (
                                        <p className="text-xs text-red-500">Couldn't load this shipment's products and serial numbers. Close and reopen to retry.</p>
                                    ) : productRows.length === 0 ? (
                                        <p className="text-xs text-slate-400">No products found for this shipment.</p>
                                    ) : (
                                        <div className="flex flex-col gap-3">
                                            {productRows.map((row) => (
                                                <div key={row.saleItemId} className="rounded-lg border border-slate-200 bg-white p-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-sm font-semibold text-slate-800">{row.name}</span>
                                                        <span className="text-xs font-medium text-slate-500">Qty: {row.quantity ?? "—"}</span>
                                                    </div>
                                                    {row.isNonInventory ? (
                                                        <div className="mt-2">
                                                            <Field
                                                                name={`freeSerialsByItem.${row.saleItemId}`}
                                                                label="Serial Number (optional)"
                                                                placeholder="Leave empty if none"
                                                                component={FormikInput}
                                                            />
                                                        </div>
                                                    ) : !row.isSerialized ? (
                                                        <p className="mt-2 text-xs text-slate-400">Serial Number: Not Required</p>
                                                    ) : row.requiredSerialCount === 0 ? (
                                                        <p className="mt-2 text-xs text-slate-400">
                                                            {row.backorderedQuantity > 0
                                                                ? "Out of stock — serial numbers can be picked once units are received."
                                                                : "No serial numbers assigned to this product yet."}
                                                        </p>
                                                    ) : (
                                                        <>
                                                        {row.currentSerials.length < row.requiredSerialCount && (
                                                            <p className="mt-2 text-xs text-amber-600">
                                                                Only {row.currentSerials.length} of {row.requiredSerialCount} serial numbers are on record for this product — select the remaining {row.requiredSerialCount - row.currentSerials.length}.
                                                            </p>
                                                        )}
                                                        <Field
                                                            name={`serialsByItem.${row.saleItemId}`}
                                                            label={row.requiredSerialCount > 1 ? "Serial Numbers" : "Serial Number"}
                                                            requiredCount={row.requiredSerialCount}
                                                            options={row.serialOptions}
                                                            // Sibling rows for the same product (duplicate lines on one sale)
                                                            // must never be able to pick the same unit — see FormikSerialPicker.
                                                            excludeSerials={productRows
                                                                .filter((r) => r.saleItemId !== row.saleItemId && r.productId === row.productId)
                                                                .flatMap((r) => values.serialsByItem?.[r.saleItemId] || [])}
                                                            component={FormikSerialPicker}
                                                        />
                                                        </>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="sm:col-span-2">
                                <Field name="note" label="Note" placeholder="Any additional notes..." multiline component={FormikInput} />
                            </div>

                            <div className="sm:col-span-2 flex justify-end gap-3 border-t border-slate-100 pt-4">
                                <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={saveMutation.isPending || groupSaveMutation.isPending || (isSaleLinked && serialLinesLoading)}
                                    className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3162d2]"
                                >
                                    {saveMutation.isPending || groupSaveMutation.isPending
                                        ? "Saving..."
                                        : isEdit
                                            ? "Save Changes"
                                            : "Create Courier"}
                                </button>
                            </div>
                        </Form>
                    )}
                </Formik>
            </div>
        </div>
    );
};

export default CourierEditModal;
