const { Notification } = require("../models");
const { getIO } = require("../socket");

// Fire-and-forget notification + socket emit. Wrapped so a failure here never
// affects an already-committed operation.
//
// Each event may target either:
//   - a module (evt.recipientModule: "couriers" | "account" | "admin" | "all") — broadcast
//   - a specific user (evt.recipientUserId set) — personal, room "user-{id}"
const notify = async (events) => {
  let created = [];
  try {
    created = await Promise.all(
      events.map((evt) =>
        Notification.create({
          recipientModule: evt.recipientModule,
          recipientUserId: evt.recipientUserId || null,
          type: evt.type,
          title: evt.title,
          message: evt.message,
          referenceType: evt.referenceType,
          referenceId: evt.referenceId,
        }).then((notif) => ({ evt, notif }))
      )
    );
  } catch (notifErr) {
    console.warn("Notification creation failed:", notifErr.message);
    return;
  }

  try {
    const io = getIO();
    for (const { evt, notif } of created) {
      const room = evt.recipientUserId ? `user-${evt.recipientUserId}` : evt.recipientModule;
      io.to(room).emit(evt.event, { notification: notif, ...evt.payload });
    }
  } catch (socketErr) {
    console.warn("WebSocket emit failed:", socketErr.message);
  }
};

module.exports = { notify };
