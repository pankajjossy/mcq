import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }, // required for Supabase's pooled connection

  // A full class (30-60 students) can submit within the same few seconds
  // when a teacher says "time's up" - size the pool to absorb that burst
  // instead of queuing requests behind a small default pool.
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,

  // If a query hangs (e.g. a stuck connection to Supabase's pooler), fail
  // it quickly instead of tying up a pool slot indefinitely during a burst.
  statement_timeout: 15000
});

pool.on("error", (err) => {
  // A background/idle client failing shouldn't crash the whole server -
  // Postgres poolers occasionally drop idle connections; just log it.
  console.error("Unexpected error on idle database client", err);
});

export const query = (text, params) => pool.query(text, params);
