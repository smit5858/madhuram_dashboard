export type CourierStatus = "PENDING" | "WAITING_FOR_STOCK" | "IN_PROGRESS" | "OUT_FOR_DELIVERY" | "DONE";
export type ShipmentType = "SHIP_COMPLETE" | "SHIP_AVAILABLE";

export const COURIER_STATUSES: CourierStatus[] = [
    "PENDING",
    "WAITING_FOR_STOCK",
    "IN_PROGRESS",
    "OUT_FOR_DELIVERY",
    "DONE",
];

export const STATUS_LABEL: Record<CourierStatus, string> = {
    PENDING: "Pending",
    WAITING_FOR_STOCK: "Waiting for Stock",
    IN_PROGRESS: "In Progress",
    OUT_FOR_DELIVERY: "Out for Delivery",
    DONE: "Done",
};

export const STATUS_BADGE_CLASS: Record<CourierStatus, string> = {
    PENDING: "bg-amber-50 text-amber-700 border border-amber-100",
    WAITING_FOR_STOCK: "bg-orange-50 text-orange-700 border border-orange-100",
    IN_PROGRESS: "bg-blue-50 text-blue-700 border border-blue-100",
    OUT_FOR_DELIVERY: "bg-indigo-50 text-indigo-700 border border-indigo-100",
    DONE: "bg-green-50 text-green-700 border border-green-100",
};

/** Waiting for Stock is system-managed (see updateCourier's WAITING_FOR_STOCK guard) — it's
 *  never one of the manually-selectable options in CourierStatusModal. */
export const STATUS_HELPER: Record<CourierStatus, string> = {
    PENDING: "Not yet picked up by the courier company.",
    WAITING_FOR_STOCK: "Waiting for the required product(s) to be back in stock — updates automatically.",
    IN_PROGRESS: "Parcel created, awaiting pickup/processing.",
    OUT_FOR_DELIVERY: "Tracking ID assigned, on its way to the customer.",
    DONE: "Delivered — the seller will be notified.",
};

export const SHIPMENT_TYPE_LABEL: Record<ShipmentType, string> = {
    SHIP_COMPLETE: "Ship Complete Order",
    SHIP_AVAILABLE: "Ship Available Products",
};

export const SHIPMENT_TYPE_HELPER: Record<ShipmentType, string> = {
    SHIP_COMPLETE: "Wait until every product in this order is available, then ship it all together.",
    SHIP_AVAILABLE: "Ship the in-stock products now; the rest becomes a separate Waiting for Stock entry.",
};
