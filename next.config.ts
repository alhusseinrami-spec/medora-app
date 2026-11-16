import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(self), microphone=(self)" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    // Everything loads from this app only, except OpenStreetMap tiles. Inline scripts are Next's own bootstrap and the theme script.
    value: [
      "default-src 'self'",
      `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
      "style-src 'self' 'unsafe-inline'",
      // Map tiles for the field sales map.
      "img-src 'self' data: blob: https://tile.openstreetmap.org",
      "font-src 'self'",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

// The public shop may be shown inside this app (Shop products opens its Admin there), never inside another site.
const shopHeaders = securityHeaders.map((h) =>
  h.key === "X-Frame-Options" ? { ...h, value: "SAMEORIGIN" }
  : h.key === "Content-Security-Policy" ? { ...h, value: h.value.replace("frame-ancestors 'none'", "frame-ancestors 'self'") }
  : h);

const nextConfig: NextConfig = {
  // pdfkit reads its font data from its own folder, so it stays a normal Node package.
  serverExternalPackages: ["@node-rs/argon2", "pdfkit"],
  // Fonts embedded in the pro forma PDF (made on the shop order page).
  outputFileTracingIncludes: { "/customers/orders/**": ["./src/assets/fonts/*.ttf"] },
  turbopack: {
    rules: {
      "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" },
    },
  },
  async headers() {
    // The later entry wins for /shop.
    return [{ source: "/:path*", headers: securityHeaders }, { source: "/shop", headers: shopHeaders }];
  },
};

export default nextConfig;
