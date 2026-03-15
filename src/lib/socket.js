const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let ioInstance = null;

const asToken = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.startsWith("Bearer ") ? raw.slice(7).trim() : raw;
};

const toRoom = (userId = "") => `user:${String(userId || "").trim()}`;
const toTrackRoom = (orderCode = "") => `track:${String(orderCode || "").trim()}`;

const isValidOrderCode = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length > 64) return false;
  return /^[A-Za-z0-9-]+$/.test(text);
};

const initSocket = ({ server, corsOrigins = [], jwtSecret = "dev-secret" }) => {
  if (!server) {
    throw new Error("Socket init requires an HTTP server instance");
  }

  ioInstance = new Server(server, {
    cors: {
      origin(origin, callback) {
        if (!origin || corsOrigins.includes(origin)) {
          return callback(null, true);
        }

        if (process.env.NODE_ENV !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)) {
          return callback(null, true);
        }

        return callback(null, false);
      },
      credentials: true,
    },
  });

  ioInstance.use((socket, next) => {
    try {
      const token = asToken(socket?.handshake?.auth?.token || socket?.handshake?.query?.token || "");
      if (!token) {
        socket.userId = null;
        return next();
      }

      const payload = jwt.verify(token, jwtSecret);
      if (!payload?.userId) {
        socket.userId = null;
        return next();
      }

      socket.userId = String(payload.userId);
      return next();
    } catch (_) {
      socket.userId = null;
      return next();
    }
  });

  ioInstance.on("connection", (socket) => {
    if (socket.userId) {
      const userRoom = toRoom(socket.userId);
      socket.join(userRoom);
    }

    socket.on("chat:join", (conversationId = "") => {
      if (!socket.userId) return;
      const room = String(conversationId || "").trim();
      if (!room) return;
      socket.join(room);
    });

    socket.on("chat:leave", (conversationId = "") => {
      if (!socket.userId) return;
      const room = String(conversationId || "").trim();
      if (!room) return;
      socket.leave(room);
    });

    socket.on("track:join", (orderCode = "") => {
      if (!isValidOrderCode(orderCode)) return;
      socket.join(toTrackRoom(orderCode));
    });

    socket.on("track:leave", (orderCode = "") => {
      if (!isValidOrderCode(orderCode)) return;
      socket.leave(toTrackRoom(orderCode));
    });
  });

  return ioInstance;
};

const getIO = () => ioInstance;

const emitToUsers = (userIds = [], event = "", payload = {}) => {
  if (!ioInstance || !event) return;
  const uniqueUserIds = Array.from(new Set(userIds.map((id) => String(id || "").trim()).filter(Boolean)));
  uniqueUserIds.forEach((id) => {
    ioInstance.to(toRoom(id)).emit(event, payload);
  });
};

const emitToTracking = (orderCode = "", event = "", payload = {}) => {
  if (!ioInstance || !event) return;
  if (!isValidOrderCode(orderCode)) return;
  ioInstance.to(toTrackRoom(orderCode)).emit(event, payload);
};

const isUserOnline = (userId = "") => {
  if (!ioInstance) return false;
  const room = ioInstance.sockets.adapter.rooms.get(toRoom(userId));
  return Boolean(room && room.size > 0);
};

module.exports = {
  initSocket,
  getIO,
  emitToUsers,
  emitToTracking,
  isUserOnline,
};
