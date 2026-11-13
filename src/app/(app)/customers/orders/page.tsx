import Link from "next/link";
import type { ShopOrderStatus } from "@prisma/client";
import { requireAuth } from "@/lib/auth";
import { listShopOrders, SHOP_STATUS } from "@/lib/services/shopOrders";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { PageHeader } from "@/components/ui/PageHeader";

export const metadata = { title: "Shop orders" };

const TABS: { key: string; label: string; status?: ShopOrderStatus[] }[] = [
  { key: "new", label: "New", status: ["PLACED"] },
  { key: "open", label: "Confirmed and to be delivered", status: ["CONFIRMED", "TO_DELIVER"] },
  { key: "delivered", label: "Delivered", status: ["DELIVERED"] },
  { key: "cancelled", label: "Cancelled", status: ["CANCELLED"] },
  { key: "all", label: "All" },
];

export default async function ShopOrdersPage({ searchParams }: PageProps<"/customers/orders">) {
  const { user } = await requireAuth({ permission: "shop.orders" });
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const tab = q ? TABS[4] : TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const orders = await listShopOrders(user, { status: tab.status, q });
  const tz = user.timeZone || TZ_DEFAULT;
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Shop orders"
        sub="Orders customers sent from the online shop. Each status you set, and each pro forma or invoice you attach, shows in the customer's My orders."
        actions={<Link href="/customers/orders/new" className="btn btn-primary">New order</Link>}
      />
      <div className="flex flex-wrap gap-2 items-center mb-4">
        <nav className="flex flex-wrap gap-1" aria-label="Filter">
          {TABS.map((t) => <Link key={t.key} href={`/customers/orders?tab=${t.key}`} aria-current={t === tab && !q ? "page" : undefined} className={`btn btn-sm ${t === tab && !q ? "btn-primary" : ""}`}>{t.label}</Link>)}
        </nav>
        <form className="ml-auto" action="/customers/orders"><input name="q" defaultValue={q} className="input !w-56 !min-h-[30px] !py-1" placeholder="Order no., name or phone" aria-label="Search shop orders" /></form>
      </div>
      <div className="card overflow-x-auto">
        {orders.length === 0 ? <p className="empty">{q ? "No order matches." : tab.key === "new" ? "No new orders. They appear here, and in your notifications, when a customer sends one from the shop." : "None."}</p> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Order</th><th className="p-3 font-medium">Customer</th><th className="p-3 font-medium">Items</th><th className="p-3 font-medium">Sent</th><th className="p-3 font-medium">Status</th><th className="p-3 font-medium">Documents</th></tr></thead>
            <tbody>
              {orders.map((o) => {
                const lines = o.lines as { qty: number }[];
                return (
                  <tr key={o.id} className="border-t border-line hover:bg-surface-2">
                    <td className="p-3"><Link href={`/customers/orders/${o.id}`} className="font-semibold text-teal hover:underline whitespace-nowrap">{o.ref}</Link></td>
                    <td className="p-3">{o.customer.name}<div className="text-muted text-xs" dir="ltr">{o.customer.phone}</div></td>
                    <td className="p-3">{lines.length}</td>
                    <td className="p-3 whitespace-nowrap">{fmtDateTime(o.createdAt, tz)}</td>
                    <td className="p-3"><span className={`chip ${SHOP_STATUS[o.status].chip}`}>{SHOP_STATUS[o.status].label}</span>{o.status === "TO_DELIVER" && o.estimatedAt && <div className="text-xs text-muted mt-1 whitespace-nowrap">by {fmtDateTime(o.estimatedAt, tz)}</div>}</td>
                    <td className="p-3">{o._count.documents || "None"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
