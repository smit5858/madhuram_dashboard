import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import toast from "react-hot-toast";
import { Field, FieldArray, Form, Formik, useFormikContext, type FormikHelpers } from "formik";
import {
  Package,
  Search as SearchIcon,
  Plus,
  Edit2,
  Trash2,
  Eye,
  XCircle,
  Boxes,
  Tag,
  RotateCcw,
  AlertTriangle,
  Lock,
  Barcode,
  PackageCheck,
  PlusCircle,
} from "lucide-react";
import { useDebounce } from "@/hook/useDebounce";
import { type RootState } from "../../store/store";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import productService, {
  type ProductData,
  type ProductDetail,
  type CreateProductPayload,
  type UpdateProductPayload,
  type ProductFilters,
} from "../../services/product.service";
import dealerService, { type DealerData, type DealerListResponse } from "../../services/dealer.service";
import inventoryService, { type ReceiveNonSerialPayload, type ReceiveSerializedPayload } from "../../services/inventory.service";
import AddressAutocompleteInput from "@/shared/components/AddressAutocompleteInput";
import { getTodayISODate } from "@/shared/utils/date";
import {
  productFilterSchema,
  createNonSerialSchema,
  createSerializedSchema,
  editProductSchema,
  receiveNonSerialStockSchema,
  receiveSerializedStockSchema,
  type ProductFilterValues,
} from "@/validation/product.validation";
import { createDealerSchema, type CreateDealerFormValues } from "@/validation/dealer.validation";
import { PRODUCT_TYPE_OPTIONS, PRODUCT_TYPE_LABELS, type ProductType } from "@/shared/enum/product-type";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface UnitRowValues {
  serialNumber: string;
  purchasePrice: number | "";
  sellingPrice: number | "";
  purchaseDate: string;
  dealerId: number | "";
}

interface ProductFormValues {
  name: string;
  description: string;
  productType: ProductType | "";
  isActive: boolean;
  quantity: number | "";
  purchasePrice: number | "";
  sellingPrice: number | "";
  dealerId: number | "";
  purchaseDate: string;
  units: UnitRowValues[];
}

const EMPTY_UNIT_ROW: UnitRowValues = { serialNumber: "", purchasePrice: "", sellingPrice: "", purchaseDate: getTodayISODate(), dealerId: "" };

const EMPTY_FORM_VALUES: ProductFormValues = {
  name: "",
  description: "",
  productType: "",
  isActive: true,
  quantity: "",
  purchasePrice: "",
  sellingPrice: "",
  dealerId: "",
  purchaseDate: getTodayISODate(),
  units: [{ ...EMPTY_UNIT_ROW }],
};

const PAGE_SIZE_OPTIONS = [10, 25, 50];

const TYPE_BADGE_CLASS: Record<ProductType, string> = {
  NON_SERIAL: "bg-slate-100 text-slate-700 border-slate-200",
  SERIALIZED: "bg-indigo-50 text-indigo-700 border-indigo-100",
};

const SERIAL_STATUS_BADGE_CLASS: Record<string, string> = {
  AVAILABLE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  RESERVED: "bg-amber-50 text-amber-700 border-amber-200",
  SOLD: "bg-blue-50 text-blue-700 border-blue-200",
  RETURNED: "bg-slate-100 text-slate-700 border-slate-200",
  DAMAGED: "bg-rose-50 text-rose-700 border-rose-200",
  LOST: "bg-rose-50 text-rose-700 border-rose-200",
};

const formatCurrency = (value: number | null | undefined) =>
  value === null || value === undefined ? "—" : `₹${Number(value).toLocaleString("en-IN")}`;

