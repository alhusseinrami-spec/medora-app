import { json } from "@/lib/http";
import { safeEqual } from "@/lib/crypto";
import { log } from "@/lib/log";
import { runJobs } from "@/lib/jobs";

// Called by Vercel Cron (vercel.json), which sends "Authorization: Bearer <CRON_SECRET>".
// Any other scheduler can call it the same way.
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16 || !safeEqual(got, `Bearer ${secret}`)) return json({ error: "Not allowed" }, 401);
  try {
    return json({ ok: true, ...(await runJobs()) });
  } catch (e) {
    log.error("cron.tick_failed", { error: String(e) });
    return json({ ok: false }, 500);
  }
}
