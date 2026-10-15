"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";

type N = { id: string; kind: string; title: string; body: string; link: string; readAt: string | null; createdAt: string };

export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<N[]>([]);
  const [unread, setUnread] = useState(0);
  const [perm, setPerm] = useState<NotificationPermission | "unsupported">("default");
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/notifications", { cache: "no-store" });
      if (!r.ok) return;
      const d: { unread: number; items: N[] } = await r.json();
      // Desktop alert for anything new since the last check (only after the first load).
      if (seen.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const n of d.items) if (!n.readAt && !seen.current.has(n.id)) new Notification(n.title, { body: n.body || undefined, tag: n.id, icon: "/icon.svg" });
      }
      seen.current = new Set(d.items.map((n) => n.id));
      setItems(d.items);
      setUnread(d.unread);
    } catch {}
  }, []);

  useEffect(() => {
    setPerm(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    load();
    const t = setInterval(load, 30_000);
    const vis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const markAll = async () => {
    await fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    load();
  };
  const markOne = (id: string) => fetch("/api/notifications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: [id] }) }).then(load);

  return (
    <div className="relative">
      <button className="btn btn-ghost btn-sm relative" onClick={() => { setOpen((o) => !o); if (!open) load(); }} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} data-testid="bell">
        <Icon name="bell" size={18} />
        {unread > 0 && <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-danger text-white text-[11px] font-bold grid place-items-center" data-testid="unread">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[min(92vw,380px)] card z-40 overflow-hidden" role="region" aria-label="Notifications">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-line">
              <span className="font-semibold">Notifications</span>
              {unread > 0 && <button className="text-sm text-teal font-semibold" onClick={markAll}>Mark all read</button>}
            </div>
            {perm === "default" && (
              <div className="px-4 py-2 text-sm bg-teal-soft flex items-center gap-2">
                <span className="flex-1">Get desktop alerts while this tab is open.</span>
                <button className="btn btn-sm" onClick={async () => setPerm(await Notification.requestPermission())}>Turn on</button>
              </div>
            )}
            <ul className="max-h-[60vh] overflow-auto">
              {items.length === 0 && <li className="empty">Nothing yet. Reminders, approvals and assignments show up here.</li>}
              {items.map((n) => (
                <li key={n.id} className={`row !items-start ${n.readAt ? "" : "bg-teal-soft/40"}`}>
                  <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.readAt ? "bg-transparent" : "bg-teal"}`} aria-hidden />
                  <div className="flex-1 min-w-0">
                    {n.link ? <Link href={n.link} onClick={() => { markOne(n.id); setOpen(false); }} className="font-medium hover:underline">{n.title}</Link> : <span className="font-medium">{n.title}</span>}
                    {n.body && <div className="text-sm text-ink-2">{n.body}</div>}
                    <div className="text-xs text-muted">{new Date(n.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</div>
                  </div>
                  {!n.readAt && <button className="text-xs text-muted hover:text-ink" onClick={() => markOne(n.id)} aria-label="Mark read"><Icon name="check" size={16} /></button>}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
