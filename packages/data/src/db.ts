/**
 * The database port (ADR-0002).
 *
 * Everything above this file talks to `Db`/`Tx`, so the same service code runs against a
 * real PostgreSQL pool in production and an in-process PGlite engine in tests. There is no
 * ORM in the request path yet: the queries that matter for tenancy are written out so the
 * tenant context is visible at the call site.
 *
 * Two rules this file exists to enforce:
 *   - tenant context is transaction-local (`set_config(..., true)`), never session-level;
 *   - the runtime role is `app_runtime`, which owns nothing and cannot bypass RLS.
 */
export interface QueryResult<T> {
  rows: T[];
}

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<QueryResult<T>>;
  /** Multi-statement DDL/DML with no parameters (migrations). */
  exec(sql: string): Promise<void>;
}

export interface Db extends Tx {
  transaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T>;
}

/** The slice of PGlite this port needs. Declared structurally so no runtime import. */
export interface PgliteLike {
  query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
  transaction<T>(fn: (tx: PgliteLike) => Promise<T>): Promise<T>;
}

/** The slice of `pg.Pool` this port needs. */
export interface PgPoolLike {
  connect(): Promise<{
    query<T>(sql: string, params?: readonly unknown[]): Promise<{ rows: T[] }>;
    release(): void;
  }>;
}

export function createPgliteDb(pglite: PgliteLike): Db {
  return {
    query: (sql, params) => pglite.query(sql, params),
    exec: async (sql) => {
      await pglite.exec(sql);
    },
    transaction: (fn) =>
      pglite.transaction((tx) =>
        fn({
          query: (sql, params) => tx.query(sql, params),
          exec: async (sql) => {
            await tx.exec(sql);
          },
        })
      ),
  };
}

export function createPgDb(pool: PgPoolLike): Db {
  const run = async <T>(fn: (client: Awaited<ReturnType<PgPoolLike["connect"]>>) => Promise<T>) => {
    const client = await pool.connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  };

  return {
    query: (sql, params) => run((client) => client.query(sql, params)),
    exec: (sql) => run(async (client) => void (await client.query(sql))),
    transaction: (fn) =>
      run(async (client) => {
        await client.query("begin");
        try {
          const result = await fn({
            query: (sql, params) => client.query(sql, params),
            exec: async (sql) => void (await client.query(sql)),
          });
          await client.query("commit");
          return result;
        } catch (error) {
          await client.query("rollback");
          throw error;
        }
      }),
  };
}

/**
 * Run `fn` inside a transaction with the tenant context set for that transaction only.
 * `role` is switched to the unprivileged runtime role so a migration/admin connection
 * cannot accidentally satisfy a query through ownership.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Tx) => Promise<T>,
  options: { role?: string | null } = {}
): Promise<T> {
  const role = options.role === undefined ? "app_runtime" : options.role;
  return db.transaction(async (tx) => {
    if (role) await tx.query(`set local role ${role}`);
    await tx.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    return fn(tx);
  });
}

/**
 * Set one of the two pre-authentication capability values for a single transaction:
 * `app.session_token_hash` (session resolution) or `app.user_id` (business picker).
 * The names are allow-listed: a typo must not silently widen a policy.
 */
export const CAPABILITY_SETTINGS = ["app.session_token_hash", "app.user_id"] as const;
export type CapabilitySetting = (typeof CAPABILITY_SETTINGS)[number];

export async function withCapability<T>(
  db: Db,
  setting: CapabilitySetting,
  value: string,
  fn: (tx: Tx) => Promise<T>
): Promise<T> {
  if (!CAPABILITY_SETTINGS.includes(setting)) {
    throw new Error(`unknown capability setting: ${setting}`);
  }
  return db.transaction(async (tx) => {
    await tx.query("select set_config($1, $2, true)", [setting, value]);
    return fn(tx);
  });
}
