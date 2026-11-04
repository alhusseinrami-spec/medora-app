/* Medora Care shop: lets a signed-in Owner or Manager use the shop's own ⚙ Admin on this site.
   "Save & publish" there writes straight to /shop, so every customer gets the new products and prices.
   Customers are not signed in, so for them nothing here does anything. */
(function () {
  if (window.claude) return;
  var me = null;
  function check() {
    return me || (me = fetch("/api/shop/me", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : { canEdit: false }; })
      .catch(function () { return { canEdit: false }; }));
  }
  function fail(code) { var e = new Error(code); e.code = code; return e; }
  var apis = {
    user: function (m) { return { canEdit: function () { return !!m.canEdit; }, isOwner: function () { return !!m.canEdit; } }; },
    artifact: function () {
      return {
        publish: function (html) {
          return fetch("/api/shop/upload", { method: "POST", credentials: "same-origin", headers: { "content-type": "text/html" }, body: html })
            .then(function (r) {
              if (r.status === 401 || r.status === 403) throw fail("not_writer");
              if (r.status === 413) throw fail("too_large");
              if (!r.ok) throw fail("error");
              // A fresh address skips the copy the network keeps for a minute.
              setTimeout(function () { location.replace("/shop?v=" + Date.now()); }, 600);
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
})();
