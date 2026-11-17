import { defineConfig } from "drizzle-kit";

// Only used to generate SQL migrations from the schema (`pnpm db:generate`).
// Applying them is done by the app itself (PGlite) or `pnpm db:migrate` (Postgres).
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
});
