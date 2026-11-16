/* Medora Care shop: lets a signed-in Owner or Manager use the shop's own ⚙ Admin on this site.
   "Save & publish" there writes straight to /shop, so every customer gets the new products and prices.
   Customers are not signed in, so for them nothing here does anything.
   /shop?admin=1 (how Shop products in the Command Center opens it) opens the Admin straight away.
   The live page is the only copy that counts: Save & publish sends the version this page was opened on,
   and if the shop changed since (an upload, or a save from another phone or tab), nothing is overwritten. */
(function () {
  if (window.claude) return;
  var ADMIN = /[?&]admin=1(&|$)/.test(location.search);
  var me = null;
  function check() {
    return me || (me = fetch("/api/shop/me", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : { canEdit: false }; })
      .catch(function () { return { canEdit: false }; }));
  }
  function fail(code) { var e = new Error(code); e.code = code; return e; }
  function version() {
    var m = document.querySelector('meta[name="medora-shop-version"]');
    return m ? m.getAttribute("content") || "" : "";
  }
  // A fresh address skips the copy the network keeps for a minute.
  function fresh() { return "/shop?" + (ADMIN ? "admin=1&" : "") + "v=" + Date.now(); }
  var apis = {
    user: function (m) { return { canEdit: function () { return !!m.canEdit; }, isOwner: function () { return !!m.canEdit; } }; },
    artifact: function () {
      return {
        publish: function (html) {
          var headers = { "content-type": "text/html" };
          var v = version();
          if (v) headers["x-shop-version"] = v;
          return fetch("/api/shop/upload", { method: "POST", credentials: "same-origin", headers: headers, body: html })
            .then(function (r) {
              if (r.status === 401 || r.status === 403) throw fail("not_writer");
              if (r.status === 413) throw fail("too_large");
              if (r.status === 409) {
                setTimeout(function () {
                  if (confirm("The shop was updated somewhere else after you opened this Admin, so your changes were not saved.\n\nOK loads the latest version (your changes here are lost; press Cancel, then Backup, to keep a copy first).\nCancel keeps this screen open."))
                    location.replace(fresh());
                }, 50);
                throw fail("conflict");
              }
              if (!r.ok) throw fail("error");
              setTimeout(function () { location.replace(fresh()); }, 600);
            });
        },
      };
    },
    downloads: function () {
      return {
        save: function (o) {
          var blob = o.data instanceof Blob ? o.data : new Blob([o.data], { type: "application/octet-stream" });
          var a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = o.filename || "download";
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
          return Promise.resolve();
        },
      };
    },
  };
  window.claude = {
    use: function (name) {
      return check().then(function (m) {
        if (name !== "user" && !m.canEdit) throw fail("not_granted");
        if (!apis[name]) throw fail("not_granted");
        return apis[name](m);
      });
    },
  };
  // Opens the Admin as soon as the shop has added its ⚙ Admin button (only for people who may edit).
  if (ADMIN) {
    var tries = 0;
    var t = setInterval(function () {
      var b = document.getElementById("admbtn");
      if (b) { clearInterval(t); if (!document.getElementById("adm")) b.click(); }
      else if (++tries > 75) clearInterval(t);
    }, 200);
  }
})();