/** Applies filter form values to the fetched list — search is debounced, selects apply immediately. */
const FilterSync = ({
  setAppliedFilters,
}: {
  setAppliedFilters: React.Dispatch<React.SetStateAction<ProductFilters>>;
}) => {
  const { values } = useFormikContext<ProductFilterValues>();
  const debouncedSearch = useDebounce(values.search, 400);

  useEffect(() => {
    setAppliedFilters((prev) => ({ ...prev, search: debouncedSearch || undefined, page: 1 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  useEffect(() => {
    setAppliedFilters((prev) => ({
      ...prev,
      productType: (values.productType || undefined) as ProductFilters["productType"],
      status: (values.status || undefined) as ProductFilters["status"],
      page: 1,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values.productType, values.status]);

  return null;
};

const EMPTY_DEALER_FORM_VALUES: CreateDealerFormValues = { name: "", phone: "", email: "", website: "", address: "" };

/**
 * Nested "quick add" modal for creating a dealer inline while filling out a product/unit form.
 * Closing this modal on success must NEVER close the parent Product form or reset its state —
 * only `onClose` (this modal) is called; the caller decides what to do with the new dealer.
 */
const QuickAddDealerModal = ({
  isOpen,
  mode,
  dealerId,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  mode: "create" | "edit";
  dealerId?: number;
  onClose: () => void;
  onCreated: (dealer: DealerData) => void;
}) => {
  const queryClient = useQueryClient();
  const [apiError, setApiError] = useState<string | null>(null);
  const [formValues, setFormValues] = useState<CreateDealerFormValues>(EMPTY_DEALER_FORM_VALUES);

  useEffect(() => {
    if (!isOpen) return;

    if (mode === "edit" && dealerId) {
      const existing = queryClient.getQueryData<DealerListResponse>(["dealers"]) as { data?: { data?: DealerData[] } } | undefined;
      const match = existing?.data?.data?.find((dealer) => dealer.id === dealerId) ?? null;
      setFormValues({
        name: match?.name ?? "",
        phone: match?.phone ?? "",
        email: match?.email ?? "",
        website: match?.website ?? "",
        address: match?.address ?? "",
      });
      return;
    }

    setFormValues(EMPTY_DEALER_FORM_VALUES);
  }, [isOpen, mode, dealerId, queryClient]);

  const createDealerMutation = useMutation({
    mutationFn: async (values: CreateDealerFormValues) => {
      const payload = {
        name: values.name.trim(),
        phone: values.phone?.trim() || undefined,
        email: values.email?.trim() || undefined,
        website: values.website?.trim() || undefined,
        address: values.address?.trim() || undefined,
      };

      if (mode === "edit" && dealerId) {
        const res = await dealerService.updateDealer(dealerId, payload);
        if (!res.data?.success || !res.data.data) {
          throw new Error(res.data?.message || "Dealer update did not return a valid response");
        }
        return res;
      }

      const res = await dealerService.createDealer(payload);
      if (!res.data?.success || !res.data.data) {
        throw new Error(res.data?.message || "Dealer creation did not return a valid response");
      }
      return res;
    },
    onSuccess: (res) => {
      toast.success(mode === "edit" ? "Dealer updated" : "Dealer added");
      setApiError(null);
      queryClient.invalidateQueries({ queryKey: ["dealers"] });
      onCreated(res.data.data);
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      const message = err.response?.data?.message || err.message || (mode === "edit" ? "Failed to update dealer" : "Failed to add dealer");
      setApiError(message);
      toast.error(message);
    },
  });

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <h3 className="text-sm font-bold text-slate-900 mb-1">{mode === "edit" ? "Edit Dealer" : "Add New Dealer"}</h3>
        <p className="text-xs text-slate-500 mb-4">
          {mode === "edit" ? "Update the selected supplier details." : "Quickly add a supplier you can select right away."}
        </p>

        <Formik<CreateDealerFormValues>
          initialValues={formValues}
          enableReinitialize
          validate={(values) => {
            const result = createDealerSchema.safeParse(values);
            if (result.success) return {};
            return result.error.issues.reduce(
              (errors: Record<string, string>, issue) => {
                const field = issue.path.join(".");
                if (!errors[field]) errors[field] = issue.message;
                return errors;
              },
              {} as Record<string, string>
            );
          }}
          onSubmit={(values, helpers) => {
            setApiError(null);
            createDealerMutation.mutate(values, { onSettled: () => helpers.setSubmitting(false) });
          }}
        >
          {({ values, setFieldValue, isSubmitting, errors, touched }) => (
            <Form className="space-y-3">
              <Field name="name" label="Dealer Name *" placeholder="e.g. ABC Traders" component={FormikInput} />
              <Field name="phone" label="Phone" placeholder="Optional" component={FormikInput} />
              <Field name="email" type="email" label="Email" placeholder="Optional" component={FormikInput} />
              <Field name="website" label="Website Link" placeholder="Optional — e.g. example.com" component={FormikInput} />

              <AddressAutocompleteInput
                id="dealer-address"
                value={values.address || ""}
                onChange={(address) => setFieldValue("address", address)}
                error={touched.address ? errors.address : undefined}
              />

              {apiError && (
                <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-600">
                  {apiError}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || createDealerMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-4 py-1.5 text-xs font-bold text-white hover:bg-[#3162d2] disabled:opacity-50"
                >
                  {isSubmitting || createDealerMutation.isPending ? "Saving..." : mode === "edit" ? "Update Dealer" : "Save Dealer"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

interface ReceiveNonSerialFormValues {
  quantity: number | "";
  purchasePrice: number | "";
  dealerId: number | "";
  purchaseDate: string;
}

const EMPTY_RECEIVE_NON_SERIAL_VALUES: ReceiveNonSerialFormValues = {
  quantity: "",
  purchasePrice: "",
  dealerId: "",
  purchaseDate: getTodayISODate(),
};

interface ReceiveSerializedFormValues {
  units: UnitRowValues[];
}

const EMPTY_RECEIVE_SERIALIZED_VALUES: ReceiveSerializedFormValues = {
  units: [{ ...EMPTY_UNIT_ROW }],
};

const parseFormikErrors = (result: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) => {
  if (result.success || !result.error) return {};
  return result.error.issues.reduce(
    (errors: Record<string, string>, issue) => {
      const field = issue.path.join(".");
      if (!errors[field]) errors[field] = issue.message;
      return errors;
    },
    {} as Record<string, string>
  );
};

/** Records a new purchase batch against an existing product — the only way to add quantity
 *  (NON_SERIAL) or new units (SERIALIZED) after creation, since Products edit intentionally
 *  doesn't let quantity/purchasePrice be overwritten directly (each batch keeps its own price). */
const ReceiveStockModal = ({
  product,
  dealers,
  onClose,
}: {
  product: ProductData | null;
  dealers: DealerData[];
  onClose: () => void;
}) => {
  const queryClient = useQueryClient();

  const receiveStockMutation = useMutation({
    mutationFn: (payload: ReceiveNonSerialPayload | ReceiveSerializedPayload) => inventoryService.receiveStock(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Stock received successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      if (product) queryClient.invalidateQueries({ queryKey: ["product-detail", product.id] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to receive stock");
    },
  });

  if (!product) return null;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Receive Stock — {product.name}</h3>
            <p className="text-xs text-slate-500">Record a new purchase batch to add to available stock.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        {product.productType === "NON_SERIAL" ? (
          <Formik<ReceiveNonSerialFormValues>
            initialValues={EMPTY_RECEIVE_NON_SERIAL_VALUES}
            validate={(values) => parseFormikErrors(receiveNonSerialStockSchema.safeParse(values))}
            onSubmit={(values, helpers) => {
              receiveStockMutation.mutate(
                {
                  productId: product.id,
                  quantity: Number(values.quantity),
                  purchasePrice: values.purchasePrice === "" ? undefined : Number(values.purchasePrice),
                  dealerId: values.dealerId === "" ? undefined : Number(values.dealerId),
                  purchaseDate: values.purchaseDate || undefined,
                },
                { onSettled: () => helpers.setSubmitting(false) }
              );
            }}
          >
            {({ values, setFieldValue, isSubmitting }) => (
              <Form className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Field name="quantity" type="number" label="Quantity *" placeholder="0" component={FormikInput} />
                  <Field name="purchasePrice" type="number" label="Purchase Price" placeholder="0.00" component={FormikInput} />
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
                    <input
                      type="date"
                      value={values.purchaseDate}
                      onChange={(e) => setFieldValue("purchaseDate", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Dealer / Supplier</label>
                    <select
                      value={values.dealerId}
                      onChange={(e) => setFieldValue("dealerId", e.target.value ? Number(e.target.value) : "")}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                    >
                      <option value="">-- No dealer --</option>
                      {dealers.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || receiveStockMutation.isPending}
                    className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#3162d2] disabled:opacity-50 transition"
                  >
                    {isSubmitting || receiveStockMutation.isPending ? "Saving..." : "Receive Stock"}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        ) : (
          <Formik<ReceiveSerializedFormValues>
            initialValues={EMPTY_RECEIVE_SERIALIZED_VALUES}
            validate={(values) => parseFormikErrors(receiveSerializedStockSchema.safeParse(values))}
            onSubmit={(values, helpers) => {
              receiveStockMutation.mutate(
                {
                  productId: product.id,
                  units: values.units
                    .filter((u) => u.serialNumber.trim())
                    .map((u) => ({
                      serialNumber: u.serialNumber.trim(),
                      purchasePrice: u.purchasePrice === "" ? undefined : Number(u.purchasePrice),
                      sellingPrice: u.sellingPrice === "" ? undefined : Number(u.sellingPrice),
                      purchaseDate: u.purchaseDate || undefined,
                      dealerId: u.dealerId === "" ? undefined : Number(u.dealerId),
                    })),
                },
                { onSettled: () => helpers.setSubmitting(false) }
              );
            }}
          >
            {({ values, setFieldValue, isSubmitting }) => (
              <Form className="space-y-3">
                <FieldArray name="units">
                  {({ push, remove }) => (
                    <div className="space-y-3">
                      {values.units.map((row, idx) => (
                        <div key={idx} className="rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-slate-400">Unit #{idx + 1}</span>
                            {values.units.length > 1 && (
                              <button type="button" onClick={() => remove(idx)} className="text-rose-500 hover:text-rose-700">
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <Field
                              name={`units.${idx}.serialNumber`}
                              label="Serial Number"
                              placeholder="e.g. TC001"
                              component={FormikInput}
                            />
                            <Field
                              name={`units.${idx}.purchasePrice`}
                              type="number"
                              label="Purchase Price"
                              placeholder="0.00"
                              component={FormikInput}
                            />
                            <Field
                              name={`units.${idx}.sellingPrice`}
                              type="number"
                              label="Selling Price"
                              placeholder="0.00"
                              component={FormikInput}
                            />
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
                              <input
                                type="date"
                                value={row.purchaseDate}
                                onChange={(e) => setFieldValue(`units.${idx}.purchaseDate`, e.target.value)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-slate-700 mb-1">Dealer</label>
                              <select
                                value={row.dealerId}
                                onChange={(e) =>
                                  setFieldValue(`units.${idx}.dealerId`, e.target.value ? Number(e.target.value) : "")
                                }
                                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                              >
                                <option value="">--</option>
                                {dealers.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => push({ ...EMPTY_UNIT_ROW })}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3d6fe0] hover:text-[#3162d2]"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add Another Unit
                      </button>
                    </div>
                  )}
                </FieldArray>

                <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || receiveStockMutation.isPending}
                    className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#3162d2] disabled:opacity-50 transition"
                  >
                    {isSubmitting || receiveStockMutation.isPending ? "Saving..." : "Receive Stock"}
                  </button>
                </div>
              </Form>
            )}
          </Formik>
        )}
      </div>
    </div>
  );
};

/** Global "search by serial number → history" lookup. A serial is only unique per product
 *  (see serialUnit.model.js), so a query can legitimately match units on more than one
 *  product — the user picks which match they meant before the full timeline loads. */
const SerialLookupModal = ({ onClose }: { onClose: () => void }) => {
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounce(query, 400);
  const [selectedSerialId, setSelectedSerialId] = useState<number | null>(null);

  // A fresh search should never keep a match selected from the previous query — adjusted
  // during render (not an effect) per https://react.dev/learn/you-might-not-need-an-effect.
  const [queryAtSelection, setQueryAtSelection] = useState(debouncedQuery);
  if (debouncedQuery !== queryAtSelection) {
    setQueryAtSelection(debouncedQuery);
    if (selectedSerialId !== null) setSelectedSerialId(null);
  }

  const { data: matchesResponse, isFetching: isSearching } = useQuery({
    queryKey: ["serial-lookup", debouncedQuery],
    queryFn: ({ signal }) => inventoryService.getSerials({ serialNumber: debouncedQuery }, { signal }),
    enabled: debouncedQuery.trim().length > 0,
  });
  const matches = matchesResponse?.data?.data || [];

  // A single match is shown directly without requiring a click — derived at render time
  // rather than stored, so there's nothing to keep in sync via an effect.
  const effectiveSerialId = selectedSerialId ?? (matches.length === 1 ? matches[0].id : null);

  const { data: detailResponse, isLoading: isDetailLoading } = useQuery({
    queryKey: ["serial-detail", effectiveSerialId],
    queryFn: () => inventoryService.getSerialById(effectiveSerialId as number),
    enabled: effectiveSerialId !== null,
  });
  const detail = detailResponse?.data?.data;

  return (
    <div
      className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Search by Serial Number</h3>
            <p className="text-xs text-slate-500">Look up a single unit's purchase and sale history.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="relative mb-4">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. TC001"
            className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-2.5 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none font-mono"
          />
        </div>

        {selectedSerialId !== null && matches.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedSerialId(null)}
            className="mb-3 text-xs font-semibold text-[#3d6fe0] hover:text-[#3162d2]"
          >
            ← Back to matches
          </button>
        )}

        {debouncedQuery.trim().length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-8">Type a serial number to search across all products.</p>
        ) : effectiveSerialId === null ? (
          isSearching ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
            </div>
          ) : matches.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-8">No serial number matching "{debouncedQuery}" was found.</p>
          ) : (
            <div className="space-y-1.5">
              {matches.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelectedSerialId(m.id)}
                  className="w-full flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:bg-slate-50 transition"
                >
                  <div>
                    <div className="font-mono font-semibold text-slate-800">{m.serialNumber}</div>
                    <div className="text-[11px] text-slate-400">{m.productName}</div>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${SERIAL_STATUS_BADGE_CLASS[m.status]}`}>
                    {m.status}
                  </span>
                </button>
              ))}
            </div>
          )
        ) : isDetailLoading || !detail ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono text-sm font-bold text-slate-900">{detail.serialNumber}</div>
                  <div className="text-xs text-slate-500">{detail.productName}</div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold border ${SERIAL_STATUS_BADGE_CLASS[detail.status]}`}>
                  {detail.status}
                </span>
              </div>
            </div>

            <ol className="space-y-3">
              <li className="flex gap-3">
                <div className="flex flex-col items-center pt-0.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#3d6fe0]" />
                  <span className="w-px flex-1 bg-slate-200" />
                </div>
                <div className="pb-1">
                  <div className="text-xs font-semibold text-slate-800">Purchased</div>
                  <div className="text-[11px] text-slate-500">
                    {detail.purchaseDate ? new Date(detail.purchaseDate).toLocaleDateString("en-IN") : "Date unknown"}
                    {" · "}
                    from {detail.dealer?.name || "unknown dealer"}
                    {detail.purchasePrice !== null && detail.purchasePrice !== undefined ? ` · ${formatCurrency(detail.purchasePrice)}` : ""}
                  </div>
                </div>
              </li>

              {(detail.status === "SOLD" || detail.status === "RETURNED" || detail.customerName) && (
                <li className="flex gap-3">
                  <div className="flex flex-col items-center pt-0.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                    <span className="w-px flex-1 bg-slate-200" />
                  </div>
                  <div className="pb-1">
                    <div className="text-xs font-semibold text-slate-800">Sold</div>
                    <div className="text-[11px] text-slate-500">
                      {detail.sellingDate ? new Date(detail.sellingDate).toLocaleDateString("en-IN") : "Date unknown"}
                      {" · "}
                      to {detail.customerName || "unknown customer"}
                      {detail.invoiceNumber ? ` · Invoice ${detail.invoiceNumber}` : ""}
                      {detail.sellingPrice !== null && detail.sellingPrice !== undefined ? ` · ${formatCurrency(detail.sellingPrice)}` : ""}
                    </div>
                  </div>
                </li>
              )}

              {detail.status === "RETURNED" && (
                <li className="flex gap-3">
                  <div className="flex flex-col items-center pt-0.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-slate-400" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-800">Returned</div>
                    <div className="text-[11px] text-slate-500">
                      {detail.returnedAt ? new Date(detail.returnedAt).toLocaleDateString("en-IN") : "Date unknown"}
                    </div>
                  </div>
                </li>
              )}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
};

const Products = () => {
  const queryClient = useQueryClient();
  const { permissions } = useSelector((state: RootState) => state.auth);

  const pagePermission = useMemo(() => {
    if (!permissions) {
      return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }
    const p = permissions.find(
      (perm) => perm.routePath.toLowerCase() === "/products" || perm.routeName.toLowerCase() === "products"
    );
    return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  }, [permissions]);

  const inventoryPermission = useMemo(() => {
    if (!permissions) {
      return { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
    }
    const p = permissions.find(
      (perm) => perm.routePath.toLowerCase() === "/inventory" || perm.routeName.toLowerCase() === "inventory"
    );
    return p ?? { canRead: false, canCreate: false, canUpdate: false, canDelete: false };
  }, [permissions]);

  // Default to Active only — deactivated (deleted) products stay out of the default view.
  const [appliedFilters, setAppliedFilters] = useState<ProductFilters>({ status: "active" });
  const [pageSize, setPageSize] = useState(10);

  const queryFilters = useMemo<ProductFilters>(
    () => ({ ...appliedFilters, page: appliedFilters.page ?? 1, limit: pageSize }),
    [appliedFilters, pageSize]
  );

  const {
    data: productsResponse,
    isLoading,
    isFetching,
    isError,
    error,
  } = useQuery({
    queryKey: ["products", queryFilters],
    queryFn: ({ signal }) => productService.getProducts(queryFilters, { signal }),
    enabled: pagePermission.canRead,
  });

  const productsList: ProductData[] = productsResponse?.data?.data || [];
  const paginationMeta = productsResponse?.data?.meta || { page: 1, limit: pageSize, total: 0, totalPages: 1 };
  // "active" is the default status filter, not a user-applied one — only count it once they've picked something else.
  const hasNonDefaultFilters = Boolean(
    appliedFilters.search || appliedFilters.productType || (appliedFilters.status && appliedFilters.status !== "active")
  );

  const { data: dealersResponse } = useQuery({
    queryKey: ["dealers"],
    queryFn: () => dealerService.getDealers({ status: "active", limit: 100 }),
    enabled: pagePermission.canRead,
  });
  const dealers: DealerData[] = dealersResponse?.data?.data || [];

  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [detailProductId, setDetailProductId] = useState<number | null>(null);
  const [receiveStockProduct, setReceiveStockProduct] = useState<ProductData | null>(null);
  const [isSerialLookupOpen, setIsSerialLookupOpen] = useState(false);
  const [dealerQuickAdd, setDealerQuickAdd] = useState<{
    open: boolean;
    mode: "create" | "edit";
    target: "product" | number | null;
    dealerId: number | null;
  }>({
    open: false,
    mode: "create",
    target: null,
    dealerId: null,
  });

  const { data: detailResponse, isLoading: isDetailLoading } = useQuery({
    queryKey: ["product-detail", detailProductId],
    queryFn: () => productService.getProductById(detailProductId as number),
    enabled: detailProductId !== null,
  });
  const detailProduct: ProductDetail | undefined = detailResponse?.data?.data;

  const createProductMutation = useMutation({
    mutationFn: (payload: CreateProductPayload) => productService.createProduct(payload),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Product created successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeFormModal();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to create product");
    },
  });

  const updateProductMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateProductPayload }) => productService.updateProduct(id, data),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Product updated successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
      closeFormModal();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to update product");
    },
  });

  const deleteProductMutation = useMutation({
    mutationFn: (id: number) => productService.deleteProduct(id),
    onSuccess: (res) => {
      toast.success(res.data?.message || "Product deactivated successfully");
      queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to deactivate product");
    },
  });

  const openCreateModal = () => {
    setSelectedProduct(null);
    setIsFormModalOpen(true);
  };
  const openEditModal = (product: ProductData) => {
    setSelectedProduct(product);
    setIsFormModalOpen(true);
  };
  const closeFormModal = () => {
    setIsFormModalOpen(false);
    setSelectedProduct(null);
  };
  const openDetailModal = (product: ProductData) => setDetailProductId(product.id);
  const closeDetailModal = () => setDetailProductId(null);

  const validateProductForm = (values: ProductFormValues) => {
    if (!selectedProduct && !values.productType) {
      return { productType: "Select a product type" };
    }

    const schema = selectedProduct
      ? editProductSchema
      : values.productType === "SERIALIZED"
        ? createSerializedSchema
        : createNonSerialSchema;

    const result = schema.safeParse(values);
    if (result.success) return {};
    return result.error.issues.reduce(
      (errors: Record<string, string>, issue) => {
        const field = issue.path.join(".");
        if (!errors[field]) errors[field] = issue.message;
        return errors;
      },
      {} as Record<string, string>
    );
  };

  const handleFormSubmit = (values: ProductFormValues, helpers: FormikHelpers<ProductFormValues>) => {
    if (selectedProduct) {
      const updatePayload: UpdateProductPayload = {
        name: values.name.trim(),
        description: values.description.trim() || undefined,
        isActive: values.isActive,
      };
      if (selectedProduct.productType === "NON_SERIAL") {
        if (values.sellingPrice !== "") {
          updatePayload.sellingPrice = Number(values.sellingPrice);
        }
        updatePayload.dealerId = values.dealerId === "" ? null : Number(values.dealerId);
      }
      updateProductMutation.mutate(
        { id: selectedProduct.id, data: updatePayload },
        { onSettled: () => helpers.setSubmitting(false) }
      );
      return;
    }

    const basePayload = {
      name: values.name.trim(),
      description: values.description.trim() || undefined,
      productType: values.productType as ProductType,
    };

    const createPayload: CreateProductPayload =
      values.productType === "SERIALIZED"
        ? {
            ...basePayload,
            units: values.units
              .filter((u) => u.serialNumber.trim())
              .map((u) => ({
                serialNumber: u.serialNumber.trim(),
                purchasePrice: u.purchasePrice === "" ? undefined : Number(u.purchasePrice),
                sellingPrice: u.sellingPrice === "" ? undefined : Number(u.sellingPrice),
                purchaseDate: u.purchaseDate || undefined,
                dealerId: u.dealerId === "" ? undefined : Number(u.dealerId),
              })),
          }
        : {
            ...basePayload,
            quantity: values.quantity === "" ? undefined : Number(values.quantity),
            purchasePrice: values.purchasePrice === "" ? undefined : Number(values.purchasePrice),
            sellingPrice: values.sellingPrice === "" ? undefined : Number(values.sellingPrice),
            dealerId: values.dealerId === "" ? undefined : Number(values.dealerId),
            purchaseDate: values.purchaseDate || undefined,
          };

    createProductMutation.mutate(createPayload, { onSettled: () => helpers.setSubmitting(false) });
  };

  const handleDelete = (product: ProductData) => {
    if (window.confirm(`Are you sure you want to deactivate "${product.name}"? It will no longer be sellable.`)) {
      deleteProductMutation.mutate(product.id);
    }
  };

  const isMutating = createProductMutation.isPending || updateProductMutation.isPending;

  return (
    <div className="space-y-6 p-6 bg-white rounded-xl shadow-md flex flex-col gap-6">
      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-[#3d6fe0]">
            <Package className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Products</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{paginationMeta.total}</h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <PackageCheck className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Active On This Page</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">{productsList.filter((p) => p.isActive).length}</h3>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Boxes className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Current View</p>
            <h3 className="text-2xl font-bold text-slate-800 mt-0.5">
              Page {paginationMeta.page} / {paginationMeta.totalPages}
            </h3>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-2xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border border-slate-200 bg-white p-4 shadow-sm">
        <Formik
          initialValues={{ search: "", productType: "", status: "active" }}
          validate={(values) => {
            const result = productFilterSchema.safeParse(values);
            return result.success ? {} : { search: result.error.issues[0]?.message };
          }}
          onSubmit={(values) => {
            setAppliedFilters((prev) => ({
              ...prev,
              search: values.search || undefined,
              productType: (values.productType || undefined) as ProductFilters["productType"],
              status: (values.status || undefined) as ProductFilters["status"],
              page: 1,
            }));
          }}
        >
          {({ resetForm }) => (
            <Form className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <FilterSync setAppliedFilters={setAppliedFilters} />

              <div className="relative flex-1 min-w-50 max-w-md">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Field
                  name="search"
                  type="text"
                  placeholder="Search by name or description..."
                  className="w-full form-input pl-9"
                  component={FormikInput}
                />
              </div>

              <Field
                as="select"
                name="productType"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Types</option>
                {PRODUCT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </Field>

              <Field
                as="select"
                name="status"
                className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-medium text-slate-700 focus:border-[#3d6fe0] focus:bg-white focus:outline-none cursor-pointer"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </Field>

              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setAppliedFilters({ status: "active" });
                }}
                title="Reset filters"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </Form>
          )}
        </Formik>

        <div className="flex items-center gap-2">
          {inventoryPermission.canRead && (
            <button
              type="button"
              onClick={() => setIsSerialLookupOpen(true)}
              title="Search by Serial Number"
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all"
            >
              <Barcode className="h-4 w-4" />
              <span>Serial Lookup</span>
            </button>
          )}

          {pagePermission.canCreate && (
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#3d6fe0] px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:bg-[#3162d2] transition-all"
            >
              <Plus className="h-4 w-4" />
              <span>Add Product</span>
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {!pagePermission.canRead ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <Lock className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">You do not have permission to view products.</p>
            <p className="text-xs text-slate-400">Contact an administrator if you believe this is a mistake.</p>
          </div>
        ) : isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
          </div>
        ) : isError ? (
          <div className="flex h-64 flex-col items-center justify-center text-rose-500 gap-2 px-6 text-center">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm font-semibold">
              {(error as ApiErrorLike)?.response?.data?.message || (error as ApiErrorLike)?.message || "Failed to load products"}
            </p>
          </div>
        ) : productsList.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center text-slate-400 gap-2 px-6 text-center">
            <Package className="h-10 w-10 text-slate-300" />
            <p className="text-sm font-medium text-slate-600">
              {hasNonDefaultFilters
                ? "No products match your filters."
                : "No products found."}
            </p>
            {hasNonDefaultFilters ? (
              <button
                type="button"
                onClick={() => setAppliedFilters({ status: "active" })}
                className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reset Filters
              </button>
            ) : (
              pagePermission.canCreate && (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-[#3d6fe0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#3162d2]"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add Product
                </button>
              )
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500 border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3.5 whitespace-nowrap">Sr.</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Name</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Type</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Available</th>
                  <th className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">Purchase Price</th>
                  <th className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">Selling Price</th>
                  <th className="hidden lg:table-cell px-4 py-3.5 whitespace-nowrap">Dealer</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-normal">
                {productsList.map((product, index) => (
                  <tr key={product.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-4 py-3.5 text-slate-400 font-medium whitespace-nowrap">
                      {(paginationMeta.page - 1) * paginationMeta.limit + index + 1}
                    </td>

                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-slate-900 whitespace-nowrap">{product.name}</div>
                      {product.description && (
                        <div className="text-[11px] text-slate-400 max-w-xs truncate">{product.description}</div>
                      )}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${TYPE_BADGE_CLASS[product.productType]}`}>
                        {PRODUCT_TYPE_LABELS[product.productType]}
                      </span>
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="font-semibold text-slate-800">{product.available} pcs</div>
                      {product.reserved > 0 && <div className="text-[11px] text-slate-400">{product.reserved} reserved</div>}
                    </td>

                    <td className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">
                      {product.productType === "NON_SERIAL" ? formatCurrency(product.purchasePrice) : "—"}
                    </td>
                    <td className="hidden md:table-cell px-4 py-3.5 whitespace-nowrap">
                      {product.productType === "NON_SERIAL" ? formatCurrency(product.sellingPrice) : "—"}
                    </td>
                    <td className="hidden lg:table-cell px-4 py-3.5 whitespace-nowrap">
                      {product.productType === "NON_SERIAL" ? product.dealer?.name || "—" : "—"}
                    </td>

                    <td className="px-4 py-3.5 whitespace-nowrap">
                      {product.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                          Inactive
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => openDetailModal(product)}
                          title={product.productType === "SERIALIZED" ? "View Units" : "View Product Details"}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition"
                        >
                          <Eye className="h-4 w-4" />
                        </button>

                        {pagePermission.canUpdate && (
                          <button
                            type="button"
                            onClick={() => openEditModal(product)}
                            title="Edit Product"
                            className="rounded p-1 text-blue-600 hover:bg-blue-50 transition"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                        )}

                        {inventoryPermission.canCreate && product.isActive && (
                          <button
                            type="button"
                            onClick={() => setReceiveStockProduct(product)}
                            title="Receive Stock"
                            className="rounded p-1 text-emerald-600 hover:bg-emerald-50 transition"
                          >
                            <Boxes className="h-4 w-4" />
                          </button>
                        )}

                        {pagePermission.canDelete && (
                          <button
                            type="button"
                            onClick={() => handleDelete(product)}
                            disabled={!product.isActive}
                            title={product.isActive ? "Deactivate Product" : "Product is already inactive"}
                            className="rounded p-1 text-rose-500 hover:bg-rose-50 transition disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                          >
                            <Trash2 className="h-4 w-4" />
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

        {pagePermission.canRead && !isLoading && !isError && productsList.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Page {paginationMeta.page} of {paginationMeta.totalPages} · {paginationMeta.total} total products
              {isFetching && <span className="ml-2 text-slate-400">(refreshing…)</span>}
            </span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-slate-500">
                Rows:
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setAppliedFilters((prev) => ({ ...prev, page: 1 }));
                  }}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs focus:border-[#3d6fe0] focus:outline-none"
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
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={paginationMeta.page >= paginationMeta.totalPages}
                  onClick={() =>
                    setAppliedFilters((prev) => ({ ...prev, page: Math.min(paginationMeta.totalPages, paginationMeta.page + 1) }))
                  }
                  className="rounded-lg border border-slate-200 px-3 py-1.5 font-medium hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* CREATE / EDIT PRODUCT MODAL */}
      {isFormModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeFormModal(); }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">{selectedProduct ? "Edit Product" : "Add New Product"}</h3>
                <p className="text-xs text-slate-500">
                  {selectedProduct
                    ? "Product type cannot be changed after creation."
                    : "Choose the inventory behavior for this product carefully — it cannot be changed later."}
                </p>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <Formik<ProductFormValues>
              initialValues={
                selectedProduct
                  ? {
                      ...EMPTY_FORM_VALUES,
                      name: selectedProduct.name || "",
                      description: selectedProduct.description || "",
                      productType: selectedProduct.productType,
                      isActive: selectedProduct.isActive ?? true,
                      quantity: selectedProduct.currentStock ?? "",
                      purchasePrice: selectedProduct.purchasePrice ?? "",
                      sellingPrice: selectedProduct.sellingPrice ?? "",
                      dealerId: selectedProduct.dealer?.id ?? "",
                    }
                  : EMPTY_FORM_VALUES
              }
              enableReinitialize
              validate={validateProductForm}
              onSubmit={handleFormSubmit}
            >
              {({ values, setFieldValue, isSubmitting }) => (
                <>
                  <Form className="mt-5 space-y-4">
                    <Field name="name" label="Product Name *" placeholder="e.g. THINKCAR Diagnostic Tool" component={FormikInput} />
                    <Field name="description" label="Description" placeholder="Optional details about this product" multiline component={FormikInput} />

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Product Type *</label>
                      <select
                        value={values.productType}
                        disabled={Boolean(selectedProduct)}
                        onChange={(e) => setFieldValue("productType", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        <option value="">-- Select Product Type --</option>
                        {PRODUCT_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {!selectedProduct && values.productType === "NON_SERIAL" && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-600">Initial Stock</p>
                        <div className="grid grid-cols-2 gap-3">
                          <Field name="quantity" type="number" label="Quantity" placeholder="0" component={FormikInput} />
                          <Field name="purchasePrice" type="number" label="Purchase Price" placeholder="0.00" component={FormikInput} />
                          <Field name="sellingPrice" type="number" label="Selling Price" placeholder="0.00" component={FormikInput} />
                          <div>
                            <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
                            <input
                              type="date"
                              value={values.purchaseDate}
                              onChange={(e) => setFieldValue("purchaseDate", e.target.value)}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Dealer / Supplier</label>
                          <div className="flex gap-2">
                            <select
                              value={values.dealerId}
                              onChange={(e) => setFieldValue("dealerId", e.target.value ? Number(e.target.value) : "")}
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                            >
                              <option value="">-- No dealer --</option>
                              {dealers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setDealerQuickAdd({ open: true, mode: "create", target: "product", dealerId: null })}
                              title="Add new dealer"
                              className="rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"
                            >
                              <PlusCircle className="h-4 w-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}

                    {!selectedProduct && values.productType === "SERIALIZED" && (
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                        <p className="text-xs font-semibold text-slate-600">Serial Units (optional — you can also add these later)</p>
                        <FieldArray name="units">
                          {({ push, remove }) => (
                            <div className="space-y-3">
                              {values.units.map((row, idx) => (
                                <div key={idx} className="rounded-lg bg-white border border-slate-200 p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-slate-400">Unit #{idx + 1}</span>
                                    {values.units.length > 1 && (
                                      <button type="button" onClick={() => remove(idx)} className="text-rose-500 hover:text-rose-700">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    )}
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <Field
                                      name={`units.${idx}.serialNumber`}
                                      label="Serial Number"
                                      placeholder="e.g. TC001"
                                      component={FormikInput}
                                    />
                                    <Field
                                      name={`units.${idx}.purchasePrice`}
                                      type="number"
                                      label="Purchase Price"
                                      placeholder="0.00"
                                      component={FormikInput}
                                    />
                                    <Field
                                      name={`units.${idx}.sellingPrice`}
                                      type="number"
                                      label="Selling Price"
                                      placeholder="0.00"
                                      component={FormikInput}
                                    />
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1">Purchase Date</label>
                                      <input
                                        type="date"
                                        value={row.purchaseDate}
                                        onChange={(e) => setFieldValue(`units.${idx}.purchaseDate`, e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs font-semibold text-slate-700 mb-1">Dealer</label>
                                      <div className="flex gap-2">
                                        <select
                                          value={row.dealerId}
                                          onChange={(e) =>
                                            setFieldValue(`units.${idx}.dealerId`, e.target.value ? Number(e.target.value) : "")
                                          }
                                          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:bg-white focus:outline-none"
                                        >
                                          <option value="">--</option>
                                          {dealers.map((d) => (
                                            <option key={d.id} value={d.id}>
                                              {d.name}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="button"
                                          onClick={() => setDealerQuickAdd({ open: true, mode: "create", target: idx, dealerId: null })}
                                          title="Add new dealer"
                                          className="rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-100"
                                        >
                                          <PlusCircle className="h-4 w-4" />
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              ))}
                              <button
                                type="button"
                                onClick={() => push({ ...EMPTY_UNIT_ROW })}
                                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3d6fe0] hover:text-[#3162d2]"
                              >
                                <Plus className="h-3.5 w-3.5" /> Add Another Unit
                              </button>
                            </div>
                          )}
                        </FieldArray>
                      </div>
                    )}

                    {selectedProduct && selectedProduct.productType === "NON_SERIAL" && (
                      <>
                        <div className="grid grid-cols-2 gap-3">
                          <Field
                            name="quantity"
                            type="number"
                            label="Quantity"
                            readOnly
                            className="bg-slate-100 cursor-not-allowed"
                            component={FormikInput}
                          />
                          <Field
                            name="purchasePrice"
                            type="number"
                            label="Purchase Price"
                            readOnly
                            className="bg-slate-100 cursor-not-allowed"
                            component={FormikInput}
                          />
                          <Field name="sellingPrice" type="number" label="Selling Price" placeholder="0.00" component={FormikInput} />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 mb-1">Dealer / Supplier</label>
                          <div className="flex gap-2">
                            <select
                              value={values.dealerId}
                              onChange={(e) => setFieldValue("dealerId", e.target.value ? Number(e.target.value) : "")}
                              className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-[#3d6fe0] focus:outline-none"
                            >
                              <option value="">-- No dealer --</option>
                              {dealers.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {d.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => {
                                const selectedDealerId = values.dealerId === "" ? null : Number(values.dealerId);
                                if (selectedDealerId) {
                                  setDealerQuickAdd({ open: true, mode: "edit", target: "product", dealerId: selectedDealerId });
                                  return;
                                }
                                setDealerQuickAdd({ open: true, mode: "create", target: "product", dealerId: null });
                              }}
                              className="rounded-lg border border-slate-200 px-2 text-slate-500 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                              title={values.dealerId ? "Edit selected dealer" : "Add a dealer"}
                            >
                              {values.dealerId ? "Edit" : "Add"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}

                    {selectedProduct && (
                      <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                        <input
                          type="checkbox"
                          checked={values.isActive}
                          onChange={(e) => setFieldValue("isActive", e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-[#3d6fe0] focus:ring-[#3d6fe0]"
                        />
                        Active (available for sale)
                      </label>
                    )}

                    <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={closeFormModal}
                        className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting || isMutating}
                        className="rounded-lg bg-[#3d6fe0] px-5 py-2 text-xs font-semibold text-white shadow hover:bg-[#3162d2] disabled:opacity-50 transition"
                      >
                        {isSubmitting || isMutating ? "Saving..." : selectedProduct ? "Update Product" : "Create Product"}
                      </button>
                    </div>
                  </Form>

                  <QuickAddDealerModal
                    key={dealerQuickAdd.open ? `open-${dealerQuickAdd.mode}-${dealerQuickAdd.target}-${dealerQuickAdd.dealerId ?? "new"}` : "closed"}
                    isOpen={dealerQuickAdd.open}
                    mode={dealerQuickAdd.mode}
                    dealerId={dealerQuickAdd.dealerId ?? undefined}
                    onClose={() => setDealerQuickAdd({ open: false, mode: "create", target: null, dealerId: null })}
                    onCreated={(dealer) => {
                      if (dealerQuickAdd.target === "product") {
                        setFieldValue("dealerId", dealer.id);
                      } else if (typeof dealerQuickAdd.target === "number") {
                        setFieldValue(`units.${dealerQuickAdd.target}.dealerId`, dealer.id);
                      }
                    }}
                  />
                </>
              )}
            </Formik>
          </div>
        </div>
      )}

      {/* PRODUCT DETAILS MODAL */}
      {detailProductId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetailModal(); }}
        >
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            {isDetailLoading || !detailProduct ? (
              <div className="flex h-40 items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#3d6fe0] border-t-transparent"></div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{detailProduct.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium border ${TYPE_BADGE_CLASS[detailProduct.productType]}`}>
                        {PRODUCT_TYPE_LABELS[detailProduct.productType]}
                      </span>
                      {detailProduct.isActive ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                  <button type="button" onClick={closeDetailModal} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
                    <XCircle className="h-5 w-5" />
                  </button>
                </div>

                <div className="mt-5 space-y-4 text-xs">
                  <div className="rounded-xl bg-slate-50 p-4 border border-slate-100 space-y-3">
                    <div>
                      <span className="text-slate-400 font-medium flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Description
                      </span>
                      <span className="text-slate-800 font-medium">{detailProduct.description || "No description provided"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 font-medium block">Created On</span>
                      <span className="text-slate-800 font-semibold">
                        {detailProduct.createdAt ? new Date(detailProduct.createdAt).toLocaleDateString("en-IN") : "—"}
                      </span>
                    </div>
                  </div>

                  {detailProduct.productType === "NON_SERIAL" ? (
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center">
                        <div>
                          <div className="text-lg font-bold text-slate-800">{detailProduct.available}</div>
                          <div className="text-[11px] text-slate-400">Available</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-600">{detailProduct.reserved}</div>
                          <div className="text-[11px] text-slate-400">Reserved</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-800">{formatCurrency(detailProduct.purchasePrice)}</div>
                          <div className="text-[11px] text-slate-400">Purchase Price</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-slate-800">{formatCurrency(detailProduct.sellingPrice)}</div>
                          <div className="text-[11px] text-slate-400">Selling Price</div>
                        </div>
                      </div>
                      <div className="mt-3 text-center text-slate-500">Dealer: {detailProduct.dealer?.name || "—"}</div>
                    </div>
                  ) : (
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-lg font-bold text-emerald-600">{detailProduct.available}</div>
                          <div className="text-[11px] text-slate-400">Available</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-amber-600">{detailProduct.reserved}</div>
                          <div className="text-[11px] text-slate-400">Reserved</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-600">{detailProduct.sold ?? 0}</div>
                          <div className="text-[11px] text-slate-400">Sold</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {detailProduct.productType === "SERIALIZED" && (
                    <div className="rounded-xl bg-slate-50 p-4 border border-slate-100">
                      <div className="flex items-center gap-2 text-slate-500 font-medium mb-2">
                        <Barcode className="h-3.5 w-3.5" /> Serial Units
                      </div>
                      {!detailProduct.units || detailProduct.units.length === 0 ? (
                        <p className="text-slate-400">No serial units received yet.</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[11px]">
                            <thead className="text-slate-400 uppercase tracking-wide">
                              <tr>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Serial No.</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Purchase Price</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Purchase Date</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Dealer</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Status</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Customer</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Selling Price</th>
                                <th className="py-1.5 pr-3 whitespace-nowrap">Selling Date</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                              {detailProduct.units.map((u) => (
                                <tr key={u.id}>
                                  <td className="py-1.5 pr-3 font-mono text-slate-700 whitespace-nowrap">{u.serialNumber}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatCurrency(u.purchasePrice)}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{u.purchaseDate || "—"}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{u.dealer?.name || "—"}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold border ${SERIAL_STATUS_BADGE_CLASS[u.status]}`}>
                                      {u.status}
                                    </span>
                                  </td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{u.customerName || "—"}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">{formatCurrency(u.sellingPrice)}</td>
                                  <td className="py-1.5 pr-3 whitespace-nowrap">
                                    {u.sellingDate ? new Date(u.sellingDate).toLocaleDateString("en-IN") : "—"}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-6 flex justify-end">
                  <button
                    type="button"
                    onClick={closeDetailModal}
                    className="rounded-lg bg-slate-800 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-900 transition"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {receiveStockProduct && (
        <ReceiveStockModal
          product={receiveStockProduct}
          dealers={dealers}
          onClose={() => setReceiveStockProduct(null)}
        />
      )}

      {isSerialLookupOpen && <SerialLookupModal onClose={() => setIsSerialLookupOpen(false)} />}
    </div>
  );
};

export default Products;
