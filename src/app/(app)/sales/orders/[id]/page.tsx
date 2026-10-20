import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getOrder, KIND_LABEL } from "@/lib/services/sales";
import { UserError } from "@/lib/services/errors";
import { fmtDateTime, TZ_DEFAULT } from "@/lib/time";
import { PageHeader } from "@/components/ui/PageHeader";
import { ORDER_STATUS } from "@/components/field/orderStatus";
import { OrderReview } from "@/components/sales/OrderReview";

export const metadata = { title: "Review order" };

export default async function OrderReviewPage({ params }: PageProps<"/sales/orders/[id]">) {
  const { user } = await requireAuth({ permission: "sales.review" });
  const { id } = await params;
  const o = await getOrder(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const tz = user.timeZone || TZ_DEFAULT;
  return (
    <div className="max-w-4xl">
      <Link href="/sales/orders" className="text-sm text-ink-2 hover:underline">← All orders</Link>
      <PageHeader
        title={`${KIND_LABEL[o.kind]} #${o.number}`}
        sub={<>{o.contact.name}{o.contact.placeType ? ` (${o.contact.placeType})` : ""} · from {o.rep.name}, {fmtDateTime(o.createdAt, tz)}</>}
        actions={<span className={`chip ${ORDER_STATUS[o.status].chip} !text-sm !px-3 !py-1`}>{ORDER_STATUS[o.status].label}{o.edited && o.status === "APPROVED" ? " with changes" : ""}</span>}
      />
      <div className="grid gap-3 sm:grid-cols-3 mb-4 text-sm">
        <div className="card p-3"><div className="text-muted text-xs">Client</div><div className="font-medium">{o.contact.name}</div><div className="text-muted">{[o.contact.phone, o.contact.address].filter(Boolean).join(" · ") || "No phone or address"}</div></div>
        <div className="card p-3"><div className="text-muted text-xs">Taken during a visit</div><div className="font-medium">{o.visit ? `${fmtDateTime(o.visit.at, tz)}${o.visit.verified ? " · verified" : " · not verified"}` : "No, sent without a check-in"}</div></div>
        <div className="card p-3"><div className="text-muted text-xs">Rep&apos;s notes</div><div>{o.notes || "None"}</div></div>
      </div>
      <OrderReview
        id={o.id} open={o.status === "SUBMITTED"} note={o.reviewNote}
        reviewed={o.reviewedBy && o.reviewedAt ? `${o.reviewedBy.name}, ${fmtDateTime(o.reviewedAt, tz)}` : null}
        lines={o.lines.map((l) => ({ id: l.id, description: l.description, sku: l.product?.sku ?? "", unit: l.product?.unit ?? "unit", quantity: l.quantity, unitPrice: Number(l.unitPrice), requestedQty: l.requestedQty, requestedPrice: Number(l.requestedPrice) }))}
      />
    </div>
  );
}
