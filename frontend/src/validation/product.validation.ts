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
  purchasePrice: optionalAmountField,
  sellingPrice: optionalAmountField,
  purchaseDate: z.string().optional(),
});

// Create — SERIALIZED: product + optional starting batch of individually-priced units.
export const createSerializedSchema = z.object({
  name: nameField,
  description: descriptionField,
  units: z.array(serialUnitRowSchema).optional(),
});

export type CreateSerializedFormValues = z.infer<typeof createSerializedSchema>;

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
  units: z.array(serialUnitRowSchema).min(1, "Add at least one serial unit"),
});

export type ReceiveSerializedStockFormValues = z.infer<typeof receiveSerializedStockSchema>;
