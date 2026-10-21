import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getOrder, KIND_LABEL } from "@/lib/services/sales";
import { UserError } from "@/lib/services/errors";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { BackLink } from "@/components/field/BackLink";
import { ORDER_STATUS } from "@/components/field/orderStatus";
import { usd } from "@/components/field/gps";
import { CancelOrder } from "@/components/field/CancelOrder";

export const metadata = { title: "Order" };

export default async function FieldOrder({ params, searchParams }: PageProps<"/field/orders/[id]">) {
  const { user } = await requireAuth({ permission: "sales.field" });
  const { id } = await params;
  const sp = await searchParams;
  const o = await getOrder(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const tz = user.timeZone || TZ_DEFAULT;
  const s = ORDER_STATUS[o.status];
  return (
    <div className="space-y-4">
      <BackLink href="/field/orders" label="My orders" />
      {sp.sent === "1" && <p role="status" className="card p-3 !border-ok text-ok font-semibold text-sm">Sent. Accounting has been notified, and you&apos;ll get a notification when they decide.</p>}
      <div>
        <h1 className="text-[22px] font-bold">{KIND_LABEL[o.kind]} #{o.number}</h1>
        <p className="text-ink-2">{o.contact.name} · {fmtDateTime(o.createdAt, tz)}</p>
      </div>
      <div className="card p-3">
        <span className={`chip ${s.chip}`}>{s.label}{o.edited && o.status === "APPROVED" ? " with changes" : ""}</span>
        {o.reviewedBy && o.reviewedAt && <p className="text-sm text-muted mt-1">By {o.reviewedBy.name}, {fmtDateTime(o.reviewedAt, tz)}</p>}
        {o.reviewNote && <p className="text-sm mt-1">&ldquo;{o.reviewNote}&rdquo;</p>}
        {o.kind === "ORDER" && o.status === "APPROVED" && (
          <p className="text-sm mt-1">{o.deliveredAt ? <span className="text-ok font-semibold">Delivered {fmtDateTime(o.deliveredAt, tz)}</span> : o.driver ? `Out for delivery with ${o.driver.name}` : "Waiting for a driver"}</p>
        )}
      </div>
      <ul className="card">
        {o.lines.map((l) => {
          const changed = l.quantity !== l.requestedQty || !l.unitPrice.equals(l.requestedPrice);
          return (
            <li key={l.id} className="row !items-start">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{l.description}</div>
                <div className="text-sm text-ink-2">{l.quantity} × {usd(Number(l.unitPrice))}</div>
                {changed && <div className="text-xs text-warn">You asked for {l.requestedQty} × {usd(Number(l.requestedPrice))}</div>}
              </div>
              <div className="font-semibold">{usd(l.quantity * Number(l.unitPrice))}</div>
            </li>
          );
        })}
        <li className="row !justify-between font-bold"><span>Total</span><span>{usd(Number(o.total))}</span></li>
      </ul>
      {o.notes && <div className="card p-3 text-sm"><div className="label">Your notes</div>{o.notes}</div>}
      {o.status === "SUBMITTED" && o.repId === user.id && <CancelOrder id={o.id} />}
    </div>
  );
}
