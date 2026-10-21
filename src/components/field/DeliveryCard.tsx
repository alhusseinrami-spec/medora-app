import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import { usd } from "./gps";

export type DeliveryRow = {
  id: string; number: number; total: number; items: number; client: string; address: string;
  placeType: string; at?: string; verified?: boolean;
};

// One delivery in the driver's list.
export function DeliveryCard({ d }: { d: DeliveryRow }) {
  return (
    <Link href={`/field/deliveries/${d.id}`} className="row !py-3 !items-start">
      <span className="mt-0.5 text-teal"><Icon name="box" /></span>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{d.client}</div>
        <div className="text-sm text-ink-2 truncate">{d.address || d.placeType || "No address saved"}</div>
        <div className="text-xs text-muted mt-0.5">Order #{d.number} · {d.items} item{d.items === 1 ? "" : "s"} · {usd(d.total)}</div>
      </div>
      {d.at && <div className="text-right text-xs"><div className="font-semibold">{d.at}</div><span className={`chip ${d.verified ? "chip-ok" : "chip-warn"}`}>{d.verified ? "Verified" : "Not verified"}</span></div>}
    </Link>
  );
}
