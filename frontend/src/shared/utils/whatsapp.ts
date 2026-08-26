/** Strips non-digits and prepends the Indian country code if missing. Returns null if no usable number. */
export const normalizePhoneForWhatsApp = (raw: string | null | undefined): string | null => {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return null;
    return digits.length >= 12 ? digits : `91${digits}`;
};

interface CourierMessageInfo {
    customerName?: string | null;
    productName?: string | null;
    quantity?: number | string | null;
    courierName?: string | null;
    trackId?: string | null;
}

const buildCourierWhatsAppMessage = (info: CourierMessageInfo): string => {
    const lines = [
        `Hi ${info.customerName || "there"},`,
        info.productName
            ? `your order for ${info.productName}${info.quantity ? ` (Qty: ${info.quantity})` : ""} has been shipped${info.courierName ? ` via ${info.courierName}` : ""}.`
            : undefined,
        info.trackId ? `Tracking ID: ${info.trackId}.` : undefined,
        "Track your parcel for updates.",
    ].filter(Boolean);
    return lines.join(" ");
};

/** Opens a WhatsApp chat with a pre-filled shipment/tracking message. Returns false if the phone number is unusable. */
export const openCourierWhatsApp = (phone: string | null | undefined, info: CourierMessageInfo): boolean => {
    const normalized = normalizePhoneForWhatsApp(phone);
    if (!normalized) return false;
    const url = `https://wa.me/${normalized}?text=${encodeURIComponent(buildCourierWhatsAppMessage(info))}`;
    window.open(url, "_blank", "noopener,noreferrer");
    return true;
};
