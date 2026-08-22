import httpService from "./http-service";

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
    pending?: boolean;
    note?: string;
    completedDate?: string;

    userId?: number;
    User?: {
        id: number;
        name: string;
        email: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

/** Fetch couriers — backend applies city scope automatically for non-Admin users. */
const getCouriers = (params?: { productName?: string }) =>
    httpService.get<{ success: boolean; data: CourierData[] }>("/couriers", { params });

const getCourierById = (id: number) =>
    httpService.get<{ success: boolean; data: CourierData }>(`/couriers/${id}`);

const createCourier = (data: Partial<CourierData>) =>
    httpService.post<{ success: boolean; message: string; data: CourierData }>("/couriers", data);

const updateCourier = (id: number, data: Partial<CourierData>) =>
    httpService.put<{ success: boolean; message: string; data: CourierData }>(`/couriers/${id}`, data);

const deleteCourier = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/couriers/${id}`);

export default {
    getCouriers,
    getCourierById,
    createCourier,
    updateCourier,
    deleteCourier,
};
