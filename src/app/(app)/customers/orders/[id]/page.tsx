import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { catalogPrices, defaultValidUntil, DOC_KIND, getShopOrder, PROFORMA_NOTE, SHOP_STATUS, suggestProformaNumber, type DocKind } from "@/lib/services/shopOrders";
import { UserError } from "@/lib/services/errors";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { CustomerLink, DocumentList, DocumentUpload, ProformaEditor, StatusPanel } from "@/components/shopOrders/ShopOrderAdmin";

export const metadata = { title: "Shop order" };


export default async function ShopOrderPage({ params }: PageProps<"/customers/orders/[id]">) {
  const { user } = await requireAuth({ permission: "shop.orders" });
  const { id } = await params;
  const o = await getShopOrder(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const tz = user.timeZone || TZ_DEFAULT;
  const st = SHOP_STATUS[o.status];
  const [prices, suggested] = await Promise.all([catalogPrices(o.lines.map((l) => l.code)), suggestProformaNumber()]);
  const lastPf = [...o.documents].reverse().find((d) => d.kind === "PROFORMA" && d.number);
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

      <ProformaEditor
        id={o.id}
        lines={o.lines.map((l) => ({ code: l.code, name: l.name, nameAr: l.nameAr ?? "", qty: l.qty, price: l.price || prices[l.code] || 0, shopPrice: l.price }))}
        number={lastPf?.number || suggested}
        validUntil={defaultValidUntil()}
        note={PROFORMA_NOTE}
        hasProforma={!!lastPf}
      />
      {o.note && <p className="card p-3 mt-4 text-sm"><span className="text-muted">Customer&apos;s note: </span>{o.note}</p>}

      <section className="card p-3 mt-4">
        <h2 className="font-semibold mb-1">Documents</h2>
        <p className="text-sm text-muted mb-3">The customer can open these in My orders. Pro formas made above appear here; you can also upload an invoice or a pro forma made elsewhere.</p>
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
