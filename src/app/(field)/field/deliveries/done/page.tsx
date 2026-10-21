import { requireAuth } from "@/lib/auth";
import { listDeliveries } from "@/lib/services/deliveries";
import { fmtTime, TZ_DEFAULT } from "@/lib/time";
import { DeliveryCard } from "@/components/field/DeliveryCard";

export const metadata = { title: "Delivered today" };

export default async function DeliveredToday() {
  const { user } = await requireAuth({ permission: "sales.deliver" });
  const { done } = await listDeliveries(user);
  const tz = user.timeZone || TZ_DEFAULT;
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-bold">Delivered today</h1>
      {done.length === 0 ? <p className="card empty text-center">Nothing delivered yet today.</p> : (
        <ul className="card">
          {done.map((o) => (
            <li key={o.id}><DeliveryCard d={{ id: o.id, number: o.number, total: Number(o.total), items: o.lines.length, client: o.contact.name, address: o.contact.address, placeType: o.contact.placeType, at: fmtTime(o.deliveredAt!, tz), verified: o.deliveryVerified }} /></li>
          ))}
        </ul>
      )}
    </div>
  );
}
