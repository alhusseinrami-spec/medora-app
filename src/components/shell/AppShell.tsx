"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { NAV } from "./nav";
import { CommandPalette } from "./CommandPalette";
import { NotificationCenter } from "./NotificationCenter";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { ThemeToggle } from "./ThemeToggle";
import { logout } from "@/app/(auth)/actions";

type Props = { user: { name: string; role: string; email: string }; approvals: number; aiReady: boolean; children: React.ReactNode };

const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch {} },
};

export function AppShell({ user, approvals, aiReady, children }: Props) {
  const path = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [palette, setPalette] = useState(false);
  const [assistant, setAssistant] = useState(false);
  const [help, setHelp] = useState(false);
  const [menu, setMenu] = useState(false);
  const gPressed = useRef(0);

  useEffect(() => { setCollapsed(store.get("medora-rail") === "1"); }, []);
  useEffect(() => { setDrawer(false); }, [path]);
  const toggleRail = () => setCollapsed((c) => { store.set("medora-rail", c ? "0" : "1"); return !c; });

  const onKey = useCallback((e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setAssistant((a) => !a); return; }
    if (e.key === "Escape") { setHelp(false); setDrawer(false); setMenu(false); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); setPalette(true); return; }
    if (e.key === "?") { setHelp(true); return; }
    if (e.key === "g") { gPressed.current = Date.now(); return; }
    if (Date.now() - gPressed.current < 1200) {
      const hit = NAV.find((n) => n.key === `g ${e.key}`);
      if (hit) { e.preventDefault(); router.push(hit.href); }
      gPressed.current = 0;
    }
  }, [router]);
  useEffect(() => { window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [onKey]);

  const active = (href: string) => (href === "/" ? path === "/" : path.startsWith(href));
  const rail = (mobile: boolean) => (
    <nav aria-label="Main" className="flex flex-col h-full">
      <div className={`flex items-center gap-2.5 px-3 h-14 ${collapsed && !mobile ? "justify-center" : ""}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.svg" alt="" width={30} height={30} />
        {(!collapsed || mobile) && <span className="font-bold text-white leading-tight">Medora<br /><span className="text-xs font-medium text-white/60">Command Center</span></span>}
      </div>
      <ul className="flex-1 px-2 py-2 space-y-0.5">
        {NAV.map((n) => (
          <li key={n.href}>
            <Link href={n.href} title={collapsed && !mobile ? n.label : undefined} aria-current={active(n.href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-lg px-3 h-10 text-[14px] font-medium transition-colors ${active(n.href) ? "bg-white/12 text-white" : "text-white/70 hover:bg-white/8 hover:text-white"} ${collapsed && !mobile ? "justify-center px-0" : ""}`}>
              <Icon name={n.icon} />
              {(!collapsed || mobile) && <span className="flex-1">{n.label}</span>}
              {n.href === "/approvals" && approvals > 0 && (!collapsed || mobile) && <span className="chip !bg-teal !text-white" aria-label={`${approvals} waiting`}>{approvals}</span>}
            </Link>
          </li>
        ))}
      </ul>
      {!mobile && (
        <button onClick={toggleRail} className="m-2 flex items-center justify-center gap-2 h-9 rounded-lg text-white/60 hover:text-white hover:bg-white/8 text-sm" aria-label={collapsed ? "Expand menu" : "Collapse menu"}>
          <Icon name={collapsed ? "expand" : "collapse"} size={18} />{!collapsed && "Collapse"}
        </button>
      )}
    </nav>
  );

  return (
    <div className="min-h-dvh flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 btn">Skip to content</a>
      <aside className={`hidden md:block shrink-0 bg-navy sticky top-0 h-dvh transition-[width] ${collapsed ? "w-[68px]" : "w-[232px]"}`}>{rail(false)}</aside>
      {drawer && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 w-[260px] bg-navy shadow-xl">{rail(true)}</aside>
        </div>
      )}
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 flex items-center gap-1 sm:gap-2 px-2 sm:px-3 md:px-6 bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur border-b border-line">
          <button className="md:hidden btn btn-ghost btn-sm" onClick={() => setDrawer(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <button onClick={() => setPalette(true)} className="flex-1 min-w-0 max-w-[460px] flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-surface text-muted text-sm hover:border-teal" aria-label="Search and commands">
            <Icon name="search" size={18} /><span className="flex-1 text-left truncate"><span className="sm:hidden">Search</span><span className="hidden sm:inline">Search tasks, contacts, events…</span></span>
            <kbd className="hidden sm:inline text-xs border border-line rounded px-1.5">Ctrl K</kbd>
          </button>
          <div className="flex-1 hidden sm:block" />
          <button onClick={() => setAssistant((a) => !a)} className={`btn btn-sm ${assistant ? "btn-primary" : ""}`} aria-pressed={assistant} aria-label="Assistant panel">
            <Icon name="sparkle" size={18} /><span className="hidden sm:inline">Assistant</span>
          </button>
          <NotificationCenter />
          <ThemeToggle />
          <div className="relative">
            <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu" className="w-9 h-9 rounded-full bg-teal text-white grid place-items-center font-bold text-sm" aria-label="Account menu">
              {user.name.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase()}
            </button>
            {menu && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenu(false)} />
                <div className="absolute right-0 mt-2 w-60 card p-2 z-40" role="menu">
                  <div className="px-2 py-1.5"><div className="font-semibold truncate">{user.name}</div><div className="text-xs text-muted truncate">{user.email} · {user.role}</div></div>
                  <Link role="menuitem" href="/settings" onClick={() => setMenu(false)} className="block px-2 py-1.5 rounded-md hover:bg-surface-2 text-sm">Settings</Link>
                  <button role="menuitem" onClick={() => { setMenu(false); setHelp(true); }} className="block w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-2 text-sm">Keyboard shortcuts</button>
                  <form action={logout}><button role="menuitem" className="w-full text-left px-2 py-1.5 rounded-md hover:bg-surface-2 text-sm text-danger">Sign out</button></form>
                </div>
              </>
            )}
          </div>
        </header>
        <div className="flex-1 flex min-h-0">
          <main id="main" className="flex-1 min-w-0 px-4 md:px-6 py-5 md:py-6">{children}</main>
          {assistant && (
            <aside className="fixed inset-0 z-40 md:static md:z-auto md:w-[380px] md:shrink-0 md:border-l border-line bg-surface md:h-[calc(100dvh-56px)] md:sticky md:top-14 flex flex-col" aria-label="Assistant">
              <div className="flex items-center justify-between px-4 h-12 border-b border-line">
                <span className="font-semibold flex items-center gap-2"><Icon name="sparkle" size={18} className="text-teal" />Assistant</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setAssistant(false)} aria-label="Close assistant"><Icon name="close" size={18} /></button>
              </div>
              <ChatPanel aiReady={aiReady} compact />
            </aside>
          )}
        </div>
      </div>
      {palette && <CommandPalette onClose={() => setPalette(false)} onAssistant={() => { setPalette(false); setAssistant(true); }} />}
      {help && (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="absolute inset-0 bg-black/40" onClick={() => setHelp(false)} />
          <div className="relative card p-5 w-full max-w-sm">
            <div className="flex justify-between items-center mb-3"><h2 className="font-bold">Keyboard shortcuts</h2><button className="btn btn-ghost btn-sm" onClick={() => setHelp(false)} aria-label="Close"><Icon name="close" size={18} /></button></div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt><kbd>Ctrl K</kbd> or <kbd>/</kbd></dt><dd>Search and commands</dd>
              <dt><kbd>Ctrl J</kbd></dt><dd>Open or close the assistant</dd>
              {NAV.map((n) => <Fragment key={n.href}><dt><kbd>{n.key}</kbd></dt><dd>Go to {n.label}</dd></Fragment>)}
              <dt><kbd>?</kbd></dt><dd>This list</dd>
            </dl>
          </div>
        </div>
      )}
    </div>
  );
}
