import Anthropic from "@anthropic-ai/sdk";
import type { Prisma, User } from "@prisma/client";
import { db } from "../db";
import { execLog } from "../audit";
import { log } from "../log";
import { ROLE_LABEL } from "../rbac";
import { TZ_DEFAULT, fmtDateTime } from "../time";
import { TOOLS, toolList } from "./tools";
import { mockReply } from "./mock";

export const aiConfigured = () => Boolean(process.env.ANTHROPIC_API_KEY) || mockEnabled();
// The scripted provider exists only for automated tests and can never run in production.
const mockEnabled = () => process.env.AI_PROVIDER === "mock" && process.env.NODE_ENV !== "production";

export const MODEL = process.env.AI_MODEL || "claude-opus-5-5";
const MAX_STEPS = 8;

type Msg = Anthropic.Beta.BetaMessageParam;

async function systemPrompt(user: User) {
  const memories = await db.memory.findMany({ where: { userId: user.id, approvedAt: { not: null } }, orderBy: { createdAt: "asc" }, take: 50 });
  const tz = user.timeZone || TZ_DEFAULT;
  return [
    `You are the executive assistant inside Medora Care's command center. Medora Care distributes medical and laboratory supplies in Beirut, Lebanon.`,
    `You are talking with ${user.name} (${ROLE_LABEL[user.role]}). Their time zone is ${tz}; it is now ${fmtDateTime(new Date(), tz)} there. Use dates as YYYY-MM-DD in tool calls.`,
    `Reply in the language the user writes in (English, Arabic or French). Be brief and lead with the answer. Use short bullet lists for several items.`,
    `Use the tools to read real data before answering questions about tasks, calendar, contacts or reminders. Never invent records, numbers or completed actions; if a tool returns nothing, say so.`,
    `You may create tasks, calendar entries, contacts and reminders inside this app when the user asks. You cannot send any message outside the app, make or approve payments, change financial data, or commit Medora to a purchase. Deleting records, assigning work to other people and saving preferences go through propose_approval, and you tell the user it is waiting in the Approval Center.`,
    `When the user corrects you or states a lasting preference, offer to remember it and, if they agree, use propose_approval with kind memory.save.`,
    memories.length ? `Preferences and facts the user approved:\n${memories.map((m) => `- ${m.content}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

export type ChatEvent = { tool: string; ok: boolean; summary: string };

export async function runChat(user: User, conversationId: string | null, text: string): Promise<{ conversationId: string; reply: string; events: ChatEvent[] }> {
  if (!aiConfigured()) throw new Error("AI is not connected. Add ANTHROPIC_API_KEY to the server environment.");
  const conv = conversationId
    ? await db.conversation.findFirst({ where: { id: conversationId, userId: user.id }, include: { messages: { orderBy: { createdAt: "asc" } } } })
    : null;
  const convo = conv ?? (await db.conversation.create({ data: { userId: user.id, title: text.slice(0, 80) }, include: { messages: true } }));
  // History is append-only: earlier turns are replayed exactly as stored.
  const messages: Msg[] = convo.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content as unknown as Msg["content"] }));
  const userMsg: Msg = { role: "user", content: [{ type: "text", text }] };
  messages.push(userMsg);
  await db.message.create({ data: { conversationId: convo.id, role: "user", content: userMsg.content as unknown as Prisma.InputJsonValue } });

  const events: ChatEvent[] = [];
  const system = await systemPrompt(user);
  const client = mockEnabled() ? null : new Anthropic();
  let reply = "";

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = client
      ? await execLog("ai", "messages.create", user.id, { model: MODEL, step }, () =>
          client.beta.messages.create({
            model: MODEL, max_tokens: 16000, system, tools: toolList(), messages,
            output_config: { effort: "medium" },
            betas: ["server-side-fallback-2026-07-01"], fallbacks: "default",
          }))
      : await mockReply(messages);
    messages.push({ role: "assistant", content: res.content as Msg["content"] });
    await db.message.create({ data: { conversationId: convo.id, role: "assistant", content: res.content as unknown as Prisma.InputJsonValue } });

    if (res.stop_reason === "refusal") { reply = "I can't help with that request."; break; }
    if (res.stop_reason === "pause_turn") continue;
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    reply = res.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text").map((b) => b.text).join("\n").trim() || reply;
    if (res.stop_reason !== "tool_use" || !calls.length) break;

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const call of calls) {
      const def = TOOLS[call.name];
      try {
        if (!def) throw new Error(`Unknown tool ${call.name}`);
        const parsed = def.input.safeParse(call.input);
        if (!parsed.success) throw new Error(`Invalid input: ${parsed.error.issues[0]?.message}`);
        const out = await execLog("ai_tool", call.name, user.id, call.input, () => def.run({ user }, parsed.data as never));
        events.push({ tool: call.name, ok: true, summary: summarize(call.name, out) });
        results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(out).slice(0, 20000) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        events.push({ tool: call.name, ok: false, summary: msg });
        results.push({ type: "tool_result", tool_use_id: call.id, content: msg, is_error: true });
      }
    }
    const toolMsg: Msg = { role: "user", content: results };
    messages.push(toolMsg);
    await db.message.create({ data: { conversationId: convo.id, role: "user", content: toolMsg.content as unknown as Prisma.InputJsonValue } });
  }
  await db.conversation.update({ where: { id: convo.id }, data: { updatedAt: new Date() } });
  if (!reply) { reply = "I couldn't finish that. Please try again."; log.warn("ai.no_reply", { conversationId: convo.id }); }
  return { conversationId: convo.id, reply, events };
}

function summarize(tool: string, out: unknown): string {
  const o = out as Record<string, unknown>;
  if (o && typeof o === "object" && "created" in o) return `Created ${String(o.title ?? o.name ?? "")}`.trim();
  if (o && typeof o === "object" && "proposed" in o) return "Sent to the Approval Center";
  if (o && typeof o === "object" && "updated" in o) return `Updated ${String(o.title ?? "")}`;
  if (Array.isArray(out)) return `Read ${out.length} item${out.length === 1 ? "" : "s"}`;
  return tool === "get_overview" ? "Read today's overview" : "Done";
}

// Rebuilds a conversation for display: user text, assistant text and tool activity.
export async function loadConversation(userId: string, id: string) {
  const c = await db.conversation.findFirst({ where: { id, userId }, include: { messages: { orderBy: { createdAt: "asc" } } } });
  if (!c) return null;
  const items: { role: "user" | "assistant"; text: string }[] = [];
  for (const m of c.messages) {
    const blocks = (m.content as unknown as { type: string; text?: string }[]) ?? [];
    const text = blocks.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    if (text) items.push({ role: m.role as "user" | "assistant", text });
  }
  return { id: c.id, title: c.title, items };
}
