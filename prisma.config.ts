import "dotenv/config";
import { defineConfig, env } from "prisma/config";

// Runtime traffic may use a transaction pooler (for example Supabase :6543),
// while migrations require a session/direct connection that supports advisory locks.
function resolvePrismaCliUrl() {
  const directUrl = process.env.DIRECT_URL?.trim();
  if (directUrl) return directUrl;

  const runtimeUrl = env("DATABASE_URL");
  const parsed = new URL(runtimeUrl);
  if (parsed.port === "6543" && parsed.hostname.endsWith(".pooler.supabase.com")) {
    parsed.port = "5432";
    return parsed.toString();
  }
  return runtimeUrl;
}

const prismaCliUrl = resolvePrismaCliUrl();

export default defineConfig({
  schema: "server/prisma/schema.prisma",
  migrations: {
    path: "server/prisma/migrations",
    seed: "node server/prisma/seed.js",
  },
  datasource: {
    url: prismaCliUrl,
  },
});
