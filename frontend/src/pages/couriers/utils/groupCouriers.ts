import type { CourierData } from "../../../services/courier.service";

export interface CourierGroup {
    key: string;
    shipmentGroupId: string | null;
    saleId: number | null;
    /** True when at least one item in the group is still pending (mirrors the same "any
     *  outstanding work" rule the Pending/Completed split already used per-row). */
    pending: boolean;
    items: CourierData[];
}

/**
 * Groups Courier rows that were auto-created together for one sale into a single Courier
 * module entry. A multi-product sale creates one Courier record per line item (see
 * order.service.js#createOrder), but every line from the same physical parcel/shipment
 * decision shares one `shipmentGroupId` (courier.model.js) — the same key
 * shared/utils/courierShare.ts already uses to list "every product going out together". This
 * mirrors that existing relationship instead of introducing a new one, so a shipment that's
 * deliberately split (Ship Available Products) still renders as separate entries, matching
 * what's physically happening.
 *
 * Manually-created (non-sale) entries have no shipmentGroupId/saleId and always stay their own
 * single-item group.
 */
export const groupOutgoingCouriers = (couriers: CourierData[]): CourierGroup[] => {
    const groups = new Map<string, CourierGroup>();

    for (const courier of couriers) {
        const key = courier.shipmentGroupId
            ? `group-${courier.shipmentGroupId}`
            : courier.saleId
                ? `sale-${courier.saleId}`
                : `manual-${courier.id}`;

        const existing = groups.get(key);
        if (existing) {
            existing.items.push(courier);
            if (courier.pending) existing.pending = true;
        } else {
            groups.set(key, {
                key,
                shipmentGroupId: courier.shipmentGroupId || null,
                saleId: courier.saleId ?? null,
                pending: !!courier.pending,
                items: [courier],
            });
        }
    }

    for (const group of groups.values()) {
        group.items.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    }

    return [...groups.values()];
};

/** Returns the value shared by every item in the group, or `undefined` when they differ —
 *  callers show a "Mixed"/"—" placeholder in that case instead of an arbitrarily-picked value. */
export const commonCourierValue = <K extends keyof CourierData>(
    items: CourierData[],
    key: K
): CourierData[K] | undefined => {
    const normalized = items.map((item) => item[key] ?? null);
    const first = normalized[0];
    return normalized.every((value) => value === first) ? (first as CourierData[K]) : undefined;
};
