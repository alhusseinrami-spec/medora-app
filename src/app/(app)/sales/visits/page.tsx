import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { visitsBoard } from "@/lib/services/sales";
import { addDaysKey, dayKey, fmtDate, timeKey, TZ_DEFAULT, startOfDayUtc } from "@/lib/time";
import { fmtDistance } from "@/lib/geo";
import { PageHeader } from "@/components/ui/PageHeader";
import { stageOf } from "@/components/field/gps";

export const metadata = { title: "Field visits" };

export default async function VisitsPage({ searchParams }: PageProps<"/sales/visits">) {
  const { user } = await requireAuth({ permission: "team.view" });
  const sp = await searchParams;
  const tz = user.timeZone || TZ_DEFAULT;
  const today = dayKey(new Date(), tz);
  const day = typeof sp.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : today;
  const rows = await visitsBoard(user, day);
  const totals = rows.reduce((t, r) => ({ v: t.v + r.visits.length, ok: t.ok + r.verified, o: t.o + r.orders }), { v: 0, ok: 0, o: 0 });
  return (
    <div className="max-w-5xl">
      <PageHeader title="Field visits" sub={`${fmtDate(startOfDayUtc(day, tz), tz)} · ${totals.v} visits, ${totals.ok} verified, ${totals.o} orders and proformas`}
        actions={<>
          <Link className="btn btn-sm" href={`/sales/visits?day=${addDaysKey(day, -1)}`}>← Previous day</Link>
          {day !== today && <Link className="btn btn-sm" href="/sales/visits">Today</Link>}
          {day < today && <Link className="btn btn-sm" href={`/sales/visits?day=${addDaysKey(day, 1)}`}>Next day →</Link>}
        </>}
      />
      <p className="text-sm text-ink-2 mb-4">A visit is verified when the rep&apos;s phone was within 150 m of the client&apos;s saved location, with a location fix better than 100 m.</p>
      {rows.length === 0 ? <p className="card empty">No sales reps yet. Add people with the Staff role in Settings, then they can use the field app at /field.</p> : (
        <div className="space-y-4">
          {rows.map((r) => (
            <section key={r.rep.id} className="card">
              <div className="card-h !pb-3 border-b border-line">
                <h2 className="font-bold">{r.rep.name}</h2>
                <div className="flex gap-1.5 text-xs">
                  <span className="chip">{r.visits.length} visit{r.visits.length === 1 ? "" : "s"}</span>
                  <span className={`chip ${r.verified === r.visits.length && r.visits.length ? "chip-ok" : r.verified < r.visits.length ? "chip-warn" : ""}`}>{r.verified} verified</span>
                  <span className="chip chip-teal">{r.orders} order{r.orders === 1 ? "" : "s"}</span>
                </div>
              </div>
              {r.visits.length === 0 ? <p className="empty">No visits.</p> : (
                <ul>
                  {r.visits.map((v) => (
                    <li key={v.id} className="row text-sm">
                      <span className="w-12 text-muted tabular-nums">{timeKey(v.at, tz)}</span>
                      <span className="flex-1 min-w-0"><span className="font-medium">{v.contact.name}</span> <span className="text-muted">{v.contact.placeType}</span></span>
                      <span className={`chip ${stageOf(v.contact.stage ?? "LEAD").chip} hidden sm:inline-flex`}>{stageOf(v.contact.stage ?? "LEAD").label}</span>
                      {v.orders.length > 0 && <span className="chip chip-teal">Order</span>}
                      <span className={`chip ${v.verified ? "chip-ok" : "chip-warn"}`} title={`Phone accuracy ${fmtDistance(v.accuracyM)}`}>
                        {v.verified ? "Verified" : v.distanceM == null ? "First pin" : `${fmtDistance(v.distanceM)} away`}
                      </span>
                      <a className="text-teal hover:underline text-xs" href={`https://www.openstreetmap.org/?mlat=${v.lat}&mlon=${v.lng}#map=17/${v.lat}/${v.lng}`} target="_blank" rel="noreferrer">Where</a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
