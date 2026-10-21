import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getDelivery } from "@/lib/services/deliveries";
import { UserError } from "@/lib/services/errors";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { BackLink } from "@/components/field/BackLink";
import { DeliverActions } from "@/components/field/DeliverActions";
import { fmtDistance } from "@/lib/geo";
import { usd } from "@/components/field/gps";

export const metadata = { title: "Delivery" };

export default async function DeliveryPage({ params }: PageProps<"/field/deliveries/[id]">) {
  const { user } = await requireAuth({ permission: "sales.deliver" });
  const { id } = await params;
  const o = await getDelivery(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const tz = user.timeZone || TZ_DEFAULT;
  const c = o.contact;
  return (
    <div className="space-y-4">
      <BackLink href={o.deliveredAt ? "/field/deliveries/done" : "/field/deliveries"} label={o.deliveredAt ? "Delivered today" : "To deliver"} />
      <div>
        <h1 className="text-[22px] font-bold">{c.name}</h1>
        <p className="text-sm text-ink-2">{[c.placeType, c.address].filter(Boolean).join(" · ") || "No address saved"}</p>
        <p className="text-xs text-muted mt-0.5">Order #{o.number} · taken by {o.rep.name}</p>
      </div>
      <DeliverActions id={o.id} phone={c.phone} whatsapp={c.whatsapp || c.phone} location={c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null} delivered={!!o.deliveredAt} />
      {o.deliveredAt && (
        <div className={`card p-3 text-sm ${o.deliveryVerified ? "" : "border-warn"}`}>
          <div className="font-semibold">{o.deliveryVerified ? "Delivered · location verified" : "Delivered · location not verified"}</div>
          <div className="text-ink-2">{fmtDateTime(o.deliveredAt, tz)}{o.deliveryDistanceM != null ? ` · ${fmtDistance(o.deliveryDistanceM)} from the client's pin` : ""}</div>
          {o.deliveryNote && <div className="mt-1">{o.deliveryNote}</div>}
        </div>
      )}
      <section className="card">
        <h2 className="px-4 pt-3 pb-1 font-semibold">What to hand over</h2>
        <ul>
          {o.lines.map((l) => (
            <li key={l.id} className="row !py-2.5">
              <span className="font-bold tabular-nums w-12 shrink-0">× {l.quantity}</span>
              <span className="flex-1 min-w-0">{l.description}<span className="block text-xs text-muted">{[l.product?.sku, l.product?.unit].filter(Boolean).join(" · ")}</span></span>
            </li>
          ))}
          <li className="row !justify-between font-bold"><span>Order total</span><span>{usd(Number(o.total))}</span></li>
        </ul>
      </section>
      {o.notes && <section className="card p-4 text-sm"><div className="label">Notes from the salesperson</div>{o.notes}</section>}
    </div>
  );
}
