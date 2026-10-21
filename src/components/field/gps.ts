// Shared by server pages and client components; getFix only works in the browser.
export type Fix = { lat: number; lng: number; accuracy: number };

// One fresh, high-accuracy position from the phone. Rejects with a sentence the rep can act on.
export function getFix(timeoutMs = 20000): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return reject(new Error("This browser can't share your location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) => reject(new Error(
        e.code === e.PERMISSION_DENIED ? "Location is blocked. Allow location for this site in your browser settings, then try again."
          : e.code === e.TIMEOUT ? "Your location took too long. Step outside or near a window and try again."
          : "Your location isn't available right now. Try again in a moment.",
      )),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 15000 },
    );
  });
}

export const STAGES = [
  { v: "LEAD", label: "Lead", color: "#64748b", chip: "" },
  { v: "PROSPECT", label: "Prospect", color: "#2563eb", chip: "chip-blue" },
  { v: "CUSTOMER", label: "Customer", color: "#0f8b8d", chip: "chip-teal" },
  { v: "CHURNED", label: "Churned", color: "#c2362b", chip: "chip-danger" },
] as const;
export type Stage = (typeof STAGES)[number]["v"];
export const stageOf = (v: string) => STAGES.find((s) => s.v === v) ?? STAGES[0];

export const PLACE_TYPES = ["Clinic", "Hospital", "Laboratory", "Pharmacy", "Dental clinic", "Medical center", "Distributor", "Other"];

export const waLink = (n: string) => `https://wa.me/${n.replace(/[^\d]/g, "").replace(/^0+/, "")}`;
export const telLink = (n: string) => `tel:${n.replace(/[^\d+]/g, "")}`;
export const directionsLink = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
// Unit prices can have up to 4 decimals (0.3375 a piece); totals are already rounded to cents.
export const usd = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
export const priceInput = (n: number) => n.toFixed(4).replace(/0{1,2}$/, "");

// Out of stock, or at or below the low-stock level accounting set for the item.
export const isLowStock = (p: { stock: number | null; minStock: number | null }) => p.stock != null && (p.stock <= 0 || (p.minStock != null && p.stock <= p.minStock));
export const stockLabel = (p: { stock: number | null; unit: string }) => (p.stock == null ? null : p.stock <= 0 ? "Out of stock" : `${p.stock.toLocaleString("en-US")} in stock`);
