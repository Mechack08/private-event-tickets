import { z } from "zod";
import { config as dotenvConfig } from "dotenv";
import { resolve } from "path";

// Load .env from the backend package directory.
// __dirname is available in CJS (tsx compiles to CJS at runtime).
dotenvConfig({ path: resolve(__dirname, "..", ".env") });

// Fail fast: if any required variable is missing or wrong, the process exits
// before binding a port — preventing a misconfigured server from running silently.

const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  PORT: z.coerce.number().int().min(1).max(65535).default(4000),

  DATABASE_URL: z
    .string()
    .url()
    .refine((u) => u.startsWith("postgresql://") || u.startsWith("postgres://"), {
      message: "DATABASE_URL must be a PostgreSQL connection string",
    }),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),

  SESSION_NAME: z.string().default("pet.sid"),

  // Session TTL in seconds (default: 7 days)
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),

  // Comma-separated list of allowed CORS origins
  // e.g. "http://localhost:3000,https://myapp.vercel.app"
  CORS_ORIGINS: z
    .string()
    .default("http://localhost:3000")
    .transform((val) => val.split(",").map((s) => s.trim())),
});

function loadConfig() {
  const result = schema.safeParse(process.env);

  if (!result.success) {
    console.error("❌  Invalid environment configuration:");
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
