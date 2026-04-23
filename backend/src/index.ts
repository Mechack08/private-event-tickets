import { createServer } from "node:http";
import { config } from "./config.js";
import { createApp } from "./app.js";
import { createSocketServer } from "./socket.js";
import { createTicketsRouter } from "./routes/tickets.js";
import { prisma } from "./lib/prisma.js";

async function main() {
  // Verify database connectivity before binding to a port
  await prisma.$connect();
  console.log("[db] connected");

  const { app, sessionMiddleware } = createApp();
  const httpServer = createServer(app);

  // Create Socket.io server (shares the HTTP server with Express)
  const io = createSocketServer(httpServer, sessionMiddleware, config.CORS_ORIGINS);

  // Mount the tickets router now that we have the io reference
  app.use("/tickets", createTicketsRouter(io));

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
