import httpService from "./http-service";
import type { PaginationMeta } from "./courier.service";

export type LeadStatus = "PENDING" | "PROGRESS" | "COMPLETED" | "INCOMPLETED" | "NOT_INTERESTED";
export type LeadApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";
export type FollowUpStatus = "PENDING" | "DONE";

export interface LeadRefData {
  id: number;
  name: string;
}

export interface LeadData {
  id?: number;
  platformId: number | string;
  platform?: LeadRefData | null;
  customerName: string;
  companyName?: string | null;
  phone: string;
  address?: string | null;
  city?: string | null;
  /** Omitted for the "Other" option in the product field (a general enquiry with no specific
   *  product/software). Backend never auto-creates a Sell for these leads, even when status is
   *  set to Complete — see lead.controller.js#ensureSaleForLead. */
  productId?: number | string;
  product?: LeadRefData | null;
  quantity: number | string;

  followUp1Date: string;
  followUp1Time?: string | null;
  followUp1Notes?: string | null;
  followUp1Status?: FollowUpStatus;

  followUp2Date?: string | null;
  followUp2Time?: string | null;
  followUp2Notes?: string | null;
  followUp2Status?: FollowUpStatus;

  followUp3Date?: string | null;
  followUp3Time?: string | null;
  followUp3Notes?: string | null;
  followUp3Status?: FollowUpStatus;

  status?: LeadStatus;

  approvalStatus?: LeadApprovalStatus;
  approvedBy?: number | null;
  approvedAt?: string | null;
  rejectionReason?: string | null;

  createdBy?: number;
  salesEmployee?: LeadRefData | null;
  approver?: LeadRefData | null;
  /** The Sell auto-created once this lead's status is set to Complete (and approved) — see
   *  backend lead.controller.js#ensureSaleForLead. Null until then. */
  saleId?: number | null;
  sale?: {
    id: number;
    invoiceNumber?: string | null;
    status?: string;
    sellingAmount?: number;
    collectedAmount?: number;
    pendingAmount?: number;
  } | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface LeadFilters {
  search?: string;
  status?: LeadStatus | "";
  approvalStatus?: LeadApprovalStatus | "";
  platformId?: number | string;
  productId?: number | string;
  city?: string;
  salesEmployeeId?: number | string;
  followUpStartDate?: string;
  followUpEndDate?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}

export interface LeadStats {
  total: number;
  pending: number;
  progress: number;
  completed: number;
  incompleted: number;
  notInterested: number;
  todayFollowUps: number;
  upcomingFollowUps: number;
  overdueFollowUps: number;
}

const getLeads = (params?: LeadFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: LeadData[]; meta: PaginationMeta }>("/leads", {
    params,
    signal: config?.signal,
  });

const getLeadById = (id: number) => httpService.get<{ success: boolean; data: LeadData }>(`/leads/${id}`);

const createLead = (data: LeadData) => httpService.post<{ success: boolean; message: string; data: LeadData }>("/leads", data);

const updateLead = (id: number, data: LeadData) =>
  httpService.put<{ success: boolean; message: string; data: LeadData }>(`/leads/${id}`, data);

const deleteLead = (id: number) => httpService.delete<{ success: boolean; message: string }>(`/leads/${id}`);

const approveLead = (id: number) =>
  httpService.post<{ success: boolean; message: string; data: LeadData }>(`/leads/${id}/approve`, {});

const rejectLead = (id: number, rejectionReason: string) =>
  httpService.post<{ success: boolean; message: string; data: LeadData }>(`/leads/${id}/reject`, { rejectionReason });

const getLeadStats = (params?: LeadFilters, config?: { signal?: AbortSignal }) =>
  httpService.get<{ success: boolean; data: LeadStats }>("/leads/stats", { params, signal: config?.signal });

export default {
  getLeads,
  getLeadById,
  createLead,
  updateLead,
  deleteLead,
  approveLead,
  rejectLead,
  getLeadStats,
};
