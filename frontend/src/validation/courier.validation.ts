import { z } from "zod";

const customerNameField = z
  .string()
  .min(1, "Customer name is required")
  .max(150, "Customer name must be under 150 characters");

const optionalMobileField = z
  .union([z.string().regex(/^\+?[0-9\s-]{7,15}$/, "Please enter a valid mobile number"), z.literal("")])
  .optional();

const optionalChargeField = z
  .union([z.string().regex(/^\d+(\.\d{1,2})?$/, "Please enter a valid amount"), z.literal("")])
  .optional();

// Formik coerces <input type="number"> values to a JS number, so this must accept a stray
// number (not just a string) before checking the decimal-places pattern — otherwise Zod's
// union collapses to a generic "Invalid input" instead of the message below.
const optionalWeightField = z
  .preprocess((val) => (typeof val === "number" ? String(val) : val), z.string().optional())
  .refine((val) => !val || /^\d+(\.\d{1,3})?$/.test(val), { message: "Please enter a valid weight" });

const optionalQuantityField = z
  .union([z.string().regex(/^\d+$/, "Please enter a whole number"), z.literal("")])
  .optional();

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
});

export type CourierEditFormValues = z.infer<typeof courierEditSchema>;

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
