import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { DOC_KIND, getShopOrder, SHOP_STATUS, type DocKind } from "@/lib/services/shopOrders";
import { UserError } from "@/lib/services/errors";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerLink, DocumentList, DocumentUpload, StatusPanel } from "@/components/shopOrders/ShopOrderAdmin";

export const metadata = { title: "Shop order" };

const money = (v: number) => "$" + v.toFixed(2);

export default async function ShopOrderPage({ params }: PageProps<"/customers/orders/[id]">) {
  const { user } = await requireAuth({ permission: "shop.orders" });
  const { id } = await params;
  const o = await getShopOrder(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const tz = user.timeZone || TZ_DEFAULT;
  const st = SHOP_STATUS[o.status];
  const priced = o.lines.some((l) => l.price > 0);
  const wa = o.customer.phone.replace(/\D/g, "");
  return (
    <div className="max-w-4xl">
      <Link href="/customers/orders" className="text-sm text-ink-2 hover:underline">← All shop orders</Link>
      <PageHeader
        title={`Order ${o.ref}`}
        sub={<>{o.source === "staff" ? "Entered here" : "Sent from the shop"}, {fmtDateTime(o.createdAt, tz)}</>}
        actions={<span className={`chip ${st.chip} !text-sm !px-3 !py-1`}>{st.label}{o.status === "TO_DELIVER" && o.estimatedAt ? `, by ${fmtDateTime(o.estimatedAt, tz)}` : ""}</span>}
      />
      <div className="grid gap-3 sm:grid-cols-2 mb-4 text-sm">
        <div className="card p-3">
          <div className="text-muted text-xs">Customer</div>
          <div className="font-medium">{o.customer.name}</div>
          <div className="text-muted" dir="ltr">{o.customer.phone || "No phone"}</div>
          <div className="text-xs text-muted mt-1">{o.customer._count.orders} order{o.customer._count.orders === 1 ? "" : "s"} · {o.customer._count.phones ? "order updates reach their phone" : "phone notifications are off, so tell them on WhatsApp"}</div>
          {wa && <a className="btn btn-sm mt-2" href={`https://wa.me/${wa}`} target="_blank" rel="noopener">WhatsApp the customer</a>}
        </div>
        <div className="card p-3">
          <div className="text-muted text-xs">My orders link</div>
          <p className="text-muted mb-2">Opens this customer&apos;s orders on any phone. Send it to customers who ordered by phone or who changed phones.</p>
          <CustomerLink customerId={o.customerId} phone={wa} />
        </div>
      </div>

      <StatusPanel id={o.id} status={o.status} />

      <section className="card mt-4 overflow-x-auto">
        <h2 className="font-semibold p-3 pb-0">Items</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="p-3 font-medium">Code</th><th className="p-3 font-medium">Item</th><th className="p-3 font-medium text-right">Qty</th>{priced && <th className="p-3 font-medium text-right">Price</th>}</tr></thead>
          <tbody>
            {o.lines.map((l, i) => (
              <tr key={i} className="border-t border-line">
                <td className="p-3 whitespace-nowrap" dir="ltr">{l.code || "–"}</td>
                <td className="p-3">{l.name}{l.nameAr && l.nameAr !== l.name && <div className="text-muted text-xs" dir="rtl">{l.nameAr}</div>}</td>
                <td className="p-3 text-right">{l.qty}</td>
                {priced && <td className="p-3 text-right">{l.price ? money(l.price) : "–"}</td>}
              </tr>
            ))}
          </tbody>
          {priced && <tfoot><tr className="border-t border-line font-semibold"><td className="p-3" colSpan={3}>Estimated total (shop prices)</td><td className="p-3 text-right">{money(Number(o.total))}</td></tr></tfoot>}
        </table>
        {o.note && <p className="p-3 text-sm border-t border-line"><span className="text-muted">Note: </span>{o.note}</p>}
      </section>

      <section className="card p-3 mt-4">
        <h2 className="font-semibold mb-1">Pro forma and invoice</h2>
        <p className="text-sm text-muted mb-3">The customer can open these in My orders as soon as you attach them.</p>
        <DocumentList docs={o.documents.map((d) => ({ id: d.id, kind: DOC_KIND[d.kind as DocKind]?.label ?? d.kind, name: d.fileName, meta: `${Math.max(1, Math.round(d.sizeBytes / 1024))} KB · ${d.uploadedBy ? d.uploadedBy + ", " : ""}${fmtDateTime(d.createdAt, tz)}` }))} />
        <DocumentUpload id={o.id} />
      </section>

      <section className="card p-3 mt-4">
        <h2 className="font-semibold mb-2">History</h2>
        <ol className="grid gap-2 text-sm">
          {o.events.map((e) => (
            <li key={e.id} className="flex flex-wrap gap-x-2">
              <span className={`chip ${SHOP_STATUS[e.status].chip}`}>{SHOP_STATUS[e.status].label}</span>
              <span>{fmtDateTime(e.at, tz)}{e.byName ? ` · ${e.byName}` : ""}</span>
              {e.estimatedAt && <span className="text-muted">expected {fmtDateTime(e.estimatedAt, tz)}</span>}
              {e.note && <span className="text-muted">&ldquo;{e.note}&rdquo;</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
