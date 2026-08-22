import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { NotificationData } from "../../services/notification.service";

interface NotificationState {
  items: NotificationData[];
  unreadCount: number;
}

const initialState: NotificationState = {
  items: [],
  unreadCount: 0,
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    /** Load all notifications from the API */
    setNotifications: (
      state,
      action: PayloadAction<{ items: NotificationData[]; unreadCount: number }>
    ) => {
      state.items = action.payload.items;
      state.unreadCount = action.payload.unreadCount;
    },

    /** Prepend a new real-time notification (from WebSocket) */
    addNotification: (state, action: PayloadAction<NotificationData>) => {
      state.items = [action.payload, ...state.items];
      if (!action.payload.isRead) {
        state.unreadCount += 1;
      }
    },

    /** Mark a single notification as read */
    markAsRead: (state, action: PayloadAction<number>) => {
      const notif = state.items.find((n) => n.id === action.payload);
      if (notif && !notif.isRead) {
        notif.isRead = true;
        state.unreadCount = Math.max(0, state.unreadCount - 1);
      }
    },

    /** Mark all notifications as read */
    markAllAsRead: (state) => {
      state.items.forEach((n) => {
        n.isRead = true;
      });
      state.unreadCount = 0;
    },
  },
});

export const { setNotifications, addNotification, markAsRead, markAllAsRead } =
  notificationSlice.actions;

export default notificationSlice.reducer;
