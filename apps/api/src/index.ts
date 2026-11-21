/**
 * API entry point. Connects as `app_runtime` (never the migrator, never a superuser) and
 * needs nothing else: migrations, checks and seeds are separate, deliberate steps.
 */
import { Pool } from "pg";
import { createPgDb } from "../../../packages/data/src/db.ts";
import { createApiServer } from "./http.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

const port = Number(process.env.PORT ?? 4000);
const poolMax = Number(process.env.DB_POOL_MAX ?? 10);
// Cookies are Secure unless the operator explicitly runs plain HTTP on localhost.
const secureCookies = process.env.MBS_INSECURE_COOKIES !== "true";

const pool = new Pool({ connectionString: databaseUrl, max: poolMax });
const server = createApiServer({ db: createPgDb(pool), secureCookies });

server.listen(port, "0.0.0.0", () => {
  console.log(`mbs api listening on :${port} (pool ${poolMax}, secure cookies ${secureCookies})`);
});

async function shutdown(signal: string) {
  console.log(`${signal} received, draining`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
