/**
 * socket.js
 *
 * Singleton wrapper around the Socket.io server instance.
 * Initialized once in server.js, then imported by controllers to emit events.
 *
 * Usage in controllers:
 *   const { getIO } = require('../socket');
 *   getIO().to('couriers').emit('new_sale', payload);
 */

let io;

const init = (httpServer) => {
  const { Server } = require("socket.io");
  io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"],
    },
  });

  io.on("connection", (socket) => {
    // Client sends { module: 'couriers' | 'account' | 'all' } on connect
    socket.on("join_module", (moduleName) => {
      if (moduleName) {
        socket.join(moduleName);
      }
    });

    socket.on("disconnect", () => {});
  });

  return io;
};

const getIO = () => {
  if (!io) {
    throw new Error("Socket.io not initialized. Call init(httpServer) first.");
  }
  return io;
};

module.exports = { init, getIO };
