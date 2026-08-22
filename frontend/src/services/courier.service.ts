import httpService from "./http-service";

export interface CourierData {
    id?: number;
    name: string;
    email?: string;
    phone?: string;
    userId?: number;
    User?: {
        id: number;
        name: string;
        email: string;
    };
    createdAt?: string;
    updatedAt?: string;
}

const getCouriers = () =>
    httpService.get<{ success: boolean; data: CourierData[] }>("/couriers");

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
