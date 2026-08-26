export type ProductType = "NON_SERIAL" | "SERIALIZED";

export const PRODUCT_TYPES: ProductType[] = ["NON_SERIAL", "SERIALIZED"];

export const PRODUCT_TYPE_OPTIONS: { value: ProductType; label: string }[] = [
  { value: "NON_SERIAL", label: "Non-Serialized" },
  { value: "SERIALIZED", label: "Serialized" },
];

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  NON_SERIAL: "Non-Serialized",
  SERIALIZED: "Serialized",
};
