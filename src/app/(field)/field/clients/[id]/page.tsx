import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { getClient, KIND_LABEL } from "@/lib/services/sales";
import { UserError } from "@/lib/services/errors";
import { fmtDateTime, TZ_DEFAULT, dayKey } from "@/lib/time";
import { fmtDistance } from "@/lib/geo";
import { Icon } from "@/components/ui/Icon";
import { BackLink } from "@/components/field/BackLink";
import { ClientActions } from "@/components/field/ClientActions";
import { stageOf, usd } from "@/components/field/gps";
import { ORDER_STATUS } from "@/components/field/orderStatus";

export const metadata = { title: "Client" };

function since(d: Date) {
  const days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1) return "Today";
  if (days < 2) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  const m = Math.round(days / 30);
  return m < 12 ? `${m} month${m === 1 ? "" : "s"} ago` : "Over a year ago";
}

export default async function ClientPage({ params }: PageProps<"/field/clients/[id]">) {
  const { user } = await requireAuth({ permission: "sales.field" });
  const { id } = await params;
  const c = await getClient(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const tz = user.timeZone || TZ_DEFAULT;
  const st = stageOf(c.stage!);
  const last = c.visits[0];
  const timeline = [
    ...c.visits.map((v) => ({ at: v.at, key: `v${v.id}`, el: (
      <>
        <div className="font-medium">{fmtDateTime(v.at, tz)}</div>
        <div className={`text-sm ${v.verified ? "text-ok" : "text-warn"}`}>
          {v.verified ? "Visit verified ✓" : v.distanceM == null ? "Visit, location saved" : `Visit not verified, ${fmtDistance(v.distanceM)} away`}
          {v.repId !== user.id && <span className="text-muted"> · {v.rep.name}</span>}
        </div>
      </>
    ), dot: v.verified ? "bg-ok" : "bg-warn" })),
    ...c.orders.map((o) => ({ at: o.createdAt, key: `o${o.id}`, el: (
      <Link href={`/field/orders/${o.id}`} className="block">
        <div className="font-medium">{KIND_LABEL[o.kind]} #{o.number} · {usd(Number(o.total))}</div>
        <div className="text-sm text-muted">{fmtDateTime(o.createdAt, tz)} · <span className={ORDER_STATUS[o.status].text}>{ORDER_STATUS[o.status].label}{o.edited && o.status === "APPROVED" ? " with changes" : ""}</span></div>
      </Link>
    ), dot: "bg-teal" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return (
    <div className="space-y-4">
      <BackLink href="/field" />
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="text-[24px] font-bold leading-tight">{c.name}</h1>
          <p className="text-ink-2">{[c.placeType, c.address].filter(Boolean).join(" · ") || "No type or address yet"}</p>
          {c.ownerId !== user.id && <p className="text-xs text-muted mt-0.5">Rep: {c.owner.name}</p>}
        </div>
        <span className={`chip ${st.chip} !text-[13px] !px-3 !py-1`}>{st.label}</span>
      </div>
      <Link href={`/field/clients/${c.id}/edit`} className="btn"><Icon name="edit" size={18} />Edit</Link>

      <div className="grid grid-cols-2 gap-3">
        <div className="card p-3"><div className="text-xs text-muted">Last visit</div><div className="font-semibold">{last ? since(last.at) : "Never"}</div></div>
        <div className="card p-3"><div className="text-xs text-muted">Follow-up</div><div className={`font-semibold ${c.followUpAt && c.followUpAt < new Date() ? "text-danger" : ""}`}>{c.followUpAt ? fmtDateTime(c.followUpAt, tz) : "None set"}</div></div>
      </div>

      <ClientActions
        id={c.id} name={c.name} stage={c.stage!}
        phone={c.phone} whatsapp={c.whatsapp || c.phone}
        location={c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : null}
        canMovePin={can(user.role, "team.view")} today={dayKey(new Date(), tz)}
        hasFollowUp={!!c.followUpAt}
      />

      {c.notes && <section className="card p-4"><h2 className="font-bold mb-1">Notes</h2><p className="text-sm whitespace-pre-wrap">{c.notes}</p></section>}

      <section>
        <h2 className="font-bold text-[18px] mb-2">Timeline</h2>
        {timeline.length === 0 ? <p className="text-muted text-sm">No visits or orders yet.</p> : (
          <ol className="border-l-2 border-line ml-1.5 space-y-4">
            {timeline.map((t) => (
              <li key={t.key} className="relative pl-5">
                <span className={`absolute -left-[7px] top-1.5 w-3 h-3 rounded-full ${t.dot}`} />
                {t.el}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
