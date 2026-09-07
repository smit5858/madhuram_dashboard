export type ProductStockStatus = "IN_STOCK" | "OUT_OF_STOCK";

export const STOCK_STATUS_LABEL: Record<ProductStockStatus, string> = {
    IN_STOCK: "In Stock",
    OUT_OF_STOCK: "Out of Stock",
};

export const STOCK_STATUS_BADGE_CLASS: Record<ProductStockStatus, string> = {
    IN_STOCK: "bg-green-50 text-green-700 border border-green-100",
    OUT_OF_STOCK: "bg-amber-50 text-amber-700 border border-amber-100",
};
