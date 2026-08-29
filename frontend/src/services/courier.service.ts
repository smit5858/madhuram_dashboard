import httpService from "./http-service";
import type { CourierStatus, ShipmentType } from "../shared/constants/courierStatus";

export type { CourierStatus, ShipmentType };

export interface CourierData {
    id?: number;

    // Legacy fields
    name?: string;
    email?: string;
    phone?: string;

    // Required columns per spec
    customerName?: string;
    address?: string;
    city?: string;
    mobileNo?: string;
    productName?: string;
    charge?: number | string;
    freePickup?: boolean;
    courierName?: string;
    trackId?: string;
    kg?: number | string;
    /** @deprecated derived server-side from `status` (status !== "DONE") — read-only */
    pending?: boolean;
    status?: CourierStatus;
    pincode?: string;
    note?: string;
    /** Auto-stamped server-side the moment status reaches DONE — not manually editable. */
    completedDate?: string;
    /** Date the parcel was created/handed to the courier company (defaults to today). */
    entryDate?: string;
    /** Requested quantity for this order line — see linked SaleItem for how much is allocated/fulfilled. */
    quantity?: number | string | null;
    /** OUT = we ship to the customer (outbound). IN = customer/vendor ships to us (inbound). */
    direction?: "IN" | "OUT";

    userId?: number;
    saleId?: number | null;
    saleItemId?: number | null;
    /** Groups every courier row created together for one physical parcel/shipment decision. */
    shipmentGroupId?: string | null;
    shipmentType?: ShipmentType | null;

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

/** Fetch couriers — backend applies city scope automatically for non-Admin users. */
const getCouriers = (params?: { productName?: string; saleId?: number; direction?: "IN" | "OUT" }) =>
    httpService.get<{ success: boolean; data: CourierData[] }>("/couriers", { params });

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

export default {
    getCouriers,
    getCourierById,
    createCourier,
    updateCourier,
    updateShipmentType,
    deleteCourier,
};
