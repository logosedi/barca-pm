import fs from "node:fs";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Two drivers, one Postgres dialect:
//  - DATABASE_URL set  -> node-postgres against a real Postgres (production).
//  - DATABASE_URL empty -> PGlite, Postgres compiled to WASM running in-process and
//    persisted under ./.data/pglite (zero-setup development).
// Both are exposed through the same Drizzle query builder, so no code branches on it.

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type Executor = Db | Tx;

const MIGRATIONS_DIR = path.join(process.cwd(), "drizzle");

const globalForDb = globalThis as unknown as { __barcaDb?: Promise<Db> };

export function getDb(): Promise<Db> {
  if (!globalForDb.__barcaDb) {
    globalForDb.__barcaDb = init().catch((error) => {
      globalForDb.__barcaDb = undefined;
      throw error;
    });
  }
  return globalForDb.__barcaDb;
}

/** Lets tests swap in an in-memory database. */
export function setDb(db: Db | undefined) {
  globalForDb.__barcaDb = db ? Promise.resolve(db) : undefined;
}

export function usingEmbeddedDb() {
  return !process.env.DATABASE_URL;
}

async function init(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    return drizzle(new Pool({ connectionString: url }), { schema });
  }
  const dataDir = process.env.PGLITE_DATA_DIR ?? path.join(process.cwd(), ".data", "pglite");
  fs.mkdirSync(dataDir, { recursive: true });
  acquireLock(dataDir);
  return createPgliteDb(dataDir);
}

/** `dataDir` undefined = in-memory database (tests). Migrations are always applied. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  return db as unknown as Db;
}

export async function migratePostgres() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definido: o banco embutido é migrado automaticamente ao iniciar.");
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const pool = new Pool({ connectionString: url });
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await pool.end();
  }
}

// PGlite is single-process. Two processes opening the same folder (say, `pnpm dev`
// and `pnpm db:seed`) would corrupt it, so the folder is guarded by a pid lock file.
function acquireLock(dataDir: string) {
  const lockFile = path.join(path.dirname(dataDir), "pglite.lock");
  if (fs.existsSync(lockFile)) {
    const pid = Number(fs.readFileSync(lockFile, "utf8"));
    if (pid && pid !== process.pid && isAlive(pid)) {
      throw new Error(
        `O banco embutido (${dataDir}) já está em uso pelo processo ${pid}, provavelmente o servidor do app. ` +
          "Pare esse processo antes de rodar outro comando, ou configure DATABASE_URL para usar Postgres.",
      );
    }
  }
  fs.writeFileSync(lockFile, String(process.pid));
  process.once("exit", () => {
    try {
      if (Number(fs.readFileSync(lockFile, "utf8")) === process.pid) fs.unlinkSync(lockFile);
    } catch {
      // The lock is best effort: a stale file is detected by the liveness check above.
    }
  });
}

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists but belongs to someone else.
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}
