import httpService from "./http-service";
import type { CourierStatus, ShipmentType } from "../shared/constants/courierStatus";
import type { DeliveryMode } from "../shared/constants/deliveryMode";
import type { ProductStockStatus } from "../shared/constants/productStockStatus";

export type { CourierStatus, ShipmentType, DeliveryMode, ProductStockStatus };

export interface CourierData {
    id?: number;

    // Legacy fields
    name?: string;
    email?: string;
    phone?: string;

    // Required columns per spec
    customerName?: string;
    address?: string | null;
    city?: string;
    mobileNo?: string;
    productName?: string | null;
    charge?: number | string | null;
    freePickup?: boolean;
    courierName?: string;
    trackId?: string | null;
    kg?: number | string | null;
    /** @deprecated derived server-side from `status` (status !== "DONE") — read-only */
    pending?: boolean;
    status?: CourierStatus;
    pincode?: string | null;
    note?: string | null;
    /** Why the customer sent this in (repair/replacement/inspection/service/other) — Incoming
     *  Courier records only; free text. */
    reason?: string | null;
    /** Auto-stamped server-side the moment status reaches DONE — not manually editable. */
    completedDate?: string;
    /** Date the parcel was created/handed to the courier company (defaults to today). */
    entryDate?: string;
    /** Requested quantity for this order line — see linked SaleItem for how much is allocated/fulfilled. */
    quantity?: number | string | null;
    /** OUT = we ship to the customer (outbound). IN = customer/vendor ships to us (inbound). */
    direction?: "IN" | "OUT";
    /** Independent classification of how this shipment is being handled — unset until chosen. */
    deliveryMode?: DeliveryMode | null;
    /** Snapshot of product availability at creation time — read-only, server-managed. Null for
     *  manually-created (non-sale) entries, which have no product/stock linkage to check. */
    productStockStatus?: ProductStockStatus | null;

    userId?: number;
    saleId?: number | null;
    saleItemId?: number | null;
    /** Groups every courier row created together for one physical parcel/shipment decision. */
    shipmentGroupId?: string | null;
    shipmentType?: ShipmentType | null;
    /** Set on an Incoming (IN) record once marked Done — points at the Outgoing (OUT) record
     *  auto-created for it. Read-only, server-managed. */
    linkedCourierId?: number | null;

    User?: {
        id: number;
        name: string;
        email: string;
    };
    SaleItem?: {
        id: number;
        quantity: number;
        allocatedQuantity: number;
        fulfilledQuantity: number;
        backorderedQuantity: number;
        fulfillmentStatus: string;
    };
    Sale?: {
        id: number;
        invoiceNumber: string;
        customerName: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

export interface CourierFilters {
    search?: string;
    startDate?: string;
    endDate?: string;
    deliveryMode?: string;
    /** "PENDING" | "DONE" | "ALL" (or any CourierStatus) — omit/ALL for no status filter. */
    status?: string;
    page?: number;
    limit?: number;
}

export interface PaginationMeta {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

export interface CourierChargeData {
    month: number;
    year: number;
    amount: number | string;
}

/** Fetch couriers — backend applies city scope automatically for non-Admin users.
 *  `meta` is only present in the response when `page`/`limit` are passed. Pass `{ signal }`
 *  (e.g. straight from react-query's queryFn context) so an in-flight request gets aborted the
 *  moment a newer search/filter supersedes it — otherwise a slow, now-stale response could still
 *  resolve and needlessly retrigger an update after a faster, newer one already rendered. */
const getCouriers = (
    params?: { productName?: string; saleId?: number; direction?: "IN" | "OUT" } & CourierFilters,
    config?: { signal?: AbortSignal }
) => httpService.get<{ success: boolean; data: CourierData[]; meta?: PaginationMeta }>("/couriers", { params, signal: config?.signal });

export interface CourierTotalsData {
    totalDeliveries: number;
    pendingDeliveries: number;
    deliveredCount: number;
    cancelledCount: number;
    todayCount: number;
}

/** Courier dashboard KPIs — Outgoing-only, same city/ownership scope as getCouriers. */
const getCourierTotals = (config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: CourierTotalsData }>("/couriers/totals", { signal: config?.signal });

export interface CourierDailyTrendRow {
    date: string;
    shipments: number;
}

const getCourierDailyTrend = (params: { startDate?: string; endDate?: string }, config?: { signal?: AbortSignal }) =>
    httpService.get<{ success: boolean; data: CourierDailyTrendRow[] }>("/couriers/daily-trend", {
        params,
        signal: config?.signal,
    });

/** Exports the exact same filtered dataset the list would show. Omit all filters to default
 *  to the current calendar month server-side. */
const exportCouriers = (format: "pdf" | "excel", filters?: CourierFilters & { direction?: "IN" | "OUT" }) =>
    httpService.get(`/couriers/export`, { params: { ...filters, format }, responseType: "blob" });

const getCourierById = (id: number) =>
    httpService.get<{ success: boolean; data: CourierData }>(`/couriers/${id}`);

const createCourier = (data: Partial<CourierData>) =>
    httpService.post<{ success: boolean; message: string; data: CourierData }>("/couriers", data);

const updateCourier = (id: number, data: Partial<CourierData> & { serialNumbers?: string[] }) =>
    httpService.put<{ success: boolean; message: string; data: CourierData }>(`/couriers/${id}`, data);

/** Ship Complete Order vs Ship Available Products — acts on the whole shipment group. */
const updateShipmentType = (id: number, shipmentType: ShipmentType) =>
    httpService.put<{ success: boolean; message: string; data: CourierData[] }>(`/couriers/${id}/shipment-type`, { shipmentType });

const deleteCourier = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/couriers/${id}`);

/** Marks an Incoming courier record Done — server-side transaction also creates the mirrored
 *  Outgoing Courier record and an Accounts (Expense) entry, and notifies Admin + the owning
 *  courier user. Safe to call again after success (server rejects an already-Done record). */
const completeIncomingCourier = (id: number) =>
    httpService.put<{
        success: boolean;
        message: string;
        data: { courier: CourierData; outgoingCourier: CourierData; accountEntry: unknown };
    }>(`/couriers/${id}/done`, {});

/** Fetches the current calendar month's Courier Charge (amount is 0 if unset this month). */
const getCurrentCourierCharge = () =>
    httpService.get<{ success: boolean; data: CourierChargeData }>("/couriers/charge");

/** Creates/updates the current calendar month's Courier Charge — month/year are resolved
 *  server-side from today's date, never sent from the client. */
const setCurrentCourierCharge = (amount: number) =>
    httpService.put<{ success: boolean; message: string; data: CourierChargeData }>("/couriers/charge", { amount });

/** Resets the current calendar month's Courier Charge to ₹0. Backend restricts this to Admin
 *  or the Courier-role user "Vraj" specifically, independent of the generic update permission. */
const resetCourierCharge = () =>
    httpService.put<{ success: boolean; message: string; data: CourierChargeData }>("/couriers/charge/reset", {});

export default {
    getCouriers,
    getCourierTotals,
    getCourierDailyTrend,
    getCourierById,
    createCourier,
    updateCourier,
    updateShipmentType,
    deleteCourier,
    completeIncomingCourier,
    exportCouriers,
    getCurrentCourierCharge,
    setCurrentCourierCharge,
    resetCourierCharge,
};
