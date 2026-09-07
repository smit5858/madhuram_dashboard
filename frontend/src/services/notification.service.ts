import httpService from "./http-service";

export interface NotificationData {
  id: number;
  recipientModule: "couriers" | "account" | "admin" | "all" | "leads";
  recipientUserId?: number | null;
  type:
    | "NEW_SALE"
    | "NEW_CUSTOMER"
    | "STOCK_LOW"
    | "PAYMENT_RECEIVED"
    | "ORDER_FULFILLED"
    | "BACKORDER_ALLOCATED"
    | "INCOMING_COURIER_COMPLETED"
    | "EXPENSE_PENDING_APPROVAL"
    | "EXPENSE_APPROVED"
    | "EXPENSE_REJECTED"
    | "PENDING_BILL_PENDING_APPROVAL"
    | "PENDING_BILL_APPROVED"
    | "PENDING_BILL_PAYMENT_SUBMITTED"
    | "PENDING_BILL_PAYMENT_VERIFIED"
    | "PENDING_BILL_PAYMENT_REJECTED"
    | "PENDING_BILL_PARTIALLY_PAID"
    | "LEAD_APPROVAL_REQUIRED"
    | "LEAD_APPROVED"
    | "LEAD_REJECTED";
  title: string;
  message?: string;
  referenceType?: string;
  referenceId?: number;
  isRead: boolean;
  createdAt: string;
  updatedAt?: string;
}

const getNotifications = (module?: "couriers" | "account" | "admin" | "all", limit?: number) =>
  httpService.get<{ success: boolean; data: NotificationData[]; unreadCount: number }>(
    "/notifications",
    { params: { module, limit } }
  );

const markRead = (id: number) =>
  httpService.patch<{ success: boolean; message: string }>(`/notifications/${id}/read`, {});

const markAllRead = (module?: "couriers" | "account" | "admin") =>
  httpService.patch<{ success: boolean; message: string }>(
    "/notifications/read-all",
    {},
    { params: { module } }
  );

export default {
  getNotifications,
  markRead,
  markAllRead,
};
