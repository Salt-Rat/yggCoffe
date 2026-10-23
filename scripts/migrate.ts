import { readdir, readFile } from "node:fs/promises";
import { db, transaction } from "../src/lib/db";
export async function migrate() {
  await db.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())",
  );
  for (const name of (
    await readdir(new URL("../db/migrations/", import.meta.url))
  )
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const sql = await readFile(
      new URL(`../db/migrations/${name}`, import.meta.url),
      "utf8",
    );
    await transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(879125)");
      if (
        (
          await tx.query("SELECT 1 FROM schema_migrations WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        return;
      await tx.query(sql);
      await tx.query("INSERT INTO schema_migrations(name) VALUES($1)", [name]);
      console.log(`Migração aplicada: ${name}`);
    });
  }
}
if (process.argv[1]?.endsWith("/migrate.ts")) {
  try {
    await migrate();
  } finally {
    await db.end();
  }
}
