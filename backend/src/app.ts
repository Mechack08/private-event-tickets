import express from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import helmet from "helmet";
import cors from "cors";
import { config } from "./config.js";
import { globalLimiter } from "./middleware/rateLimiter.js";
import { errorHandler } from "./middleware/errorHandler.js";
import authRouter from "./routes/auth.js";
import eventsRouter from "./routes/events.js";

// Type alias used by socket.ts
export type SessionMiddleware = ReturnType<typeof session>;

// ── Session store ─────────────────────────────────────────────────────────────
const PgStore = connectPgSimple(session);

function buildSessionMiddleware(): SessionMiddleware {
  return session({
    name: config.SESSION_NAME,
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    rolling: true, // Extend TTL on every response
    store: new PgStore({
      conString: config.DATABASE_URL,
      tableName: "sessions",
      createTableIfMissing: true,
      ttl: config.SESSION_TTL_SECONDS,
      // Prune expired sessions every hour
      pruneSessionInterval: 3600,
    }),
    cookie: {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: config.NODE_ENV === "production" ? "strict" : "lax",
      maxAge: config.SESSION_TTL_SECONDS * 1000,
    },
  });
}

// ── App factory ───────────────────────────────────────────────────────────────
export function createApp() {
  const app = express();

  // Trust first proxy (needed for secure cookies behind nginx/Vercel etc.)
  if (config.NODE_ENV === "production") {
    app.set("trust proxy", 1);
  }

  // ── Security headers ──────────────────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: config.NODE_ENV === "production",
    })
  );

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
      methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "X-Requested-With"],
    })
  );

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "32kb" }));
  app.use(express.urlencoded({ extended: false, limit: "32kb" }));

  // ── Global rate limiter ───────────────────────────────────────────────────
  app.use(globalLimiter);

  // ── Session middleware ─────────────────────────────────────────────────────
  const sessionMiddleware = buildSessionMiddleware();
  app.use(sessionMiddleware);

  // ── CSRF: custom header check for mutating requests ───────────────────────
  // Any state-changing request must carry the X-Requested-With header.
  // This is a lightweight, token-less CSRF defence that works because
  // cross-origin forms/fetches cannot set custom headers without a preflight.
  app.use((req, res, next) => {
    const mutating = ["POST", "PATCH", "PUT", "DELETE"].includes(req.method);
    if (mutating && req.headers["x-requested-with"] !== "XMLHttpRequest") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });

  // ── Routes ────────────────────────────────────────────────────────────────
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", ts: new Date().toISOString() });
  });

  app.use("/auth", authRouter);
  app.use("/events", eventsRouter);
  // /tickets is mounted in index.ts after the Socket.io server is created

  // ── 404 handler ──────────────────────────────────────────────────────────
  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // ── Centralised error handler ─────────────────────────────────────────────
  app.use(errorHandler);

  return { app, sessionMiddleware };
}
