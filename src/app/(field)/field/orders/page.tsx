import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { KIND_LABEL, listOrders } from "@/lib/services/sales";
import { fmtDate, TZ_DEFAULT } from "@/lib/time";
import { ORDER_STATUS } from "@/components/field/orderStatus";
import { usd } from "@/components/field/gps";

export const metadata = { title: "My orders" };

export default async function FieldOrders() {
  const { user } = await requireAuth({ permission: "sales.field" });
  const orders = await listOrders(user, { mine: true, take: 100 });
  const tz = user.timeZone || TZ_DEFAULT;
  const sum = (s: keyof typeof ORDER_STATUS) => orders.filter((o) => o.status === s && o.kind === "ORDER").reduce((t, o) => t + Number(o.total), 0);
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-bold">My orders</h1>
      <div className="card grid grid-cols-2 divide-x divide-line">
        <div className="p-3 text-center"><div className="text-[22px] font-bold">{usd(sum("SUBMITTED"))}</div><div className="text-sm text-ink-2">Waiting for accounting</div></div>
        <div className="p-3 text-center"><div className="text-[22px] font-bold">{usd(sum("APPROVED"))}</div><div className="text-sm text-ink-2">Approved</div></div>
      </div>
      {orders.length === 0 ? <p className="card empty text-center">No orders yet. Open a client and tap Take order.</p> : (
        <ul className="card">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={`/field/orders/${o.id}`} className="row !py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{o.contact.name}</div>
                  <div className="text-xs text-muted">{KIND_LABEL[o.kind]} #{o.number} · {fmtDate(o.createdAt, tz)} · {o._count.lines} item{o._count.lines === 1 ? "" : "s"}</div>
                </div>
                <div className="text-right">
                  <div className="font-semibold">{usd(Number(o.total))}</div>
                  <span className={`chip ${ORDER_STATUS[o.status].chip}`}>{o.status === "SUBMITTED" ? "Waiting" : ORDER_STATUS[o.status].label}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
