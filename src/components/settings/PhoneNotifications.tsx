"use client";
import { useEffect, useState } from "react";

type State = "checking" | "unsupported" | "off" | "on" | "denied";

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const sameKey = (a: ArrayBuffer | null | undefined, b: Uint8Array) => !!a && a.byteLength === b.byteLength && new Uint8Array(a).every((x, i) => x === b[i]);

async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error ?? "Something went wrong.");
  return d;
}

const register = () => navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });

export function PhoneNotifications() {
  const [state, setState] = useState<State>("checking");
  const [iosHint, setIosHint] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({});

  useEffect(() => {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const installed = matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIosHint(ios && !installed);
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) { setState("unsupported"); return; }
    if (Notification.permission === "denied") { setState("denied"); return; }
    register()
      .then((reg) => reg.pushManager.getSubscription())
      .then(async (sub) => {
        setState(sub && Notification.permission === "granted" ? "on" : "off");
        // Keep the server's copy current (it drops subscriptions the push service has expired).
        if (sub) await post("/api/push/subscribe", sub.toJSON()).catch(() => {});
      })
      .catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setBusy(true); setMsg({});
    try {
      // Ask first: iPhone only shows the prompt straight from the tap.
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { setState(perm === "denied" ? "denied" : "off"); return; }
      const reg = await register();
      await navigator.serviceWorker.ready;
      const { publicKey } = await fetch("/api/push/key", { cache: "no-store" }).then((r) => r.json());
      if (!publicKey) throw new Error("The server has no push key yet. Try again in a moment.");
      const key = keyBytes(publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, key)) { await sub.unsubscribe(); sub = null; }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await post("/api/push/subscribe", sub.toJSON());
      setState("on");
      setMsg({ ok: "Phone notifications are on for this device." });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Couldn't turn on notifications." });
    } finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMsg({});
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await post("/api/push/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setState("off");
      setMsg({ ok: "Phone notifications are off for this device." });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Couldn't turn off notifications." });
    } finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMsg({});
    try {
      await post("/api/push/test", {});
      setMsg({ ok: "Test sent. It should arrive in a few seconds." });
    } catch (e) {
      setMsg({ error: e instanceof Error ? e.message : "Couldn't send the test." });
    } finally { setBusy(false); }
  }

  const status = { checking: ["Checking…", "chip"], unsupported: ["Not available here", "chip chip-warn"], off: ["Off", "chip"], on: ["On", "chip chip-ok"], denied: ["Blocked", "chip chip-warn"] }[state];

  return (
    <div className="space-y-3">
      <p className="text-sm">This device: <span className={status[1]}>{status[0]}</span></p>
      {iosHint && <p className="text-sm text-ink-2">On iPhone: Share → Add to Home Screen, then open Medora from there.</p>}
      {state === "denied" && <p className="text-sm text-warn">Notifications are blocked for Medora. Allow them in your phone or browser settings, then come back here.</p>}
      {state === "unsupported" && !iosHint && <p className="text-sm text-muted">This browser can&apos;t receive push notifications.</p>}
      {(state === "off" || state === "on") && (
        <div className="flex flex-wrap gap-2">
          {state === "off" && <button className="btn btn-primary" disabled={busy} onClick={enable}>Enable</button>}
          {state === "on" && <button className="btn" disabled={busy} onClick={test}>Send test</button>}
          {state === "on" && <button className="btn btn-danger" disabled={busy} onClick={disable}>Disable</button>}
        </div>
      )}
      {msg.error && <p role="alert" className="err">{msg.error}</p>}
      {msg.ok && <p role="status" className="text-sm font-semibold text-ok">{msg.ok}</p>}
    </div>
  );
}
