"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type Item = { role: "user" | "assistant"; text: string; events?: { tool: string; ok: boolean; summary: string }[]; error?: boolean };
const KEY = "medora-conv";
const SUGGESTIONS = ["What needs me today?", "What's on my calendar this week?", "Add a task to call the lab supplier tomorrow", "Remind me at 4pm to review the tender"];

// Renders assistant text safely: paragraphs, "- " bullets and **bold**, no HTML injection.
function Rich({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>));
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => { if (list.length) blocks.push(<ul key={blocks.length} className="list-disc ps-5 space-y-0.5">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; };
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
    if (m) { list.push(m[1]); continue; }
    flush();
    if (line.trim()) blocks.push(<p key={blocks.length}>{inline(line)}</p>);
  }
  flush();
  return <div className="space-y-1.5" dir="auto">{blocks}</div>;
}

export function ChatPanel({ aiReady, compact = false, conversationId, onConversation }: { aiReady: boolean; compact?: boolean; conversationId?: string | null; onConversation?: (id: string) => void }) {
  const router = useRouter();
  const [conv, setConv] = useState<string | null>(conversationId ?? null);
  const [items, setItems] = useState<Item[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const live = useRef<string | null>(null); // conversation this panel created or already shows

  useEffect(() => {
    if (conversationId && conversationId === live.current) return;
    const id = conversationId !== undefined ? conversationId : (() => { try { return localStorage.getItem(KEY); } catch { return null; } })();
    setConv(id);
    live.current = id;
    setItems([]);
    if (!id) return;
    fetch(`/api/chat?id=${encodeURIComponent(id)}`).then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.items) setItems(d.items); }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    let pending: string | null = null;
    try { pending = sessionStorage.getItem("medora-ask"); sessionStorage.removeItem("medora-ask"); } catch {}
    if (pending) send(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [items, busy]);

  async function send(msg: string) {
    const t = msg.trim();
    if (!t || busy) return;
    setItems((x) => [...x, { role: "user", text: t }]);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ conversationId: conv, text: t }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || "The assistant couldn't answer. Try again.");
      setConv(d.conversationId);
      live.current = d.conversationId;
      try { localStorage.setItem(KEY, d.conversationId); } catch {}
      onConversation?.(d.conversationId);
      setItems((x) => [...x, { role: "assistant", text: d.reply, events: d.events }]);
      if (d.events?.some((e: { ok: boolean }) => e.ok)) router.refresh();
    } catch (e) {
      setItems((x) => [...x, { role: "assistant", text: e instanceof Error ? e.message : "Something went wrong.", error: true }]);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  }

  const reset = () => { setConv(null); live.current = null; setItems([]); try { localStorage.removeItem(KEY); } catch {} onConversation?.(""); };

  if (!aiReady) {
    return (
      <div className="p-5 text-sm space-y-3">
        <p className="font-semibold">The assistant isn’t connected yet.</p>
        <p className="text-ink-2">An administrator needs to add an Anthropic API key to the server (ANTHROPIC_API_KEY). Everything else in the app works without it.</p>
        <Link href="/settings#connections" className="btn btn-sm">See connections</Link>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className={`flex-1 overflow-auto px-4 py-4 space-y-3 ${compact ? "" : "md:px-6"}`} aria-live="polite" data-testid="chat-log">
        {items.length === 0 && (
          <div className="text-sm text-ink-2 space-y-3">
            <p>Ask about your day, or tell me what to organise. I can add tasks, calendar entries, contacts and reminders here. Anything that sends, deletes or assigns waits for your approval.</p>
            <div className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <button key={s} className="btn btn-sm" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {items.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : ""}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[14.5px] ${m.role === "user" ? "bg-teal text-white rounded-br-md" : m.error ? "bg-danger-soft text-danger rounded-bl-md" : "bg-surface-2 rounded-bl-md"}`} data-role={m.role}>
              {m.role === "assistant" ? <Rich text={m.text} /> : <p dir="auto" className="whitespace-pre-wrap">{m.text}</p>}
              {!!m.events?.length && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {m.events.map((e, j) => <span key={j} className={`chip ${e.ok ? "chip-teal" : "chip-danger"}`}>{e.summary}</span>)}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && <div className="flex gap-1 px-2" aria-label="Assistant is thinking"><span className="w-2 h-2 rounded-full bg-teal animate-bounce" /><span className="w-2 h-2 rounded-full bg-teal animate-bounce [animation-delay:.15s]" /><span className="w-2 h-2 rounded-full bg-teal animate-bounce [animation-delay:.3s]" /></div>}
        <div ref={end} />
      </div>
      <form className="border-t border-line p-3 flex gap-2 items-end" onSubmit={(e) => { e.preventDefault(); send(text); }}>
        <textarea ref={box} value={text} onChange={(e) => setText(e.target.value)} rows={1} dir="auto" placeholder="Message the assistant…" aria-label="Message"
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }}
          className="textarea !min-h-[40px] max-h-40 flex-1" />
        <button className="btn btn-primary !px-3" disabled={busy || !text.trim()} aria-label="Send"><Icon name="send" size={18} /></button>
        {items.length > 0 && <button type="button" onClick={reset} className="btn btn-sm btn-ghost" title="New conversation" aria-label="New conversation"><Icon name="plus" size={18} /></button>}
      </form>
    </div>
  );
}
