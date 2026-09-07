export type DeliveryMode = "OFFICE_PICKUP" | "CHANGE" | "PENDING" | "FREE";

export const DELIVERY_MODES: DeliveryMode[] = ["OFFICE_PICKUP", "CHANGE", "PENDING", "FREE"];

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
    OFFICE_PICKUP: "Office Pickup",
    CHANGE: "Change",
    PENDING: "Pending",
    FREE: "Free",
};

export const DELIVERY_MODE_BADGE_CLASS: Record<DeliveryMode, string> = {
    OFFICE_PICKUP: "bg-purple-50 text-purple-700 border border-purple-100",
    CHANGE: "bg-orange-50 text-orange-700 border border-orange-100",
    PENDING: "bg-amber-50 text-amber-700 border border-amber-100",
    FREE: "bg-teal-50 text-teal-700 border border-teal-100",
};

export const DELIVERY_MODE_OPTIONS = DELIVERY_MODES.map((value) => ({
    value,
    label: DELIVERY_MODE_LABEL[value],
}));
