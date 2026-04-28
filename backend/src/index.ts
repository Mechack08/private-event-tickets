import { createServer } from "node:http";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./socket.js";
import { createTicketsRouter } from "./routes/tickets.js";
import { createRequestsRouter } from "./routes/requests.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  // Verify database connectivity before binding to a port
  await prisma.$connect();
  console.log("[db] connected");

  const { app, sessionMiddleware } = createApp();
  const httpServer = createServer(app);

  // Create Socket.io server (shares the HTTP server with Express)
  const io = createSocketServer(httpServer, sessionMiddleware, config.CORS_ORIGINS);

  // Mount routers that need the io reference
  app.use("/tickets", createTicketsRouter(io));
  app.use("/requests", createRequestsRouter(io));

  // 404 handler — must come after all routers
  app.use((_req: import("express").Request, res: import("express").Response) => {
    res.status(404).json({ error: "Not found" });
  });

  httpServer.listen(config.PORT, () => {
    console.log(
      `[server] listening on http://localhost:${config.PORT} (${config.NODE_ENV})`
    );
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  const shutdown = async (signal: string) => {
    console.log(`[server] received ${signal}, shutting down…`);
    await prisma.$disconnect();
    httpServer.close(() => {
      console.log("[server] closed");
      process.exit(0);
    });

    // Force-exit after 10 seconds if something hangs
    setTimeout(() => {
      console.error("[server] forced exit after timeout");
      process.exit(1);
    }, 10_000).unref();
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
