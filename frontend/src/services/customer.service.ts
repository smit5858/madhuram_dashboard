import httpService from "./http-service";

export interface CustomerData {
  id?: number;
  name: string;
  phone: string;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  pincode?: string | null;
  notes?: string | null;
  isActive?: boolean;
  createdBy?: number;
  creator?: {
    id: number;
    name: string;
    email: string;
  };
  sales?: Array<{
    id: number;
    invoiceNumber: string;
    sellingAmount: number;
    collectedAmount: number;
    pendingAmount: number;
    status: string;
    createdAt: string;
  }>;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateCustomerPayload {
  name: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  pincode?: string;
  notes?: string;
}

export interface CustomerFilters {
  search?: string;
  city?: string;
  phone?: string;
  name?: string;
  page?: number;
  limit?: number;
}

export interface CustomerResponse {
  success: boolean;
  data: CustomerData[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

const getCustomers = (filters: CustomerFilters = {}, config?: { signal?: AbortSignal }) =>
  httpService.get<CustomerResponse>("/customers", { params: filters, signal: config?.signal });

const getCustomerById = (id: number) =>
  httpService.get<{ success: boolean; data: CustomerData }>(`/customers/${id}`);

const getCustomerByPhone = (phone: string, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: CustomerData | null; message?: string }>(
    `/customers/phone/${encodeURIComponent(phone)}`,
    { signal: config?.signal }
  );

const createCustomer = (data: CreateCustomerPayload) =>
  httpService.post<{ success: boolean; message: string; data: CustomerData }>("/customers", data);

const updateCustomer = (id: number, data: Partial<CreateCustomerPayload & { isActive?: boolean }>) =>
  httpService.put<{ success: boolean; message: string; data: CustomerData }>(`/customers/${id}`, data);

const deleteCustomer = (id: number) =>
  httpService.delete<{ success: boolean; message: string }>(`/customers/${id}`);

export default {
  getCustomers,
  getCustomerById,
  getCustomerByPhone,
  createCustomer,
  updateCustomer,
  deleteCustomer,
};
