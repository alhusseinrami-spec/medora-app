"use client";
import { useEffect, useRef } from "react";
import { Icon } from "./Icon";

// Side panel on desktop, full-height sheet on phones. Escape closes; focus returns to where it was.
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") close.current(); };
    window.addEventListener("keydown", key);
    if (!panel.current?.contains(document.activeElement)) panel.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    return () => { window.removeEventListener("keydown", key); prev?.focus?.(); };
  }, []);
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-black/35" onClick={onClose} />
      <div ref={panel} className="absolute inset-y-0 right-0 w-full sm:w-[460px] bg-surface shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-5 h-14 border-b border-line shrink-0">
          <h2 className="font-bold">{title}</h2>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close"><Icon name="close" size={18} /></button>
        </div>
        <div className="flex-1 overflow-auto p-5">{children}</div>
      </div>
    </div>
  );
}
