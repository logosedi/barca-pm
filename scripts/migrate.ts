// Applies pending migrations to the Postgres pointed to by DATABASE_URL.
// The embedded development database does not need this: it migrates itself on start.
import { migratePostgres } from "../src/server/db/client";

migratePostgres()
  .then(() => console.log("Migrações aplicadas."))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
