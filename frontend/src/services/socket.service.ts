import { io, Socket } from "socket.io-client";

const BACKEND_URL = import.meta.env.VITE_APP_BASE_URL ?? "http://localhost:3000";

let socket: Socket | null = null;

/**
 * Initialize and return the singleton socket connection.
 * Call once on app mount. Pass a module name so the server places
 * this client in the correct Socket.io room for targeted notifications,
 * and/or a userId to also join that user's personal notification room.
 *
 * @param moduleName - "couriers" | "account" | "all" (optional, defaults to "all")
 * @param userId - logged-in user's id (optional) — joins room "user-{id}"
 */
export const initSocket = (moduleName?: string, userId?: number | string | null): Socket => {
  const desiredRooms = [moduleName, userId ? `user-${userId}` : undefined, "all"].filter(
    (room): room is string => !!room
  );
  const joinRooms = () => desiredRooms.forEach((room) => socket!.emit("join_module", room));

  if (socket) {
    // Re-joining on an already-connected socket used to silently no-op, so a later
    // caller's rooms (e.g. a per-user room) could never actually get joined.
    if (socket.connected) {
      joinRooms();
    } else {
      socket.once("connect", joinRooms);
    }
    return socket;
  }

  socket = io(BACKEND_URL, {
    transports: ["websocket"],
    autoConnect: true,
  });

  socket.on("connect", joinRooms);

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
