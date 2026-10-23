import { setTimeout } from "node:timers/promises";
import { runJobs } from "../src/lib/worker";
import { db } from "../src/lib/db";
const controller = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => controller.abort());
try {
  while (!controller.signal.aborted) {
    try {
      console.log(JSON.stringify(await runJobs()));
    } catch {
      console.error("WORKER_CYCLE_FAILED");
    }
    try {
      await setTimeout(30000, undefined, { signal: controller.signal });
    } catch {
      break;
    }
  }
} finally {
  await db.end();
}
