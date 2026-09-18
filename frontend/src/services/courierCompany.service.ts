import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export interface CourierCompanyData {
    id?: number;
    name: string;
    /** URL containing a "{trackId}" placeholder, e.g.
     *  "https://www.delhivery.com/track/package/{trackId}" — substitute a courier record's
     *  trackId into this to build a clickable tracking link. */
    trackingLinkTemplate?: string | null;
    isActive?: boolean;
    createdAt?: string;
    updatedAt?: string;
}

/** Substitutes {trackId} into a company's tracking link template. Returns null if either the
 *  template or the trackId is missing. */
export const buildTrackingLink = (template: string | null | undefined, trackId: string | null | undefined): string | null => {
    if (!template || !trackId) return null;
    return template.replace("{trackId}", encodeURIComponent(trackId));
};

/** `meta` is only present in the response when `page`/`limit` are passed — every dropdown
 *  picker and tracking-link lookup across the Courier module calls this with neither, and keeps
 *  getting the full unpaginated list unchanged. Only the Courier Companies management table
 *  passes page/limit. */
const getCourierCompanies = (
    params?: { search?: string; page?: number; limit?: number },
    config?: { signal?: AbortSignal }
) =>
    httpService.get<{ success: boolean; data: CourierCompanyData[]; meta?: PaginationMeta }>("/couriers-companies", {
        params,
        signal: config?.signal,
    });

const createCourierCompany = (data: Partial<CourierCompanyData>) =>
    httpService.post<{ success: boolean; message: string; data: CourierCompanyData }>("/couriers-companies", data);

const updateCourierCompany = (id: number, data: Partial<CourierCompanyData>) =>
    httpService.put<{ success: boolean; message: string; data: CourierCompanyData }>(`/couriers-companies/${id}`, data);

const deleteCourierCompany = (id: number) =>
    httpService.delete<{ success: boolean; message: string }>(`/couriers-companies/${id}`);

export default {
    getCourierCompanies,
    createCourierCompany,
    updateCourierCompany,
    deleteCourierCompany,
};
