"use client";
import { useFormStatus } from "react-dom";

export function Submit({ children, className = "btn btn-primary w-full", pendingText }: { children: React.ReactNode; className?: string; pendingText?: string }) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-busy={pending}>{pending ? pendingText ?? "Working…" : children}</button>;
}

export function FormMessage({ state }: { state?: { error?: string; ok?: string } }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="err">{state.error}</p>;
  if (state.ok) return <p role="status" className="text-sm font-semibold text-ok">{state.ok}</p>;
  return null;
}

export function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  // The hint sits outside the <label> so it isn't read as part of the field's name.
  return (
    <div>
      <label className="block">
        <span className="label">{label}</span>
        {children}
      </label>
      {hint && <p className="text-xs text-muted mt-1">{hint}</p>}
    </div>
  );
}
