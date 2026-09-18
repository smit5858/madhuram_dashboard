export type DeliveryMode = "OFFICE_PICKUP" | "COURIER";

export const DELIVERY_MODES: DeliveryMode[] = ["OFFICE_PICKUP", "COURIER"];

export const DELIVERY_MODE_LABEL: Record<DeliveryMode, string> = {
    OFFICE_PICKUP: "Office Pickup",
    COURIER: "Courier",
};

export const DELIVERY_MODE_BADGE_CLASS: Record<DeliveryMode, string> = {
    OFFICE_PICKUP: "bg-purple-50 text-purple-700 border border-purple-100",
    COURIER: "bg-teal-50 text-teal-700 border border-teal-100",
};

export const DELIVERY_MODE_OPTIONS = DELIVERY_MODES.map((value) => ({
    value,
    label: DELIVERY_MODE_LABEL[value],
}));
