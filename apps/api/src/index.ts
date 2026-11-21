/**
 * API entry point. Connects as `app_runtime` (never the migrator, never a superuser) and
 * needs nothing else: migrations, checks and seeds are separate, deliberate steps.
 */
import { Pool } from "pg";
import { createPgDb } from "../../../packages/data/src/db.ts";
import {
  developmentSecretsKey,
  isDevelopmentKey,
  parseSecretsKey,
} from "../../../packages/domain/src/auth/secret-box.ts";
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
// When set, the API also serves the built owner portal from this directory.
const webRoot = process.env.MBS_WEB_ROOT;

// Seals owners' TOTP secrets. A missing key falls back to the documented development key,
// which is refused in production: losing that key would lock every owner out, and using a
// shared one would make the sealing pointless.
const configured = process.env.MBS_MFA_KEY;
const parsedKey = parseSecretsKey(configured);
if (configured && !parsedKey) {
  console.error("MBS_MFA_KEY must be base64 of exactly 32 bytes");
  process.exit(1);
}
const mfaKey = parsedKey ?? developmentSecretsKey();
if (isDevelopmentKey(mfaKey) && process.env.NODE_ENV === "production") {
  console.error("MBS_MFA_KEY is required in production (it seals TOTP secrets)");
  process.exit(1);
}

const pool = new Pool({ connectionString: databaseUrl, max: poolMax });
const server = createApiServer({ db: createPgDb(pool), secureCookies, webRoot, mfaKey });

server.listen(port, "0.0.0.0", () => {
  console.log(
    `mbs api listening on :${port} (pool ${poolMax}, secure cookies ${secureCookies}, portal ${
      webRoot ?? "not served"
    }, mfa key ${isDevelopmentKey(mfaKey) ? "DEVELOPMENT" : "configured"})`
  );
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
