import Link from "next/link";
import type { OrderStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { KIND_LABEL, listOrders } from "@/lib/services/sales";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { ORDER_STATUS } from "@/components/field/orderStatus";
import { usd } from "@/components/field/gps";

export const metadata = { title: "Orders" };

const TABS: { key: string; label: string; status?: OrderStatus[] }[] = [
  { key: "waiting", label: "Waiting", status: ["SUBMITTED"] },
  { key: "approved", label: "Approved", status: ["APPROVED"] },
  { key: "rejected", label: "Rejected and cancelled", status: ["REJECTED", "CANCELLED"] },
  { key: "all", label: "All" },
];

export default async function OrdersPage({ searchParams }: PageProps<"/sales/orders">) {
  const { user } = await requireAuth({ permission: "sales.review" });
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const orders = await listOrders(user, { status: tab.status });
  const tz = user.timeZone || TZ_DEFAULT;
  return (
    <div className="max-w-5xl">
      <PageHeader title="Orders and proformas" sub="Sent by sales reps from the field app. Check quantities and prices, then approve or reject." actions={<Link href="/sales/products" className="btn">Products and prices</Link>} />
      <nav className="flex flex-wrap gap-1 mb-4" aria-label="Filter">
        {TABS.map((t) => <Link key={t.key} href={`/sales/orders?tab=${t.key}`} aria-current={t === tab ? "page" : undefined} className={`btn btn-sm ${t === tab ? "btn-primary" : ""}`}>{t.label}</Link>)}
      </nav>
      <div className="card overflow-x-auto">
        {orders.length === 0 ? <p className="empty">{tab.key === "waiting" ? "Nothing waiting. New orders appear here and in your notifications." : "None."}</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">#</th><th className="p-3 font-medium">Client</th><th className="p-3 font-medium">Type</th><th className="p-3 font-medium">Rep</th><th className="p-3 font-medium">Sent</th><th className="p-3 font-medium text-right">Total</th><th className="p-3 font-medium">Status</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-line hover:bg-surface-2">
                  <td className="p-3"><Link href={`/sales/orders/${o.id}`} className="font-semibold text-teal hover:underline">#{o.number}</Link></td>
                  <td className="p-3">{o.contact.name}</td>
                  <td className="p-3">{KIND_LABEL[o.kind]}</td>
                  <td className="p-3">{o.rep.name}</td>
                  <td className="p-3 whitespace-nowrap">{fmtDateTime(o.createdAt, tz)}</td>
                  <td className="p-3 text-right font-semibold">{usd(Number(o.total))}</td>
                  <td className="p-3"><span className={`chip ${ORDER_STATUS[o.status].chip}`}>{o.status === "SUBMITTED" ? "Waiting" : ORDER_STATUS[o.status].label}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
