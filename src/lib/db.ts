import { Pool, type PoolClient, type QueryResultRow } from "pg";
const globalDb = globalThis as unknown as { coffeePool?: Pool };
export const db =
  globalDb.coffeePool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 20000,
    connectionTimeoutMillis: 5000,
    statement_timeout: 8000,
    application_name: "yggcoffe",
  });
if (process.env.NODE_ENV !== "production") globalDb.coffeePool = db;
// A restarted database can emit errors on idle pool clients. Handle them without
// crashing the process or logging connection strings/credentials.
if (!db.listenerCount("error"))
  db.on("error", () => console.error("DATABASE_IDLE_CONNECTION_ERROR"));
export type Sql = Pick<PoolClient, "query">;
export async function rows<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values: unknown[] = [],
  client: Sql = db,
): Promise<T[]> {
  return (await client.query<T>(sql, values)).rows;
}
export async function transaction<T>(
  fn: (tx: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '5s'");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
