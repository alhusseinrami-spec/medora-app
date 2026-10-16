import { z } from "zod";
import { json } from "@/lib/http";
import { nourAuth } from "@/lib/nour";
import { proposeApproval } from "@/lib/services/approvals";
import { UserError } from "@/lib/services/errors";

export const dynamic = "force-dynamic";

// Nour queues a task or reminder that Rami confirmed on the call. It lands in the Approval Center
// as "Waiting for approval"; nothing is created until Rami approves it in the app.
const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("task"), title: z.string().min(1).max(200), due: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(), notes: z.string().max(2000).optional() }),
  z.object({ type: z.literal("reminder"), title: z.string().min(1).max(200), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), time: z.string().regex(/^\d{2}:\d{2}$/).optional() }),
]);

export async function POST(req: Request) {
  const auth = await nourAuth(req);
  if ("error" in auth) return auth.error;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid request." }, 400);
  const b = parsed.data;
  try {
    const ap = b.type === "task"
      ? await proposeApproval(auth.owner, { kind: "task.create", title: `Add task: ${b.title}`, detail: "Confirmed on a call with Nour.", payload: { title: b.title, notes: b.notes ?? "", due: b.due ?? null, priority: "P3" }, requestedBy: "nour" })
      : await proposeApproval(auth.owner, { kind: "reminder.create", title: `Reminder: ${b.title}`, detail: "Confirmed on a call with Nour.", payload: { title: b.title, date: b.date, time: b.time ?? "09:00" }, requestedBy: "nour" });
    return json({ ok: true, id: ap.id, say: "Done. It's waiting for your approval in the app." }, 201);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    throw e;
  }
}
