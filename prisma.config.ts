import "dotenv/config";
import { defineConfig, env } from "prisma/config";

export default defineConfig({
  schema: "server/prisma/schema.prisma",
  migrations: {
    path: "server/prisma/migrations",
    seed: "node server/prisma/seed.js",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
