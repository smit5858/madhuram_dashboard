import { z } from "zod";

const customerNameField = z
  .string()
  .min(1, "Customer name is required")
  .max(150, "Customer name must be under 150 characters");

// Digits only, exactly 10 when provided — matching FormikPhoneInput's on-keystroke sanitization
// (strips non-digits, caps at 10), so what reaches the server can never disagree with what the
// user saw typed.
const optionalMobileField = z
  .union([z.string().regex(/^\d{10}$/, "Mobile number must be exactly 10 digits"), z.literal("")])
  .optional();

// Formik coerces <input type="number"> values to a JS number, so these must accept a stray
// number (not just a string) before checking their pattern — otherwise Zod's union collapses
// to a generic "Invalid input"/"Invalid number" instead of the message below.
const optionalChargeField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().optional())
  .refine((val) => !val || /^\d+(\.\d{1,2})?$/.test(val), { message: "Please enter a valid amount" });

const optionalWeightField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().optional())
  .refine((val) => !val || /^\d+(\.\d{1,3})?$/.test(val), { message: "Please enter a valid weight" });

const optionalQuantityField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().optional())
  .refine((val) => !val || /^\d+$/.test(val), { message: "Please enter a whole number" });

export const courierEditSchema = z.object({
  customerName: customerNameField,
  mobileNo: optionalMobileField,
  city: z.string().max(100, "City must be under 100 characters").optional(),
  pincode: z.string().max(12, "Pincode must be under 12 characters").optional(),
  charge: optionalChargeField,
  productName: z.string().max(150, "Product name must be under 150 characters").optional(),
  address: z.string().max(500, "Address must be under 500 characters").optional(),
  courierCompany: z.string().max(100, "Courier company must be under 100 characters").optional(),
  kg: optionalWeightField,
  quantity: optionalQuantityField,
  trackId: z.string().max(60, "Track ID must be under 60 characters").optional(),
  note: z.string().max(1000, "Note must be under 1000 characters").optional(),
  entryDate: z.string().optional(),
  deliveryMode: z.string().optional(),
});

export type CourierEditFormValues = z.infer<typeof courierEditSchema>;

// Dedicated Incoming Courier create/edit form — deliberately a smaller field set than
// courierEditSchema above: no charge/freePickup/kg/quantity/deliveryMode/serial numbers, none of
// which apply to a manually-logged "customer sent us a product" record (see
// IncomingCourierFormModal.tsx).
export const incomingCourierEditSchema = z.object({
  customerName: customerNameField,
  mobileNo: optionalMobileField,
  city: z.string().max(100, "City must be under 100 characters").optional(),
  pincode: z.string().max(12, "Pincode must be under 12 characters").optional(),
  productName: z.string().max(150, "Product name must be under 150 characters").optional(),
  address: z.string().max(500, "Address must be under 500 characters").optional(),
  courierCompany: z.string().max(100, "Courier company must be under 100 characters").optional(),
  trackId: z.string().max(60, "Track ID must be under 60 characters").optional(),
  reason: z.string().max(500, "Reason must be under 500 characters").optional(),
  note: z.string().max(1000, "Note must be under 1000 characters").optional(),
  entryDate: z.string().optional(),
});

export type IncomingCourierEditFormValues = z.infer<typeof incomingCourierEditSchema>;

export const courierFilterSchema = z.object({
  search: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  deliveryMode: z.string().optional(),
});

export type CourierFilterValues = z.infer<typeof courierFilterSchema>;

export const incomingCourierFilterSchema = z.object({
  search: z.string().max(150, "Search term is too long").optional(),
  status: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

export type IncomingCourierFilterValues = z.infer<typeof incomingCourierFilterSchema>;

/** Serial-number selection must match the remaining (not-yet-fulfilled) quantity for a
 *  serialized line item, with no duplicates — validated separately from the Formik schema
 *  above since it needs the product's serialization + remaining-quantity context. */
export const validateSerialNumbers = (serialNumbers: string[], requiredCount: number): string | null => {
  if (serialNumbers.length !== requiredCount) {
    return `Select exactly ${requiredCount} serial number${requiredCount === 1 ? "" : "s"} (currently ${serialNumbers.length})`;
  }
  if (new Set(serialNumbers).size !== serialNumbers.length) {
    return "Duplicate serial numbers selected";
  }
  return null;
};
