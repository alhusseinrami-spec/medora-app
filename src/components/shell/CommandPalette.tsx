"use client";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV } from "./nav";

type Hit = { kind: string; id: string; title: string; sub: string; href: string };
type Item = { id: string; title: string; sub: string; icon: string; run: () => void };

export function CommandPalette({ onClose, onAssistant }: { onClose: () => void; onAssistant: () => void }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const ctl = new AbortController();
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: ctl.signal })
        .then((r) => (r.ok ? r.json() : { hits: [] }))
        .then((d) => setHits(d.hits ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 180);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [q]);

  const go = (href: string) => { onClose(); router.push(href); };
  const items: Item[] = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmds: Item[] = [
      { id: "new-task", title: "New task", sub: "Command", icon: "plus", run: () => go("/tasks?new=1") },
      { id: "new-event", title: "New calendar entry", sub: "Command", icon: "calendar", run: () => go("/calendar?new=1") },
      { id: "new-contact", title: "New contact", sub: "Command", icon: "contacts", run: () => go("/contacts?new=1") },
      { id: "new-reminder", title: "New reminder", sub: "Command", icon: "clock", run: () => go("/reminders?new=1") },
      { id: "ask", title: q.trim() ? `Ask the assistant: "${q.trim()}"` : "Ask the assistant", sub: "Command", icon: "sparkle", run: () => { if (q.trim()) sessionStorage.setItem("medora-ask", q.trim()); onAssistant(); } },
      ...NAV.map((n) => ({ id: `nav-${n.href}`, title: `Go to ${n.label}`, sub: "Navigate", icon: n.icon, run: () => go(n.href) })),
    ].filter((c) => !s || c.id === "ask" || c.title.toLowerCase().includes(s));
    const found: Item[] = hits.map((h) => ({ id: `${h.kind}-${h.id}`, title: h.title, sub: h.sub, icon: h.kind === "task" ? "tasks" : h.kind === "contact" ? "contacts" : h.kind === "event" ? "calendar" : "clock", run: () => go(h.href) }));
    return [...found, ...cmds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, hits]);
  useEffect(() => { setSel(0); }, [q, hits]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); items[sel]?.run(); }
    else if (e.key === "Escape") onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-3 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search and commands">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative card w-full max-w-[600px] overflow-hidden">
        <div className="flex items-center gap-2 px-4 border-b border-line">
          <Icon name="search" className="text-muted" />
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} placeholder="Search or type a command…" className="flex-1 h-12 bg-transparent outline-none text-[15px]"
            role="combobox" aria-expanded="true" aria-controls="palette-list" aria-activedescendant={items[sel] ? `pal-${items[sel].id}` : undefined} />
          {loading && <span className="text-xs text-muted">Searching…</span>}
        </div>
        <ul id="palette-list" role="listbox" className="max-h-[50vh] overflow-auto py-1">
          {items.map((it, i) => (
            <li key={it.id} id={`pal-${it.id}`} role="option" aria-selected={i === sel} onMouseEnter={() => setSel(i)} onClick={it.run}
              className={`flex items-center gap-3 px-4 py-2 cursor-pointer ${i === sel ? "bg-teal-soft" : ""}`}>
              <Icon name={it.icon} size={18} className="text-teal shrink-0" />
              <span className="flex-1 min-w-0 truncate">{it.title}</span>
              <span className="text-xs text-muted shrink-0">{it.sub}</span>
            </li>
          ))}
          {q.trim().length >= 2 && !loading && !hits.length && <li className="empty">No tasks, contacts, events or reminders match “{q.trim()}”.</li>}
        </ul>
      </div>
    </div>
  );
}
