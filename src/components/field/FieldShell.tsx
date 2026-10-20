"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/Icon";
import { NotificationCenter } from "@/components/shell/NotificationCenter";

const TABS = [
  { href: "/field", label: "Today", icon: "calendar" },
  { href: "/field/map", label: "Map", icon: "pin" },
  { href: "/field/pipeline", label: "Pipeline", icon: "pipeline" },
  { href: "/field/orders", label: "Orders", icon: "cart" },
] as const;

// Phone-first frame for sales reps: brand bar on top, four tabs at the bottom.
export function FieldShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = (href: string) => (href === "/field" ? path === "/field" : path.startsWith(href));
  const fullBleed = path === "/field/map";
  return (
    <div className="min-h-dvh flex flex-col bg-bg">
      <header className="sticky top-0 z-30 h-14 flex items-center gap-2 px-4 bg-surface border-b border-line">
        <Link href="/field" className="text-[20px] font-bold tracking-tight"><span className="text-teal">Medora</span> <span className="font-normal text-ink-2">Field</span></Link>
        <div className="flex-1" />
        <Link href="/field/clients/new" className="btn btn-sm" aria-label="Add client"><Icon name="plus" size={18} /><span className="hidden sm:inline">Client</span></Link>
        <NotificationCenter />
        <Link href="/" className="btn btn-ghost btn-sm" aria-label="Back to the Command Center"><Icon name="home" size={18} /></Link>
      </header>
      <main id="main" className={fullBleed ? "flex-1 flex flex-col" : "flex-1 w-full max-w-xl mx-auto px-4 pt-4 pb-28"}>{children}</main>
      <nav aria-label="Field" className="fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-line pb-[env(safe-area-inset-bottom)]">
        <ul className="max-w-xl mx-auto grid grid-cols-4">
          {TABS.map((t) => (
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
