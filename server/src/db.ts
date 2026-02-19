import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Postgres connection.");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

function toPgSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
}

export async function run(sql: string, params: unknown[] = []) {
  const result = await pool.query(toPgSql(sql), params);
  const firstRow = result.rows[0] as { id?: number } | undefined;
  return {
    lastID: Number(firstRow?.id ?? 0),
    changes: result.rowCount ?? 0
  };
}

export async function all<T>(sql: string, params: unknown[] = []) {
  const result = await pool.query(toPgSql(sql), params);
  return result.rows as T[];
}

export async function get<T>(sql: string, params: unknown[] = []) {
  const result = await pool.query(toPgSql(sql), params);
  return (result.rows[0] as T | undefined) ?? undefined;
}

export async function initDb() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (CURRENT_DATE::text)
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS habits (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (CURRENT_DATE::text),
      deleted_on TEXT
    )
  `);

  await run("ALTER TABLE habits ADD COLUMN IF NOT EXISTS deleted_on TEXT");

  await run(`
    CREATE TABLE IF NOT EXISTS checkins (
      id SERIAL PRIMARY KEY,
      habit_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      completed INTEGER NOT NULL DEFAULT 0,
      UNIQUE(habit_id, date),
      FOREIGN KEY(habit_id) REFERENCES habits(id) ON DELETE CASCADE
    )
  `);
}
