import { z } from "zod";
import { PRODUCT_TYPES } from "@/shared/enum/product-type";

export const productFilterSchema = z.object({
  search: z.string().optional(),
  productType: z.string().optional(),
  status: z.string().optional(),
});

export type ProductFilterValues = z.infer<typeof productFilterSchema>;

const nameField = z
  .string()
  .min(1, "Product name is required")
  .max(150, "Product name must be under 150 characters");

const descriptionField = z.string().max(1000, "Description must be under 1000 characters").optional();

const productTypeField = z.enum(PRODUCT_TYPES as [string, ...string[]], {
  error: "Select a valid product type",
});

const amountField = z.coerce.number({ error: "Enter a valid amount" }).nonnegative("Amount cannot be negative");

const optionalAmountField = z.union([amountField, z.literal("")]).optional();

const quantityField = z.coerce
  .number({ error: "Enter a valid quantity" })
  .int("Quantity must be a whole number")
  .min(0, "Quantity cannot be negative");

const optionalQuantityField = z.union([quantityField, z.literal("")]).optional();

// Create — NON_SERIAL: product + its initial quantity-based inventory in one step.
export const createNonSerialSchema = z.object({
  name: nameField,
  description: descriptionField,
  quantity: quantityField,
  purchasePrice: optionalAmountField,
  sellingPrice: optionalAmountField,
});

export type CreateNonSerialFormValues = z.infer<typeof createNonSerialSchema>;

const serialUnitRowSchema = z.object({
  serialNumber: z.string().min(1, "Serial number is required"),
});

// Every unit in the same batch shares one purchase price/selling price — only the serial
// number differs — so uniqueness is checked across the batch rather than per row.
const uniqueSerialNumbers = (units: { serialNumber: string }[]) => {
  const trimmed = units.map((u) => u.serialNumber.trim().toLowerCase()).filter(Boolean);
  return new Set(trimmed).size === trimmed.length;
};

// Create — SERIALIZED: product + optional starting batch of units sharing one purchase/selling price.
// `quantity` drives how many serial-number fields render (see SerialUnitsInput) — each rendered
// row must have a non-blank, unique serial number before the batch can be saved.
export const createSerializedSchema = z.object({
  name: nameField,
  description: descriptionField,
  purchasePrice: optionalAmountField,
  sellingPrice: optionalAmountField,
  quantity: optionalQuantityField,
  units: z
    .array(serialUnitRowSchema)
    .optional()
    .refine((units) => !units || uniqueSerialNumbers(units), { message: "Serial numbers must be unique" }),
});

export type CreateSerializedFormValues = z.infer<typeof createSerializedSchema>;

// Create — SOFTWARE: no quantity/stock fields at all, just the selling price.
export const createSoftwareSchema = z.object({
  name: nameField,
  description: descriptionField,
  sellingPrice: optionalAmountField,
});

export type CreateSoftwareFormValues = z.infer<typeof createSoftwareSchema>;

// Create — HARDWARE_ORDER_BASED: same shape as NON_SERIAL minus quantity — this type always
// starts at 0 stock and is procured per order via the existing Receive Stock flow.
export const createHardwareOrderBasedSchema = z.object({
  name: nameField,
  description: descriptionField,
  purchasePrice: optionalAmountField,
  sellingPrice: optionalAmountField,
});

export type CreateHardwareOrderBasedFormValues = z.infer<typeof createHardwareOrderBasedSchema>;

// productType itself is validated separately (a plain required-select check) since it drives
// which of the two schemas above applies — it isn't a field either of them re-validates.
export const productTypeRequiredSchema = z.object({ productType: productTypeField });

// Edit — name/description/isActive apply to both types; sellingPrice only for NON_SERIAL
// (enforced by only rendering/submitting it when editing a NON_SERIAL product).
export const editProductSchema = z.object({
  name: nameField,
  description: descriptionField,
  isActive: z.boolean().optional(),
  sellingPrice: optionalAmountField,
  quantity: optionalQuantityField,
});

export type EditProductFormValues = z.infer<typeof editProductSchema>;

// Receive Stock — adds a new purchase batch to an existing product, mirroring how quantity/
// purchasePrice are seeded on creation. Quantity must be >= 1 here (unlike creation, where 0 is
// a valid "no initial stock yet" starting point).
const receiveQuantityField = z.coerce
  .number({ error: "Enter a valid quantity" })
  .int("Quantity must be a whole number")
  .min(1, "Quantity must be at least 1");

export const receiveNonSerialStockSchema = z.object({
  quantity: receiveQuantityField,
  purchasePrice: optionalAmountField,
  purchaseDate: z.string().optional(),
});

export type ReceiveNonSerialStockFormValues = z.infer<typeof receiveNonSerialStockSchema>;

export const receiveSerializedStockSchema = z.object({
  quantity: receiveQuantityField,
  purchasePrice: optionalAmountField,
  sellingPrice: optionalAmountField,
  units: z
    .array(serialUnitRowSchema)
    .min(1, "Add at least one serial unit")
    .refine(uniqueSerialNumbers, { message: "Serial numbers must be unique" }),
});

export type ReceiveSerializedStockFormValues = z.infer<typeof receiveSerializedStockSchema>;
