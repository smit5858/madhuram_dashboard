export type ProductType = "NON_SERIAL" | "SERIALIZED" | "SOFTWARE" | "HARDWARE_ORDER_BASED";

export const PRODUCT_TYPES: ProductType[] = ["NON_SERIAL", "SERIALIZED", "SOFTWARE", "HARDWARE_ORDER_BASED"];

// Types that are stock-tracked via a Stock row (quantity/reserved) rather than either
// SERIALIZED's per-unit rows or SOFTWARE's no-stock-at-all model. HARDWARE_ORDER_BASED is
// tracked identically to NON_SERIAL — it just always starts at 0 and is procured per order.
export const STOCK_TRACKED_PRODUCT_TYPES: ProductType[] = ["NON_SERIAL", "HARDWARE_ORDER_BASED"];

export const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: "NON_SERIAL", label: "Non-Serialized" },
  { value: "SERIALIZED", label: "Serialized" },
  { value: "SOFTWARE", label: "Software" },
  { value: "HARDWARE_ORDER_BASED", label: "Order-Based" },
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  NON_SERIAL: "Non-Serialized",
  SERIALIZED: "Serialized",
  SOFTWARE: "Software",
  HARDWARE_ORDER_BASED: "Order-Based",
};
