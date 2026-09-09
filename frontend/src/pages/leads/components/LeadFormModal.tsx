import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Field, Form, Formik } from "formik";
import toast from "react-hot-toast";
import { XCircle } from "lucide-react";
import leadService, { type LeadData } from "@/services/lead.service";
import platformService from "@/services/platform.service";
import FormikInput from "@/shared/components/formik-fields/FormikInput";
import FormikDate from "@/shared/components/formik-fields/FormikDate";
import FormikSelect from "@/shared/components/formik-fields/FormikSelect";
import { leadEntrySchema, LEAD_STATUSES, type LeadEntryFormValues } from "@/validation/lead.validation";
import { getTodayISODate } from "@/shared/utils/date";
import ProductAutocompleteField from "./ProductAutocompleteField";
import CustomerAutocompleteField from "./CustomerAutocompleteField";

interface ApiErrorLike {
  response?: { data?: { message?: string } };
  message?: string;
}

interface LeadFormModalProps {
  /** null = creating a new record */
  lead: LeadData | null;
  onClose: () => void;
}

const STATUS_OPTIONS = LEAD_STATUSES.map((s) => ({
  value: s,
  label: s.charAt(0) + s.slice(1).toLowerCase().replace("_", " "),
}));

const FollowUpFields = ({ index }: { index: 1 | 2 | 3 }) => (
  <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
    <div className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
      Follow-up {index} {index === 1 ? "(required)" : "(optional)"}
    </div>
    <div className="flex flex-col gap-4">
      <div className="max-w-56">
        <Field name={`followUp${index}Date`} label="Date" component={FormikDate} />
      </div>
      <Field name={`followUp${index}Notes`} label="Notes (optional)" placeholder="Optional notes" multiline component={FormikInput} />
    </div>
  </div>
);

