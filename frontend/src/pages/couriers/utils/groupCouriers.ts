import type { CourierData } from "../../../services/courier.service";

export interface CourierGroup {
    key: string;
    saleId: number | null;
    /** True when at least one item in the group is still pending (mirrors the same "any
     *  outstanding work" rule the Pending/Completed split already used per-row). */
    pending: boolean;
    items: CourierData[];
}

/**
 * Groups Courier rows that were auto-created together for one sale into a single Courier
 * module entry. A multi-product sale creates one Courier record per line item (see
 * order.service.js#createOrder), all sharing that sale's `saleId` — grouping on it (rather than
 * `shipmentGroupId`) means the entry stays a single row even after a "Ship Available Products"
 * split moves some of its rows onto a second shipmentGroupId (see updateShipmentType in
 * courier.controller.js): the shipment is still physically the same order, so the Courier
 * module keeps it as one entry with all of its products listed together, and its Status/Delete
 * actions (updateCourierBySale/deleteCourierBySale) apply to every row regardless of which
 * shipmentGroupId it currently sits in.
 *
 * Manually-created (non-sale) entries have no saleId and always stay their own single-item group.
 */
export const groupOutgoingCouriers = (couriers: CourierData[]): CourierGroup[] => {
    const groups = new Map<string, CourierGroup>();

    for (const courier of couriers) {
        const key = courier.saleId ? `sale-${courier.saleId}` : `manual-${courier.id}`;

        const existing = groups.get(key);
        if (existing) {
            existing.items.push(courier);
            if (courier.pending) existing.pending = true;
        } else {
            groups.set(key, {
                key,
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
