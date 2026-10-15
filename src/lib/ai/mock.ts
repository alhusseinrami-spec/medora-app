import type Anthropic from "@anthropic-ai/sdk";
import { dayKey, addDaysKey } from "../time";

// Scripted stand-in for the Claude API, used only by automated tests (AI_PROVIDER=mock, never in production).
// It picks a tool from keywords in the last user message, then summarises the tool result,
// so the real tool loop, persistence and approval rules are exercised end to end.
type Msg = Anthropic.Beta.BetaMessageParam;
type Reply = { content: Anthropic.Beta.BetaContentBlock[]; stop_reason: Anthropic.Beta.BetaStopReason };

let seq = 0;
const text = (t: string): Reply => ({ content: [{ type: "text", text: t, citations: null } as Anthropic.Beta.BetaTextBlock], stop_reason: "end_turn" });
const call = (name: string, input: Record<string, unknown>, say = ""): Reply => ({
  content: [
    ...(say ? [{ type: "text", text: say, citations: null } as Anthropic.Beta.BetaTextBlock] : []),
    { type: "tool_use", id: `toolu_mock_${++seq}`, name, input } as Anthropic.Beta.BetaToolUseBlock,
  ],
  stop_reason: "tool_use",
});

export async function mockReply(messages: Msg[]): Promise<Reply> {
  const last = messages[messages.length - 1];
  const blocks = Array.isArray(last.content) ? last.content : [{ type: "text" as const, text: last.content }];
  const result = blocks.find((b) => b.type === "tool_result") as Anthropic.Beta.BetaToolResultBlockParam | undefined;
  if (result) {
    const body = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
    if (result.is_error) return text(`That didn't work: ${body}`);
    const o = JSON.parse(body);
    if (o.proposed) return text("I've put that in the Approval Center for you to approve.");
    if (o.created) return text(`Done. I added "${o.title ?? o.name}".`);
    if (o.updated) return text(`Updated "${o.title}".`);
    if (Array.isArray(o)) return text(o.length ? `I found ${o.length}: ${o.map((x: { title?: string; name?: string }) => x.title ?? x.name).join(", ")}.` : "I didn't find anything.");
    if (o.today) return text(`Today you have ${o.events.length} meeting(s), ${o.tasksDueOrOverdue.length} task(s) due and ${o.approvalsWaiting} approval(s) waiting.`);
    return text("Done.");
  }
  const q = blocks.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join(" ");
  const tomorrow = addDaysKey(dayKey(new Date()), 1);
  const quoted = q.match(/"([^"]+)"/)?.[1];
  if (/remind/i.test(q)) return call("create_reminder", { title: quoted ?? "Follow up", date: tomorrow, time: "09:00" });
  if (/(add|create).*task/i.test(q)) return call("create_task", { title: quoted ?? "New task", due: tomorrow, priority: "P2" });
  if (/delete.*task/i.test(q)) return call("list_tasks", { query: quoted ?? "" });
  if (/(meeting|schedule|book)/i.test(q) && quoted) return call("create_event", { title: quoted, date: tomorrow, start: "10:00", end: "10:30" });
  if (/remember/i.test(q)) return call("propose_approval", { kind: "memory.save", title: `Remember: ${quoted ?? q}`, payload: { content: quoted ?? q, kind: "preference" } });
  if (/contact|who is|find/i.test(q)) return call("search_contacts", { query: quoted ?? q.split(" ").pop() ?? "" });
  if (/send|email|whatsapp|pay/i.test(q)) return text("I can't send messages or make payments. I can draft it for you to send yourself.");
  return call("get_overview", {});
}
