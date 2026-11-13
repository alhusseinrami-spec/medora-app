/* Medora Care shop: the "Get offers on your phone" button. Added to the shop page by the server. */
(function () {
  var KEY = window.MEDORA_PUSH_KEY;
  if (!KEY) return;
  var ar = function () { return (document.documentElement.lang || "").slice(0, 2) === "ar"; };
  var T = {
    on: ["🔔 Get offers on your phone", "🔔 استلم العروض على هاتفك"],
    done: ["✓ Notifications are on", "✓ الإشعارات مفعّلة"],
    off: ["Turn off notifications", "إيقاف الإشعارات"],
    blocked: ["Notifications are blocked for this site. Allow them in your browser settings, then try again.", "الإشعارات محظورة لهذا الموقع. اسمح بها من إعدادات المتصفح ثم حاول مجدداً."],
    fail: ["Could not turn on notifications. Please try again.", "تعذّر تفعيل الإشعارات. حاول مجدداً."],
    thanks: ["Thank you! We'll send you new products and offers.", "شكراً! سنرسل لك المنتجات والعروض الجديدة."],
    ios: ["On iPhone: tap the Share button ⬆️, choose “Add to Home Screen”, then open Medora Care from your home screen and tap 🔔 again.", "على الآيفون: اضغط زر المشاركة ⬆️، اختر «إضافة إلى الشاشة الرئيسية»، ثم افتح Medora Care من الشاشة الرئيسية واضغط 🔔 مجدداً."],
    close: ["OK", "حسناً"],
  };
  var t = function (k) { return T[k][ar() ? 1 : 0]; };
  var ua = navigator.userAgent || "";
  var isIOS = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  var standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  var supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported && !(isIOS && !standalone)) return; // nothing this browser can do

  var css = document.createElement("style");
  css.textContent = "#mpush{position:fixed;inset-inline-start:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:35;border:0;border-radius:99px;padding:11px 16px;font-family:inherit;font-size:14px;font-weight:600;line-height:1.2;background:#e8604c;color:#fff;box-shadow:0 6px 20px rgba(0,0,0,.22);cursor:pointer;max-width:calc(100vw - 28px)}body:has(#admbtn) #mpush{bottom:calc(66px + env(safe-area-inset-bottom,0px))}#mpush.on{background:#fff;color:#0f5f66;border:1px solid #dbe7e9;box-shadow:none;font-weight:500}#mpushm{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);display:grid;place-items:end center;padding:16px}#mpushm div{background:#fff;color:#12363b;border-radius:16px;padding:18px;max-width:420px;width:100%;font-family:inherit;font-size:15px;line-height:1.55;margin-bottom:env(safe-area-inset-bottom,0px)}#mpushm button{margin-top:12px;width:100%;border:0;border-radius:10px;padding:11px;background:#0f5f66;color:#fff;font-family:inherit;font-size:15px;font-weight:600}";
  document.head.appendChild(css);
  var btn = document.createElement("button");
  btn.id = "mpush";
  btn.type = "button";
  document.body.appendChild(btn);

  function say(msg) {
    var m = document.createElement("div");
    m.id = "mpushm";
    m.setAttribute("role", "dialog");
    m.innerHTML = "<div><p style='margin:0'></p><button type='button'></button></div>";
    m.querySelector("p").textContent = msg;
    var b = m.querySelector("button");
    b.textContent = t("close");
    m.onclick = function (e) { if (e.target === m || e.target === b) m.remove(); };
    document.body.appendChild(m);
    b.focus();
  }
  function keyBytes(b64) {
    var s = (b64 + "===".slice((b64.length + 3) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(s), out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
  function send(method, data) {
    // Links this phone to its My orders, so order updates arrive here too.
    try { var ck = localStorage.getItem("medora_ck"); if (ck && method === "POST") data.customer = ck; } catch { /* storage blocked */ }
    return fetch("/api/push/subscribe", { method: method, headers: { "content-type": "application/json" }, body: JSON.stringify(data) })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); });
  }
  var reg = null, sub = null;
  function render() {
    btn.className = sub ? "on" : "";
    btn.textContent = sub ? t("done") : t("on");
    btn.title = sub ? t("off") : "";
  }

  btn.onclick = function () {
    if (!supported) return say(t("ios"));
    if (sub) {
      if (!confirm(t("off") + "?")) return;
      var ep = sub.endpoint;
      sub.unsubscribe().catch(function () {}).then(function () { return send("DELETE", { endpoint: ep }).catch(function () {}); })
        .then(function () { sub = null; render(); });
      return;
    }
    if (Notification.permission === "denied") return say(t("blocked"));
    btn.disabled = true;
    var opts = { userVisibleOnly: true, applicationServerKey: keyBytes(KEY) };
    // iPhone only allows subscribe() during the tap itself, so call it straight away when the
    // service worker is already running; subscribe() also asks for permission when needed.
    var start = reg && reg.active
      ? reg.pushManager.subscribe(opts)
      : Notification.requestPermission().then(function (p) {
          if (p !== "granted") throw "denied";
          return Promise.resolve(reg || navigator.serviceWorker.register("/shop-sw.js", { scope: "/shop" }))
            .then(function (r) { reg = r; return navigator.serviceWorker.ready; })
            .then(function (r) { return r.pushManager.subscribe(opts); });
        });
    start.then(function (s) {
      return send("POST", { subscription: s.toJSON(), lang: ar() ? "ar" : "en" }).then(function () { sub = s; render(); say(t("thanks")); });
    }).catch(function (e) {
      var denied = e === "denied" || (e && e.name === "NotAllowedError" && Notification.permission !== "granted");
      say(denied ? t("blocked") : t("fail") + (e && (e.name || e.message) ? " (" + (e.name || "") + (e.message ? ": " + e.message : "") + ")" : ""));
    }).then(function () { btn.disabled = false; });
  };

  // Re-label when the shop's language button is pressed.
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  if (!supported) return render();
  navigator.serviceWorker.register("/shop-sw.js", { scope: "/shop" }).then(function (r) {
    reg = r;
    return r.pushManager.getSubscription();
  }).then(function (s) {
    sub = s;
    // Keep the server's copy fresh (the phone can change its address).
    if (s && Notification.permission === "granted") send("POST", { subscription: s.toJSON(), lang: ar() ? "ar" : "en" }).catch(function () {});
  }).catch(function () {}).then(render);
})();
