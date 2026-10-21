"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NotificationCenter } from "@/components/shell/NotificationCenter";

const TABS = {
  sales: [
    { href: "/field", label: "Today", icon: "calendar" },
    { href: "/field/map", label: "Map", icon: "pin" },
    { href: "/field/pipeline", label: "Pipeline", icon: "pipeline" },
    { href: "/field/orders", label: "Orders", icon: "cart" },
  ],
  driver: [
    { href: "/field/deliveries", label: "To deliver", icon: "box" },
    { href: "/field/deliveries/done", label: "Delivered", icon: "check" },
  ],
} as const;

// Phone-first frame for sales reps and drivers: brand bar on top, tabs at the bottom.
export function FieldShell({ mode, phoneOnly, children }: { mode: "sales" | "driver"; phoneOnly: boolean; children: React.ReactNode }) {
  const path = usePathname();
  const tabs = TABS[mode];
  // The most specific tab wins, so "Delivered" doesn't also light up "To deliver".
  const current = tabs.filter((t) => (t.href === "/field" ? path === "/field" : path === t.href || path.startsWith(`${t.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  const active = (href: string) => href === current;
  const home = mode === "sales" ? "/field" : "/field/deliveries";
  const fullBleed = path === "/field/map";
  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="sticky top-0 z-30 h-14 flex items-center gap-2 px-4 bg-surface border-b border-line">
        <Link href={home} className="text-[20px] font-bold tracking-tight"><span className="text-teal">Medora</span> <span className="font-normal text-ink-2">{mode === "sales" ? "Field" : "Deliveries"}</span></Link>
        <div className="flex-1" />
        {mode === "sales" && <Link href="/field/clients/new" className="btn btn-sm" aria-label="Add client"><Icon name="plus" size={18} /><span className="hidden sm:inline">Client</span></Link>}
        <NotificationCenter />
        {phoneOnly
          ? <Link href="/settings" className="btn btn-ghost btn-sm" aria-label="Account and password"><Icon name="settings" size={18} /></Link>
          : <Link href="/" className="btn btn-ghost btn-sm" aria-label="Back to the Command Center"><Icon name="home" size={18} /></Link>}
      </header>
      <main id="main" className={fullBleed ? "flex-1 flex flex-col" : "flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-28"}>{children}</main>
      <nav aria-label="Field" className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <ul className={`max-w-xl mx-auto grid ${tabs.length === 4 ? "grid-cols-4" : "grid-cols-2"}`}>
          {tabs.map((t) => (
            <li key={t.href}>
              <Link href={t.href} aria-current={active(t.href) ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[12px] font-medium ${active(t.href) ? "text-teal" : "text-muted"}`}>
                <Icon name={t.icon} size={22} />{t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
