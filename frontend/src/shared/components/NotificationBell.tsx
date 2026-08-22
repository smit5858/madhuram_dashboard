import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Bell, CheckCheck, Package, DollarSign, Truck } from "lucide-react";
import type { RootState } from "@/store/store";
import {
  addNotification,
  markAllAsRead,
  markAsRead,
  setNotifications,
} from "@/store/slices/notificationSlice";
import notificationService, {
  type NotificationData,
} from "@/services/notification.service";
import { initSocket } from "@/services/socket.service";

interface NotificationBellProps {
  moduleName?: "couriers" | "account" | "all";
}

const NotificationBell = ({ moduleName = "all" }: NotificationBellProps) => {
  const dispatch = useDispatch();
  const { items, unreadCount } = useSelector(
    (state: RootState) => state.notifications
  );
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch initial notifications
  useEffect(() => {
    notificationService
      .getNotifications(moduleName === "all" ? undefined : moduleName)
      .then((res: any) => {
        if (res.data?.success) {
          dispatch(
            setNotifications({
              items: res.data.data,
              unreadCount: res.data.unreadCount,
            })
          );
        }
      })
      .catch((err: any) => {
        console.error("Failed to fetch notifications:", err);
      });
  }, [dispatch, moduleName]);

  // Connect socket and listen for real-time notifications
  useEffect(() => {
    const socket = initSocket(moduleName);

    const handleNewSale = (payload: {
      notification: NotificationData;
      sale: any;
    }) => {
      if (payload?.notification) {
        dispatch(addNotification(payload.notification));
      }
    };

    socket.on("new_sale", handleNewSale);

    return () => {
      socket.off("new_sale", handleNewSale);
    };
  }, [dispatch, moduleName]);

  // Click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id: number) => {
    try {
      await notificationService.markRead(id);
      dispatch(markAsRead(id));
    } catch (err: any) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead(
        moduleName === "all" ? undefined : moduleName
      );
      dispatch(markAllAsRead());
    } catch (err: any) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const getNotificationIcon = (type: string, recipientModule: string) => {
    if (recipientModule === "couriers") {
      return <Truck className="h-4 w-4 text-blue-500" />;
    }
    if (recipientModule === "account") {
      return <DollarSign className="h-4 w-4 text-emerald-500" />;
    }
    if (type === "STOCK_LOW") {
      return <Package className="h-4 w-4 text-amber-500" />;
    }
    return <Bell className="h-4 w-4 text-indigo-500" />;
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition focus:outline-none"
        title="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white shadow-sm ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 z-50 overflow-hidden border border-slate-100 animate-in fade-in zoom-in-95 duration-100">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 bg-slate-50/80">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-800 text-sm">
                Notifications
              </span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
            {items.length === 0 ? (
              <div className="p-8 text-center text-slate-400">
                <Bell className="mx-auto h-8 w-8 text-slate-300 stroke-[1.5]" />
                <p className="mt-2 text-xs font-medium">No notifications yet</p>
              </div>
            ) : (
              items.map((n: NotificationData) => (
                <div
                  key={n.id}
                  onClick={() => !n.isRead && handleMarkAsRead(n.id)}
                  className={`flex gap-3 p-3.5 transition hover:bg-slate-50 cursor-pointer ${
                    !n.isRead ? "bg-blue-50/40" : "bg-white"
                  }`}
                >
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100">
                    {getNotificationIcon(n.type, n.recipientModule)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-semibold text-slate-800 truncate">
                        {n.title}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(n.createdAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    {n.message && (
                      <p className="mt-1 text-xs text-slate-600 line-clamp-3 whitespace-pre-line leading-relaxed">
                        {n.message}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 uppercase tracking-wide">
                        {n.recipientModule}
                      </span>
                      {!n.isRead && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
