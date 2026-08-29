import httpService from "./http-service";

export interface NotificationData {
  id: number;
  recipientModule: "couriers" | "account" | "admin" | "all";
  recipientUserId?: number | null;
  type:
    | "NEW_SALE"
    | "NEW_CUSTOMER"
    | "STOCK_LOW"
    | "PAYMENT_RECEIVED"
    | "ORDER_FULFILLED"
    | "BACKORDER_ALLOCATED";
  title: string;
  message?: string;
  referenceType?: string;
  referenceId?: number;
  isRead: boolean;
  createdAt: string;
  updatedAt?: string;
}

const getNotifications = (module?: "couriers" | "account" | "all", limit?: number) =>
  httpService.get<{ success: boolean; data: NotificationData[]; unreadCount: number }>(
    "/notifications",
    { params: { module, limit } }
  );

const markRead = (id: number) =>
  httpService.patch<{ success: boolean; message: string }>(`/notifications/${id}/read`, {});

const markAllRead = (module?: "couriers" | "account") =>
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