const LeadFormModal = ({ lead, onClose }: LeadFormModalProps) => {
  const queryClient = useQueryClient();
  const isEdit = !!lead?.id;
  const [showFollowUp2, setShowFollowUp2] = useState(!!lead?.followUp2Date);
  const [showFollowUp3, setShowFollowUp3] = useState(!!lead?.followUp3Date);

  const { data: platformsResp } = useQuery({
    queryKey: ["platforms", "active"],
    queryFn: () => platformService.getPlatforms({ status: "active" }),
  });
  const platformOptions = (platformsResp?.data?.data || []).map((p) => ({ value: p.id, label: p.name }));

  const initialValues: LeadEntryFormValues = {
    platformId: lead?.platformId ?? "",
    customerName: lead?.customerName || "",
    companyName: lead?.companyName || "",
    phone: lead?.phone || "",
    address: lead?.address || "",
    city: lead?.city || "",
    productId: lead?.productId ?? "",
    quantity: lead?.quantity !== undefined && lead?.quantity !== null ? String(lead.quantity) : "",
    status: lead?.status || "PENDING",
    followUp1Date: lead?.followUp1Date || getTodayISODate(),
    followUp1Notes: lead?.followUp1Notes || "",
    followUp2Date: lead?.followUp2Date || "",
    followUp2Notes: lead?.followUp2Notes || "",
    followUp3Date: lead?.followUp3Date || "",
    followUp3Notes: lead?.followUp3Notes || "",
  };

  const saveMutation = useMutation({
    mutationFn: (values: LeadEntryFormValues) => {
      const payload: LeadData = {
        platformId: values.platformId,
        customerName: values.customerName.trim(),
        companyName: values.companyName?.trim() || undefined,
        phone: values.phone,
        address: values.address?.trim() || undefined,
        city: values.city?.trim() || undefined,
        productId: values.productId,
        quantity: values.quantity,
        status: values.status,
        followUp1Date: values.followUp1Date,
        followUp1Notes: values.followUp1Notes || undefined,
        followUp2Date: values.followUp2Date || undefined,
        followUp2Notes: values.followUp2Notes || undefined,
        followUp3Date: values.followUp3Date || undefined,
        followUp3Notes: values.followUp3Notes || undefined,
      };
      return isEdit ? leadService.updateLead(lead!.id!, payload) : leadService.createLead(payload);
    },
    onSuccess: (res) => {
      toast.success(res.data?.message || (isEdit ? "Lead updated successfully" : "Lead created successfully"));
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      queryClient.invalidateQueries({ queryKey: ["lead-stats"] });
      onClose();
    },
    onError: (err: ApiErrorLike) => {
      toast.error(err.response?.data?.message || err.message || "Failed to save lead");
    },
  });

  const validate = (values: LeadEntryFormValues) => {
    const result = leadEntrySchema.safeParse(values);
    const errors: Partial<Record<keyof LeadEntryFormValues, string>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const key = issue.path[0] as keyof LeadEntryFormValues;
        if (!errors[key]) errors[key] = issue.message;
      }
    }
    return errors;
  };

  return (
    <div
      className="fixed inset-0 z-70 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-200 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <h3 className="text-base font-bold text-slate-900">{isEdit ? "Edit Lead" : "Add Lead"}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition">
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <Formik initialValues={initialValues} validate={validate} onSubmit={(values) => saveMutation.mutate(values)} enableReinitialize>
          {({ values, errors, touched, setFieldValue }) => (
            <Form className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field name="platformId" label="Platform" options={platformOptions} placeholder="Select a platform" component={FormikSelect} />
                  <Field name="status" label="Status" options={STATUS_OPTIONS} component={FormikSelect} />
                  <Field name="customerName" label="Customer Name" placeholder="e.g. John Doe" component={FormikInput} />
                  <Field name="companyName" label="Company Name (optional)" placeholder="e.g. ABC Industries" component={FormikInput} />
                  <CustomerAutocompleteField
                    label="Phone Number"
                    value={values.phone}
                    onPhoneChange={(phone) => setFieldValue("phone", phone)}
                    onSelectCustomer={(customer) => {
                      setFieldValue("phone", customer.phone);
                      setFieldValue("customerName", customer.name);
                      if (customer.address) setFieldValue("address", customer.address);
                      if (customer.city) setFieldValue("city", customer.city);
                    }}
                    error={touched.phone ? errors.phone : undefined}
                  />
                  <Field name="city" label="City (optional)" placeholder="e.g. Ahmedabad" component={FormikInput} />
                  <div className="sm:col-span-2">
                    <Field name="address" label="Address (optional)" placeholder="Optional address" multiline component={FormikInput} />
                  </div>

                  <ProductAutocompleteField
                    label="Product"
                    value={values.productId as number}
                    initialLabel={lead?.product?.name}
                    onChange={(productId) => setFieldValue("productId", productId)}
                    error={touched.productId ? errors.productId : undefined}
                  />
                  <Field name="quantity" label="Quantity" type="number" placeholder="e.g. 5" component={FormikInput} />
                </div>

                <FollowUpFields index={1} />

                {showFollowUp2 ? (
                  <FollowUpFields index={2} />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFieldValue("followUp2Date", getTodayISODate());
                      setShowFollowUp2(true);
                    }}
                    className="self-start text-xs font-semibold text-blue-600 hover:text-blue-700"
                  >
                    + Follow-up 2
                  </button>
                )}

                {showFollowUp2 &&
                  (showFollowUp3 ? (
                    <FollowUpFields index={3} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setFieldValue("followUp3Date", getTodayISODate());
                        setShowFollowUp3(true);
                      }}
                      className="self-start text-xs font-semibold text-blue-600 hover:text-blue-700"
                    >
                      + Follow-up 3
                    </button>
                  ))}
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="rounded-lg bg-[#3d6fe0] px-4 py-2 text-xs font-bold text-white hover:bg-[#3560c4] disabled:opacity-50"
                >
                  {saveMutation.isPending ? "Saving..." : isEdit ? "Update Lead" : "Add Lead"}
                </button>
              </div>
            </Form>
          )}
        </Formik>
      </div>
    </div>
  );
};

export default LeadFormModal;
