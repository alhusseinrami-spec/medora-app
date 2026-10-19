import type { MetadataRoute } from "next";

// Lets iPhone and Android add Medora to the Home Screen. iOS only allows Web Push from a Home Screen app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Medora",
    short_name: "Medora",
    description: "Medora Care executive assistant",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0b2545",
    theme_color: "#0b2545",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
