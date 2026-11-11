"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { isLowStock, stockLabel, usd } from "./gps";

export type Product = { id: string; sku: string; oldSku?: string | null; name: string; unit: string; price: number; stock: number | null; minStock: number | null };

// Full-screen list of the catalogue: scroll it, or type part of a name or code to narrow it down.
// Tapping a product adds one; tapping again adds another. Items not in the list can be typed by hand.
export function ProductPicker({ products, counts, onPick, onFree, onClose }: {
  products: Product[]; counts: Record<string, number>;
  onPick: (p: Product) => void; onFree: (description: string) => void; onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const listEl = useRef<HTMLUListElement>(null);
  useEffect(() => {
    input.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", esc);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = overflow; };
  }, [onClose]);

  const list = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return products;
    return products
      .filter((p) => { const hay = `${p.name} ${p.sku} ${p.oldSku ?? ""}`.toLowerCase(); return words.every((w) => hay.includes(w)); })
      // An exact or leading code match goes first, so typing a code finds that product straight away.
      .sort((a, b) => Number(b.sku.toLowerCase().startsWith(words[0])) - Number(a.sku.toLowerCase().startsWith(words[0])));
  }, [q, products]);
  const picked = Object.values(counts).reduce((s, n) => s + n, 0);

  // Rendered on <body> so it covers the whole screen, the tab bar included.
  return createPortal(
    <div className="fixed inset-0 z-50 bg-bg flex flex-col" role="dialog" aria-modal="true" aria-label="Choose products">
      <div className="bg-surface border-b border-line px-4 pt-3 pb-3 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-[18px]">Choose products</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="close" /></button>
        </div>
        <div className="relative">
          <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input ref={input} className="input !min-h-[46px] !pl-10" value={q} onChange={(e) => { setQ(e.target.value); listEl.current?.scrollTo({ top: 0 }); }} placeholder="Search by name or code" autoComplete="off" enterKeyHint="search" aria-label="Search by name or code" />
        </div>
        <p className="text-xs text-muted">{products.length === 0 ? "No products in the catalogue yet." : q.trim() ? `${list.length} of ${products.length} products` : `${products.length} products`}</p>
      </div>
      <ul ref={listEl} className="flex-1 overflow-y-auto bg-surface">
        {list.map((p) => {
          const n = counts[p.id] ?? 0;
          return (
            <li key={p.id}>
              <button className={`row w-full text-left !py-3 ${n ? "bg-teal-soft" : ""}`} onClick={() => onPick(p)}>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium">{p.name}</span>
                  <span className="text-xs text-muted">{p.sku} · {p.price ? `${usd(p.price)} / ${p.unit}` : "Price from accounting"}</span>
                  {p.stock != null && (
                    <span className={`block text-xs ${isLowStock(p) ? "text-danger font-semibold" : "text-muted"}`}>
                      {isLowStock(p) && p.stock > 0 ? `Low stock · ${p.stock.toLocaleString("en-US")} left` : stockLabel(p)}
                    </span>
                  )}
                </span>
                {n > 0 ? <span className="chip chip-teal !text-sm" aria-label={`${n} added`}>× {n}</span> : <Icon name="plus" size={20} className="text-teal" />}
              </button>
            </li>
          );
        })}
        {products.length > 0 && list.length === 0 && <li className="empty">No product matches &ldquo;{q.trim()}&rdquo;.</li>}
        {products.length === 0 && <li className="empty">Accounting adds products and prices under Orders → Products and prices in the Command Center. Until then, type items by hand below.</li>}
        <li>
          <button className="row w-full text-left !py-3 text-teal font-medium" onClick={() => { onFree(q.trim()); onClose(); }}>
            <Icon name="edit" size={18} />{q.trim() ? <>Add &ldquo;{q.trim()}&rdquo; as an item not in the list</> : "Add an item that isn't in the list"}
          </button>
        </li>
      </ul>
      <div className="bg-surface border-t border-line p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
        <button className="btn btn-primary w-full !min-h-[48px]" onClick={onClose}>{picked ? `Done · ${picked} item${picked === 1 ? "" : "s"} in the order` : "Done"}</button>
      </div>
    </div>,
    document.body,
  );
}
