import { Server as SocketIOServer } from "socket.io";
import type { Server as HttpServer } from "node:http";
import type { SessionMiddleware } from "./app.js";

// ── Types ────────────────────────────────────────────────────────────────────

export type SocketServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

interface ClientToServerEvents {
  /** Client asks to join/leave a per-event broadcast room */
  "event:join": (contractAddress: string) => void;
  "event:leave": (contractAddress: string) => void;
}

interface ServerToClientEvents {
  /** Emitted when a new ticket commitment is registered */
  "ticket:issued": (payload: {
    ticketId: string;
    eventId: string;
    commitment: string;
    issuedAt: Date;
  }) => void;
  /** Emitted when a ticket is verified on-chain */
  "ticket:verified": (payload: {
    ticketId: string;
    eventId: string;
    commitment: string;
    verifiedAt: Date | null;
  }) => void;
  /** Emitted when event metadata is updated */
  "event:created": (payload: { eventId: string }) => void;
  /** Emitted when a new ticket request is submitted */
  "request:new": (payload: {
    requestId: string;
    eventId: string;
    contractAddress: string;
    requesterName: string;
    note: string;
    requestedAt: string;
  }) => void;
  /** Emitted when a ticket request is approved or rejected */
  "request:updated": (payload: {
    requestId: string;
    eventId: string;
    contractAddress: string;
    status: "PENDING" | "APPROVED" | "REJECTED";
    processedAt: string;
  }) => void;
  /** Generic error acknowledgment */
  error: (message: string) => void;
}

interface SocketData {
  userId: string;
  email: string;
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createSocketServer(
  httpServer: HttpServer,
  sessionMiddleware: SessionMiddleware,
  corsOrigins: string[]
): SocketServer {
  const io: SocketServer = new SocketIOServer(httpServer, {
    cors: {
      origin: corsOrigins,
      credentials: true,
    },
    // Disable HTTP long-polling fallback for tighter security; WebSocket only.
    transports: ["websocket"],
  });

  // ── Session authentication ─────────────────────────────────────────────────
  // Share the express-session middleware with Socket.io so the session cookie
  // is parsed and req.session is populated on every WS handshake.
  io.engine.use(sessionMiddleware);

  io.use((socket, next) => {
    // socket.request is the HTTP upgrade request, which now has session attached
    // after io.engine.use(sessionMiddleware). Cast through unknown for the type merge.
    const req = socket.request as unknown as import("express").Request;
    const sess = req.session;

    if (!sess?.userId) {
      next(new Error("Unauthorized"));
      return;
    }

    socket.data.userId = sess.userId;
    socket.data.email  = sess.email ?? "";
    next();
  });

  // ── Connection handler ─────────────────────────────────────────────────────
  io.on("connection", (socket) => {
    console.log(
      `[socket] connected userId=${socket.data.userId} socketId=${socket.id}`
    );

    socket.on("event:join", (contractAddress: string) => {
      // Sanitise: contract addresses should be alphanumeric/underscore only
      if (!/^[a-zA-Z0-9_:-]{5,200}$/.test(contractAddress)) {
        socket.emit("error", "Invalid contract address.");
        return;
      }
      const room = `event:${contractAddress}`;
      void socket.join(room);
      console.log(`[socket] ${socket.id} joined room ${room}`);
    });

    socket.on("event:leave", (contractAddress: string) => {
      const room = `event:${contractAddress}`;
      void socket.leave(room);
      console.log(`[socket] ${socket.id} left room ${room}`);
    });

    socket.on("disconnect", (reason) => {
      console.log(`[socket] disconnected socketId=${socket.id} reason=${reason}`);
    });
  });

  return io;
}
