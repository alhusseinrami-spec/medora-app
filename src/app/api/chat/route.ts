import { apiAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { json, rateLimited, sameOrigin } from "@/lib/http";
import { log } from "@/lib/log";
import { aiConfigured, loadConversation, runChat } from "@/lib/ai/chat";
import { can } from "@/lib/rbac";

export async function GET(req: Request) {
  const auth = await apiAuth("workspace.use");
  if (!auth) return json({ error: "Sign in required" }, 401);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    const list = await db.conversation.findMany({ where: { userId: auth.user.id }, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, title: true, updatedAt: true } });
    return json({ conversations: list });
  }
  const c = await loadConversation(auth.user.id, id);
  return c ? json(c) : json({ error: "Not found" }, 404);
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return json({ error: "Bad origin" }, 403);
  const auth = await apiAuth("workspace.use");
  if (!auth || !can(auth.user.role, "workspace.use")) return json({ error: "Sign in required" }, 401);
  if (!aiConfigured()) return json({ error: "The assistant isn't connected yet. An administrator needs to add ANTHROPIC_API_KEY." }, 503);
  if (rateLimited(`chat:${auth.user.id}`, 20, 60_000)) return json({ error: "That's a lot of messages in a minute. Wait a moment and try again." }, 429);
  const body = await req.json().catch(() => null);
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 8000) return json({ error: "Write a message (up to 8000 characters)." }, 400);
  const conversationId = typeof body?.conversationId === "string" && body.conversationId ? body.conversationId : null;
  try {
    return json(await runChat(auth.user, conversationId, text));
  } catch (e) {
    log.error("chat.failed", { error: String(e) });
    const status = (e as { status?: number }).status;
    const msg = status === 401 ? "The AI key was rejected. An administrator needs to check ANTHROPIC_API_KEY."
      : status === 429 || status === 529 ? "The AI service is busy. Try again in a minute."
      : "The assistant couldn't answer just now. Try again.";
    return json({ error: msg }, 502);
  }
}
