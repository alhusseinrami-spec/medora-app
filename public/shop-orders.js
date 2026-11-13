/* Medora Care shop: My orders. Added to the shop page by the server, whatever index.html is uploaded.
   - When the customer taps "Send order on WhatsApp", the order is also saved here with a reference
     (MC-XXXXXX) that is added to the WhatsApp message. WhatsApp still opens exactly as before.
   - "My orders" shows each order's status (received, confirmed, to be delivered with the expected
     time, delivered, cancelled), its pro forma and invoice, and "Order again".
   The customer doesn't sign in: this phone keeps a random key (medora_ck) that identifies its orders. */
(function () {
  if (window.__medoraOrders) return;
  window.__medoraOrders = true;

  var KEY = "medora_ck", PROFILE = "medora_cp", PENDING = "medora_pending";
  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch { /* storage blocked: My orders still works for this visit */ }
    return null;
  }
  var ar = function () { return (document.documentElement.lang || "").slice(0, 2) === "ar"; };
  var T = {
    short: ["Orders", "طلباتي"],
    added2: ["Your earlier order is in the cart. Check it and send it on WhatsApp.", "طلبك السابق في السلة. راجعه وأرسله عبر واتساب."],
    title: ["My orders", "طلباتي"],
    close: ["Close", "إغلاق"],
    loading: ["Loading your orders…", "جارٍ تحميل طلباتك…"],
    offline: ["Couldn't load your orders. Check your connection and try again.", "تعذّر تحميل طلباتك. تحقق من الاتصال وحاول مجدداً."],
    retry: ["Try again", "حاول مجدداً"],
    empty: ["No orders yet. When you send an order on WhatsApp from this app, it appears here so you can follow it, get your pro forma and invoice, and order the same items again.", "لا توجد طلبات بعد. عندما ترسل طلباً عبر واتساب من هذا التطبيق، يظهر هنا لتتابعه وتستلم الفاتورة المبدئية والفاتورة وتعيد طلب نفس المنتجات."],
    PLACED: ["Received", "تم الاستلام"],
    CONFIRMED: ["Confirmed", "تم التأكيد"],
    TO_DELIVER: ["To be delivered", "قيد التوصيل"],
    DELIVERED: ["Delivered", "تم التسليم"],
    CANCELLED: ["Cancelled", "ملغى"],
    placedNote: ["We'll confirm availability and price with you shortly.", "سنؤكد معك التوفر والسعر قريباً."],
    eta: ["Expected", "الموعد المتوقع"],
    deliveredOn: ["Delivered", "تم التسليم في"],
    reason: ["Reason", "السبب"],
    items: ["items", "منتجات"],
    item1: ["item", "منتج"],
    showItems: ["Show items", "عرض المنتجات"],
    docs: ["Documents", "المستندات"],
    PROFORMA: ["📄 Pro forma", "📄 فاتورة مبدئية"],
    INVOICE: ["🧾 Invoice", "🧾 فاتورة"],
    noDocs: ["Your pro forma and invoice will appear here.", "ستظهر هنا الفاتورة المبدئية والفاتورة."],
    again: ["🔁 Order again", "🔁 اطلب مرة أخرى"],
    missing: ["No longer in the shop:", "لم يعد متوفراً في المتجر:"],
    none: ["These items are no longer in the shop. Message us on WhatsApp and we'll help.", "هذه المنتجات لم تعد متوفرة في المتجر. راسلنا على واتساب وسنساعدك."],
    you: ["Your details", "بياناتك"],
    change: ["Change", "تعديل"],
    other: ["Open My orders on another phone", "افتح طلباتي على هاتف آخر"],
    otherNote: ["Send this link to your other phone. Anyone with it can see your orders, so keep it to yourself.", "أرسل هذا الرابط إلى هاتفك الآخر. أي شخص يملكه يمكنه رؤية طلباتك، فاحتفظ به لنفسك."],
    copy: ["Copy link", "نسخ الرابط"],
    copied: ["Link copied.", "تم نسخ الرابط."],
    askTitle: ["Follow your order", "تابع طلبك"],
    askNote: ["Once, so you can follow this order in My orders, receive your pro forma and invoice, and reorder in one tap.", "مرة واحدة فقط، لتتابع طلبك في «طلباتي»، وتستلم الفاتورة المبدئية والفاتورة، وتعيد الطلب بضغطة واحدة."],
    name: ["Name or pharmacy / clinic", "الاسم أو اسم الصيدلية / العيادة"],
    phone: ["Phone (WhatsApp)", "رقم الهاتف (واتساب)"],
    go: ["Continue to WhatsApp", "المتابعة إلى واتساب"],
    save: ["Save", "حفظ"],
    skip: ["Send without saving it", "إرسال بدون حفظ"],
    needName: ["Enter your name.", "أدخل اسمك."],
    needPhone: ["Enter your phone number.", "أدخل رقم هاتفك."],
    saved: ["Order {ref} saved in My orders.", "تم حفظ الطلب {ref} في «طلباتي»."],
    refLine: ["Order no.: ", "رقم الطلب: "],
  };
  var t = function (k) { return (T[k] || [k, k])[ar() ? 1 : 0]; };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function fmt(d, withTime) {
    try {
      var o = { timeZone: "Asia/Beirut", day: "numeric", month: "short", year: "numeric" };
      if (withTime) { o.weekday = "short"; o.hour = "2-digit"; o.minute = "2-digit"; delete o.year; }
      return new Date(d).toLocaleString(ar() ? "ar-LB" : "en-GB", o);
    } catch { return String(d).slice(0, 16).replace("T", " "); }
  }

  // ---- The phone's key and the customer's details ----
  function b64url(bytes) { var s = ""; for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
  function key(make) {
    var k = ls(KEY);
    if (!k && make) { var b = new Uint8Array(32); crypto.getRandomValues(b); k = b64url(b); ls(KEY, k); }
    return k;
  }
  function profile() { try { var p = JSON.parse(ls(PROFILE) || "null"); return p && p.name && p.phone ? p : null; } catch { return null; } }
  function newRef() { var a = "ABCDEFGHJKMNPQRSTUVWXYZ23456789", b = new Uint8Array(6), s = "MC-"; crypto.getRandomValues(b); for (var i = 0; i < 6; i++) s += a[b[i] % a.length]; return s; }

  // A My orders link from Medora (/shop?mo=KEY) puts that customer's orders on this phone.
  var openOnLoad = /#my-orders/.test(location.hash);
  var m = /[?&]mo=([A-Za-z0-9_-]{32,64})/.exec(location.search);
  if (m) {
    if (ls(KEY) !== m[1]) { ls(KEY, m[1]); ls(PROFILE, null); }
    openOnLoad = true;
    try { history.replaceState(null, "", location.pathname + "#my-orders"); } catch { /* old browser */ }
  }

  // ---- Styles ----
  var css = document.createElement("style");
  css.id = "medora-orders-css";
  css.textContent = [
    "#mo-btn{border:1px solid var(--bd,#dbe7e9);background:var(--card,#fff);color:var(--prd,#0f5f66);border-radius:99px;padding:7px 12px;font:inherit;font-weight:600;font-size:13px;cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:6px;line-height:1.2}",
    "#mo-btn b{background:#e8604c;color:#fff;border-radius:99px;min-width:18px;height:18px;display:inline-grid;place-items:center;font-size:11px;padding:0 4px}",
    "#mo-btn.float{position:fixed;inset-inline-end:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:35;box-shadow:0 6px 20px rgba(0,0,0,.18)}",
    "@media(max-width:420px){#mo-btn{padding:6px 9px;font-size:12px;gap:4px}}@media(max-width:374px){#mo-btn .mo-l{display:none}}",
    "#mo-dr{display:block;width:100%;margin-top:8px;border:1px solid var(--bd,#dbe7e9);background:transparent;color:var(--prd,#0f5f66);border-radius:10px;padding:9px;font:inherit;font-size:14px;font-weight:600;cursor:pointer}",
    "#mo{position:fixed;inset:0;z-index:46;background:var(--bg,#f1f7f8);color:var(--tx,#12363b);display:none;flex-direction:column;font-family:inherit;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}",
    "#mo.open{display:flex}",
    "#mo .mo-h{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;background:var(--card,#fff);border-bottom:1px solid var(--bd,#dbe7e9)}",
    "#mo .mo-h b{font-size:18px}",
    "#mo .mo-x{border:0;background:transparent;color:inherit;font-size:22px;line-height:1;padding:6px 10px;cursor:pointer}",
    "#mo .mo-b{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:16px;display:grid;gap:12px;align-content:start;max-width:680px;width:100%;margin:0 auto;box-sizing:border-box}",
    "#mo .mo-c{background:var(--card,#fff);border:1px solid var(--bd,#dbe7e9);border-radius:16px;padding:14px;display:grid;gap:10px}",
    "#mo .mo-r{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}",
    "#mo .mo-ref{font-weight:700;font-size:16px;unicode-bidi:isolate;direction:ltr}",
    "#mo .mo-mu{color:var(--mu,#5d7a7e);font-size:13px}",
    "#mo .mo-s{display:inline-block;border-radius:99px;padding:3px 10px;font-size:12px;font-weight:700;background:var(--soft,#e4f3f5);color:var(--prd,#0f5f66)}",
    "#mo .mo-s.PLACED{background:#fff1dc;color:#9a5b00}#mo .mo-s.DELIVERED{background:#e3f6ea;color:#1c7a3f}#mo .mo-s.CANCELLED{background:#fde7e4;color:#b3261e}",
    "#mo .mo-steps{display:grid;grid-template-columns:repeat(4,1fr);gap:4px}",
    "#mo .mo-steps i{display:block;height:5px;border-radius:3px;background:var(--bd,#dbe7e9)}#mo .mo-steps i.on{background:var(--prd,#0f5f66)}",
    "#mo .mo-steps span{display:block;font-size:11px;color:var(--mu,#5d7a7e);margin-top:4px;line-height:1.25}",
    "#mo .mo-eta{background:var(--soft,#e4f3f5);border-radius:10px;padding:8px 10px;font-weight:600;font-size:14px}",
    "#mo details summary{cursor:pointer;font-size:14px;color:var(--prd,#0f5f66);font-weight:600}",
    "#mo ul{margin:8px 0 0;padding:0;list-style:none;display:grid;gap:6px;font-size:14px}",
    "#mo li code{font-family:inherit;font-size:12px;color:var(--mu,#5d7a7e);unicode-bidi:isolate;direction:ltr}",
    "#mo .mo-d{display:flex;flex-wrap:wrap;gap:8px}",
    "#mo .mo-d a,#mo .mo-btn2{border:1px solid var(--bd,#dbe7e9);background:var(--card,#fff);color:var(--prd,#0f5f66);border-radius:10px;padding:9px 12px;font:inherit;font-size:14px;font-weight:600;text-decoration:none;cursor:pointer}",
    "#mo .mo-p,#mo-ask .mo-p{border:0;border-radius:10px;padding:11px 14px;background:var(--prd,#0f5f66);color:#fff;font:inherit;font-size:15px;font-weight:600;cursor:pointer}",
    "#mo input,#mo-ask input{width:100%;box-sizing:border-box;border:1px solid var(--bd,#dbe7e9);border-radius:10px;padding:10px 12px;font:inherit;font-size:16px;background:var(--card,#fff);color:var(--tx,#12363b)}",
    "#mo-ask{position:fixed;inset:0;z-index:60;background:rgba(0,0,0,.45);display:grid;place-items:end center;padding:16px;font-family:inherit}",
    "#mo-ask form{background:var(--card,#fff);color:var(--tx,#12363b);border-radius:16px;padding:18px;max-width:420px;width:100%;box-sizing:border-box;display:grid;gap:10px;margin-bottom:env(safe-area-inset-bottom,0px)}",
    "#mo-ask label{display:grid;gap:4px;font-size:13px;font-weight:600}",
    "#mo-ask .mo-p{width:100%}",
    "#mo-ask .mo-skip{border:0;background:transparent;color:var(--mu,#5d7a7e);font:inherit;font-size:13px;text-decoration:underline;cursor:pointer;padding:4px}",
    "#mo-ask .mo-err{color:#b3261e;font-size:13px;font-weight:600;min-height:1em;margin:0}",
    "#mo-toast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(150px + env(safe-area-inset-bottom,0px));z-index:70;background:#12363b;color:#fff;border-radius:12px;padding:11px 16px;font-family:inherit;font-size:14px;max-width:calc(100vw - 32px);box-shadow:0 8px 24px rgba(0,0,0,.25)}",
  ].join("\n");
  document.head.appendChild(css);

  function toast(msg) {
    var old = document.getElementById("mo-toast"); if (old) old.remove();
    var d = document.createElement("div"); d.id = "mo-toast"; d.setAttribute("role", "status"); d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function () { d.remove(); }, 4500);
  }

  // ---- The My orders button ----
  var btn = document.createElement("button");
  btn.id = "mo-btn"; btn.type = "button";
  var cartBtn = document.getElementById("cb");
  if (cartBtn && cartBtn.parentNode) cartBtn.parentNode.insertBefore(btn, cartBtn);
  else { btn.className = "float"; document.body.appendChild(btn); }
  var openCount = 0;
  function renderBtn() {
    btn.innerHTML = "<span aria-hidden='true'>📦</span><span class='mo-l'></span>" + (openCount ? "<b></b>" : "");
    btn.querySelector(".mo-l").textContent = t("short");
    if (drBtn) drBtn.textContent = "📦 " + t("title");
    btn.setAttribute("aria-label", t("title"));
    if (openCount) btn.querySelector("b").textContent = String(openCount);
  }
  btn.onclick = function () { open(); };
  // Also under "Send order on WhatsApp" in the order drawer.
  var drBtn = null, wa = document.getElementById("wa");
  if (wa && wa.parentNode) {
    drBtn = document.createElement("button"); drBtn.id = "mo-dr"; drBtn.type = "button";
    wa.parentNode.insertBefore(drBtn, wa.nextSibling);
    drBtn.onclick = function () { try { openCart(false); } catch { /* other shop version */ } open(); };
  }

  // ---- The panel ----
  var panel = document.createElement("div");
  panel.id = "mo"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-modal", "true");
  document.body.appendChild(panel);
  var data = null, state = "idle", timer = null;

  function load() {
    var k = key(false);
    if (!k) { data = { customer: null, orders: [] }; state = "ok"; return Promise.resolve(); }
    if (!data) state = "loading";
    return fetch("/api/shop/orders", { headers: { "x-medora-customer": k }, cache: "no-store", credentials: "same-origin" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (j) {
        data = j; state = "ok";
        if (j.customer && !profile()) ls(PROFILE, JSON.stringify({ name: j.customer.name, phone: j.customer.phone }));
        openCount = (j.orders || []).filter(function (o) { return o.status === "PLACED" || o.status === "CONFIRMED" || o.status === "TO_DELIVER"; }).length;
        renderBtn();
      })
      .catch(function () { if (!data) state = "error"; });
  }

  var STEPS = ["PLACED", "CONFIRMED", "TO_DELIVER", "DELIVERED"];
  function orderCard(o, i) {
    var n = o.lines.reduce(function (s, l) { return s + l.qty; }, 0);
    var step = STEPS.indexOf(o.status);
    var h = "<div class='mo-c'>";
    h += "<div class='mo-r'><span class='mo-ref'>" + esc(o.ref) + "</span><span class='mo-s " + esc(o.status) + "'>" + esc(t(o.status)) + "</span></div>";
    h += "<div class='mo-mu'>" + esc(fmt(o.createdAt)) + " · " + o.lines.length + " " + esc(o.lines.length === 1 ? t("item1") : t("items")) + (n !== o.lines.length ? " (" + n + ")" : "") + "</div>";
    if (o.status !== "CANCELLED") {
      h += "<div class='mo-steps' aria-hidden='true'>" + STEPS.map(function (s, j) { return "<div><i class='" + (j <= step ? "on" : "") + "'></i><span>" + esc(t(s)) + "</span></div>"; }).join("") + "</div>";
    }
    if (o.status === "PLACED") h += "<div class='mo-mu'>" + esc(t("placedNote")) + "</div>";
    if (o.status === "TO_DELIVER" && o.estimatedAt) h += "<div class='mo-eta'>🚚 " + esc(t("eta")) + ": " + esc(fmt(o.estimatedAt, true)) + "</div>";
    if (o.status === "DELIVERED" && o.deliveredAt) h += "<div class='mo-mu'>✓ " + esc(t("deliveredOn")) + " " + esc(fmt(o.deliveredAt, true)) + "</div>";
    if (o.status === "CANCELLED" && o.cancelReason) h += "<div class='mo-mu'>" + esc(t("reason")) + ": " + esc(o.cancelReason) + "</div>";
    h += "<details><summary>" + esc(t("showItems")) + "</summary><ul>" + o.lines.map(function (l) {
      return "<li>" + l.qty + " × " + esc((ar() && l.nameAr) || l.name) + (l.code ? " <code>" + esc(l.code) + "</code>" : "") + "</li>";
    }).join("") + "</ul></details>";
    h += o.documents.length
      ? "<div class='mo-d'>" + o.documents.map(function (d) { return "<a href='" + esc(d.url) + "' target='_blank' rel='noopener'>" + esc(t(d.kind)) + "</a>"; }).join("") + "</div>"
      : (o.status === "CANCELLED" ? "" : "<div class='mo-mu'>" + esc(t("noDocs")) + "</div>");
    h += "<div><button type='button' class='mo-btn2' data-again='" + i + "'>" + esc(t("again")) + "</button></div>";
    return h + "</div>";
  }

  function render() {
    panel.dir = ar() ? "rtl" : "ltr";
    var h = "<div class='mo-h'><b>" + esc(t("title")) + "</b><button type='button' class='mo-x' aria-label='" + esc(t("close")) + "'>✕</button></div><div class='mo-b'>";
    if (state === "loading") h += "<p class='mo-mu'>" + esc(t("loading")) + "</p>";
    else if (state === "error") h += "<p class='mo-mu'>" + esc(t("offline")) + "</p><div><button type='button' class='mo-btn2' data-retry='1'>" + esc(t("retry")) + "</button></div>";
    else {
      var orders = (data && data.orders) || [];
      h += orders.length ? orders.map(orderCard).join("") : "<div class='mo-c'><p style='margin:0'>" + esc(t("empty")) + "</p></div>";
      var p = profile();
      if (p || key(false)) {
        h += "<div class='mo-c'>";
        if (p) h += "<div class='mo-r'><div><div class='mo-mu'>" + esc(t("you")) + "</div><div>" + esc(p.name) + " · <span dir='ltr'>" + esc(p.phone) + "</span></div></div><button type='button' class='mo-btn2' data-edit='1'>" + esc(t("change")) + "</button></div>";
        if (key(false) && orders.length) h += "<details><summary>" + esc(t("other")) + "</summary><p class='mo-mu'>" + esc(t("otherNote")) + "</p><input readonly dir='ltr' value='" + esc(location.origin + "/shop?mo=" + key(false) + "#my-orders") + "' aria-label='" + esc(t("other")) + "'><div style='margin-top:8px'><button type='button' class='mo-btn2' data-copy='1'>" + esc(t("copy")) + "</button></div></details>";
        h += "</div>";
      }
    }
    panel.innerHTML = h + "</div>";
  }

  panel.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("button") : null;
    if (!el) return;
    if (el.classList.contains("mo-x")) return close();
    if (el.dataset.retry) { state = "loading"; render(); load().then(render); return; }
    if (el.dataset.again) return reorder(data.orders[Number(el.dataset.again)]);
    if (el.dataset.edit) return ask(profile(), false, function () { render(); });
    if (el.dataset.copy) {
      var link = location.origin + "/shop?mo=" + key(false) + "#my-orders";
      if (navigator.share) navigator.share({ title: "Medora Care", url: link }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(link).then(function () { toast(t("copied")); }, function () {});
      else { var inp = panel.querySelector("input[readonly]"); if (inp) { inp.select(); document.execCommand("copy"); toast(t("copied")); } }
    }
  });

  function open() {
    panel.classList.add("open");
    document.documentElement.style.overflow = "hidden";
    render();
    load().then(render);
    clearInterval(timer);
    timer = setInterval(function () { if (!document.hidden) load().then(render); }, 30000);
    if (location.hash !== "#my-orders") { try { history.replaceState(null, "", location.pathname + location.search + "#my-orders"); } catch { /* old browser */ } }
  }
  function close() {
    panel.classList.remove("open");
    document.documentElement.style.overflow = "";
    clearInterval(timer);
    if (location.hash === "#my-orders") { try { history.replaceState(null, "", location.pathname + location.search); } catch { /* old browser */ } }
  }
  window.addEventListener("hashchange", function () { if (location.hash === "#my-orders") open(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && panel.classList.contains("open")) close(); });

  // ---- Order again: the same items go back into the shop's order, at today's prices ----
  function shop() {
    var s = {};
    /* global cart, byId, save, draw, drawCart, openCart */
    try { s.cart = cart; } catch { /* page without a cart */ }
    try { s.byId = byId; } catch { /* page without a catalogue */ }
    return s;
  }
  function reorder(o) {
    if (!o) return;
    var s = shop(), missing = [], added = 0;
    var live = s.cart && typeof s.cart === "object" && s.byId;
    var c = live ? s.cart : (function () { try { return JSON.parse(ls("mc") || "{}"); } catch { return {}; } })();
    var byOld = {};
    if (s.byId) Object.keys(s.byId).forEach(function (id) { var p = s.byId[id]; if (p && p.o) byOld[p.o] = id; });
    o.lines.forEach(function (l) {
      var id = l.code && s.byId ? (s.byId[l.code] ? l.code : byOld[l.code]) : (!s.byId && l.code ? l.code : null);
      if (id) { c[id] = l.qty; added++; } else missing.push((ar() && l.nameAr) || l.name);
    });
    if (!added) return toast(t("none"));
    close();
    if (live) {
      try { save(); } catch { ls("mc", JSON.stringify(c)); }
      try { draw(); } catch { /* not this shop version */ }
      try { drawCart(); } catch { /* not this shop version */ }
      try { openCart(true); } catch { var cb = document.getElementById("cb"); if (cb) cb.click(); }
    } else {
      ls("mc", JSON.stringify(c));
      location.reload();
      return;
    }
    toast(t("added2") + (missing.length ? " " + t("missing") + " " + missing.join("، ") : ""));
  }

  // ---- Saving the order when it is sent on WhatsApp ----
  function cartLines() {
    var s = shop(), showPrices = false;
    try { /* global SHOW_PRICES */ showPrices = !!SHOW_PRICES; } catch { /* prices hidden */ }
    var c = s.cart && typeof s.cart === "object" ? s.cart : (function () { try { return JSON.parse(ls("mc") || "{}"); } catch { return {}; } })();
    return Object.keys(c).filter(function (k) { return c[k] > 0; }).map(function (k) {
      var p = s.byId && s.byId[k];
      return { code: k, name: (p && p.n) || k, nameAr: (p && p.a) || "", qty: Math.round(c[k]), price: showPrices && p && p.pr ? p.pr : 0 };
    });
  }
  function withRef(href, ref) {
    var mm = /^([^?]*)\?text=([^&#]*)(.*)$/.exec(href);
    var add = "\n\n" + t("refLine") + ref;
    if (!mm) return href;
    var text = ""; try { text = decodeURIComponent(mm[2]); } catch { text = mm[2]; }
    text = text.replace(/\n\n(?:Order no\.: |رقم الطلب: )MC-[A-Z0-9]{6}$/, ""); // the same order sent twice
    return mm[1] + "?text=" + encodeURIComponent(text + add) + mm[3];
  }
  function pending() { try { return JSON.parse(ls(PENDING) || "[]"); } catch { return []; } }
  function post(order) {
    var list = pending().filter(function (x) { return x.ref !== order.ref; }); list.push(order); ls(PENDING, JSON.stringify(list.slice(-10)));
    var body = JSON.stringify(order);
    return fetch("/api/shop/orders", { method: "POST", headers: { "content-type": "application/json" }, body: body, keepalive: body.length < 60000, credentials: "same-origin" })
      .then(function (r) {
        if (r.ok || r.status === 400) ls(PENDING, JSON.stringify(pending().filter(function (x) { return x.ref !== order.ref; })));
        if (r.ok) load().then(function () { if (panel.classList.contains("open")) render(); });
      }).catch(function () { /* kept in medora_pending and sent next time */ });
  }
  function send(a, prof, openIt) {
    var lines = cartLines();
    if (!lines.length) return;
    var ref = newRef();
    var url = withRef(a.href, ref);
    a.href = url; // the shop rebuilds the link on every change, so this only affects this tap
    post({ key: key(true), ref: ref, name: prof.name, phone: prof.phone, lang: ar() ? "ar" : "en", lines: lines });
    if (openIt) { var w = window.open(url, a.target || "_blank"); if (!w) location.href = url; }
    setTimeout(function () { toast(t("saved").replace("{ref}", ref)); }, 400);
  }
  var bypass = false;
  document.addEventListener("click", function (e) {
    if (bypass) return;
    var a = e.target && e.target.closest ? e.target.closest("a") : null;
    if (!a || !a.href) return;
    if (!(a.id === "wa" || (a.closest("#dr") && /wa\.me\//.test(a.href)))) return;
    if (!/\?text=/.test(a.href) || !cartLines().length) return; // empty order
    var p = profile();
    if (p) return send(a, p, false);
    e.preventDefault();
    e.stopPropagation();
    ask(null, true, function (prof) {
      if (prof) return send(a, prof, true);
      bypass = true; a.click(); bypass = false; // "Send without saving it"
    });
  }, true);

  // Name and phone, asked once.
  function ask(cur, sending, done) {
    var o = document.createElement("div");
    o.id = "mo-ask"; o.dir = ar() ? "rtl" : "ltr"; o.setAttribute("role", "dialog"); o.setAttribute("aria-modal", "true");
    o.innerHTML = "<form novalidate><b style='font-size:17px'></b><p class='mo-mu' style='margin:0;font-size:14px;color:var(--mu,#5d7a7e)'></p>" +
      "<label><span></span><input name='n' autocomplete='name' maxlength='100'></label>" +
      "<label><span></span><input name='p' type='tel' inputmode='tel' autocomplete='tel' maxlength='30' dir='ltr' placeholder='+961 3 123 456'></label>" +
      "<p class='mo-err' role='alert'></p><button class='mo-p' type='submit'></button>" + (sending ? "<button class='mo-skip' type='button'></button>" : "") + "</form>";
    var f = o.querySelector("form"), sp = o.querySelectorAll("label span");
    f.querySelector("b").textContent = t("askTitle");
    f.querySelector("p").textContent = t("askNote");
    sp[0].textContent = t("name"); sp[1].textContent = t("phone");
    f.n.value = (cur && cur.name) || ""; f.p.value = (cur && cur.phone) || "";
    f.querySelector(".mo-p").textContent = sending ? t("go") : t("save");
    var skip = f.querySelector(".mo-skip");
    if (skip) { skip.textContent = t("skip"); skip.onclick = function () { o.remove(); done(null); }; }
    o.addEventListener("click", function (e) { if (e.target === o) o.remove(); });
    f.onsubmit = function (e) {
      e.preventDefault();
      var name = f.n.value.trim(), phone = f.p.value.trim();
      var err = f.querySelector(".mo-err");
      if (!name) { err.textContent = t("needName"); return f.n.focus(); }
      if (phone.replace(/\D/g, "").length < 7) { err.textContent = t("needPhone"); return f.p.focus(); }
      var prof = { name: name, phone: phone };
      ls(PROFILE, JSON.stringify(prof));
      o.remove();
      done(prof);
    };
    document.body.appendChild(o);
    setTimeout(function () { (f.n.value ? f.p : f.n).focus(); }, 50);
  }

  // Re-label when the shop's language button is pressed.
  new MutationObserver(function () { renderBtn(); if (panel.classList.contains("open")) render(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });

  renderBtn();
  // Orders that couldn't be sent last time (no connection) go now.
  pending().forEach(function (o) { post(o); });
  if (openOnLoad) open(); else if (key(false)) load();
})();
