// Same Postgres connection approach as the old Express backend's db.js,
// just running inside a Deno Edge Function via the npm: compatibility layer.
import pg from "npm:pg@8.12.0";

const { Pool } = pg;

// DATABASE_URL is set as a Supabase secret (same Supabase Postgres
// connection string you already have - the Session Pooler one is
// recommended since Edge Functions, like Render before, can create many
// short-lived connections under a submission burst).
const pool = new Pool({
  connectionString: Deno.env.get("DATABASE_URL"),
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 20000,
  connectionTimeoutMillis: 10000,
  statement_timeout: 15000,
});

pool.on("error", (err: Error) => {
  console.error("Unexpected error on idle database client", err);
});

// deno-lint-ignore no-explicit-any
export function query(text: string, params?: any[]) {
  return pool.query(text, params);
}

export function getPool() {
  return pool;
}
