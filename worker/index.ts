// Background worker for self-hosting: run as its own process (`npm run worker`) next to the web app.
// On Vercel the same jobs run from Vercel Cron instead (see vercel.json and /api/cron/tick).
import { db } from "../src/lib/db";
import { log } from "../src/lib/log";
import { runJobs } from "../src/lib/jobs";

export { pruneByRetention } from "../src/lib/jobs";

const TICK_MS = 30_000;
let stopping = false;

async function main() {
  log.info("worker.started", { tickMs: TICK_MS });
  while (!stopping) {
    try { await runJobs(); } catch (e) { log.error("worker.tick_failed", { error: String(e) }); }
    await new Promise((r) => setTimeout(r, TICK_MS));
  }
  await db.$disconnect();
}

for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => { stopping = true; log.info("worker.stopping"); });
if (process.argv[1]?.includes("worker")) main();
