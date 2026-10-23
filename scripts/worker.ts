import { runJobs } from "../src/lib/worker";
import { db } from "../src/lib/db";
try {
  console.log(await runJobs());
} finally {
  await db.end();
}
