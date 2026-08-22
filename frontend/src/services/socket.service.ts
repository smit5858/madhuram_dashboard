import { io, Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_APP_BASE_URL ?? "http://localhost:3000";

let socket: Socket | null = null;

/**
 * Initialize and return the singleton socket connection.
 * Call once on app mount. Pass a module name so the server places
 * this client in the correct Socket.io room for targeted notifications.
 *
 * @param moduleName - "couriers" | "account" | "all" (optional, defaults to "all")
 */
export const initSocket = (moduleName?: string): Socket => {
  if (socket && socket.connected) return socket;

  socket = io(BACKEND_URL, {
    transports: ["websocket"],
    autoConnect: true,
  });

  socket.on("connect", () => {
    // Join the module room so we only receive relevant notifications
    if (moduleName) {
      socket!.emit("join_module", moduleName);
    }
    // Always join the "all" room to receive broadcasts
    socket!.emit("join_module", "all");
  });

  socket.on("disconnect", () => {
    console.info("[socket] disconnected");
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connection error:", err.message);
  });

  return socket;
};

/**
 * Get the existing socket instance. Returns null if not initialized.
 */
export const getSocket = (): Socket | null => socket;

/**
 * Disconnect and clean up the socket.
 */
export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export default { initSocket, getSocket, disconnectSocket };
