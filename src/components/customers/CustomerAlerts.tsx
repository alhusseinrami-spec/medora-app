"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { sendCustomerAlertAction, type SendRes } from "@/app/(app)/customers/actions";

function Msg({ r }: { r: SendRes }) {
  if (r.error) return <p role="alert" className="err mt-2">{r.error}</p>;
  if (r.ok) return <p role="status" className="text-sm font-semibold text-ok mt-2">{r.ok}</p>;
  return null;
}

export function AlertComposer({ disabled }: { disabled: boolean }) {
  const [f, setF] = useState({ title: "", body: "", link: "/shop" });
  const [r, setR] = useState<SendRes>({});
  const [pending, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!confirming) return setConfirming(true);
    setConfirming(false);
    start(async () => {
      const res = await sendCustomerAlertAction(f);
      setR(res);
      if (res.ok) setF({ title: "", body: "", link: "/shop" });
    });
  }
  return (
    <form onSubmit={submit} className="grid gap-3">
      <label><span className="label">Title</span><input className="input" maxLength={60} value={f.title} onChange={(e) => { setF({ ...f, title: e.target.value }); setConfirming(false); }} placeholder="New: Oxygen concentrators in stock" required /></label>
      <label><span className="label">Message</span><textarea className="input min-h-20" maxLength={180} value={f.body} onChange={(e) => { setF({ ...f, body: e.target.value }); setConfirming(false); }} placeholder="Order today, delivery all over Lebanon." required /><span className="text-xs text-ink-2">{f.body.length}/180</span></label>
      <label><span className="label">Opens</span><input className="input" value={f.link} onChange={(e) => { setF({ ...f, link: e.target.value }); setConfirming(false); }} /><span className="text-xs text-ink-2">A page of this site. /shop opens the shop; /shop#shop jumps to the products.</span></label>
      <div className="rounded-xl border border-line p-3 text-sm bg-surface-2">
        <p className="text-xs text-ink-2 mb-1">Preview</p>
        <p className="font-semibold">{f.title || "Title"}</p>
        <p>{f.body || "Message"}</p>
      </div>
      <button className={confirming ? "btn btn-danger" : "btn btn-primary"} disabled={disabled || pending}>
        {pending ? "Sending…" : confirming ? "Tap again to send to every subscribed phone" : "Send to customers"}
      </button>
      {disabled && <p className="text-sm text-ink-2">Upload the shop page and wait for the first customer to turn notifications on.</p>}
      <Msg r={r} />
    </form>
  );
}

export function ShopUpload() {
  const router = useRouter();
  const [r, setR] = useState<SendRes>({});
  const [busy, setBusy] = useState(false);
  // A file whose products are older than the live shop's waits here until the person confirms.
  const [older, setOlder] = useState<string | null>(null);
  async function send(html: string, force: boolean) {
    setBusy(true); setR({}); setOlder(null);
    try {
      const res = await fetch(`/api/shop/upload${force ? "?force=1" : ""}`, { method: "POST", headers: { "content-type": "text/html" }, body: html });
      const j = await res.json().catch(() => ({}));
      if (res.status === 409 && j.conflict === "older") { setOlder(html); setR({ error: j.error }); }
      else if (!res.ok) setR({ error: j.error ?? "Upload failed." });
      else { setR({ ok: "Shop updated. Customers see the new page within a minute." }); router.refresh(); }
    } catch { setR({ error: "Upload failed. Check your connection and try again." }); }
    setBusy(false);
  }
  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) await send(await file.text(), false);
  }
  return (
    <div>
      <label className="btn">
        {busy ? "Uploading…" : "Upload index.html"}
        <input type="file" accept=".html,text/html" className="sr-only" onChange={choose} disabled={busy} />
      </label>
      <Msg r={r} />
      {older && (
        <div className="flex flex-wrap gap-2 mt-2">
          <button className="btn btn-danger" disabled={busy} onClick={() => send(older, true)}>Upload anyway and replace the newer products</button>
          <button className="btn" disabled={busy} onClick={() => { setOlder(null); setR({}); }}>Keep the live shop</button>
        </div>
      )}
    </div>
  );
}
