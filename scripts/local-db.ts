import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";
const databaseDir = new URL("../.local/postgres", import.meta.url).pathname;
const pg = new EmbeddedPostgres({
  databaseDir,
  user: "ygg",
  password: "ygg_local_only",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
  onLog: () => {},
  onError: () => {},
});
if (!existsSync(`${databaseDir}/PG_VERSION`)) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
if (
  !(await client.query("SELECT 1 FROM pg_database WHERE datname='yggcoffe'"))
    .rowCount
)
  await client.query("CREATE DATABASE yggcoffe");
await client.end();
console.log(
  "PostgreSQL local ativo em 127.0.0.1:54329. Ctrl+C encerra sem apagar os dados.",
);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, async () => {
    await pg.stop();
    process.exit(0);
  });
