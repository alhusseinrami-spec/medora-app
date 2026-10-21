import { requireAuth } from "@/lib/auth";
import { listDeliveries } from "@/lib/services/deliveries";
import { DeliveryCard } from "@/components/field/DeliveryCard";

export const metadata = { title: "To deliver" };

export default async function Deliveries() {
  const { user } = await requireAuth({ permission: "sales.deliver" });
  const { open, done } = await listDeliveries(user);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-[24px] font-bold">To deliver</h1>
        <p className="text-sm text-ink-2">{open.length ? `${open.length} order${open.length === 1 ? "" : "s"} waiting` : "Nothing waiting"} · {done.length} delivered today</p>
      </div>
      {open.length === 0 ? <p className="card empty text-center">No deliveries assigned to you right now. You&apos;ll get a notification when accounting gives you one.</p> : (
        <ul className="card">
          {open.map((o) => (
            <li key={o.id}><DeliveryCard d={{ id: o.id, number: o.number, total: Number(o.total), items: o.lines.length, client: o.contact.name, address: o.contact.address, placeType: o.contact.placeType }} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
