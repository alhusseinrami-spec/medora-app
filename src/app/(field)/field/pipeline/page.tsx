import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { countKnownLeads, listClients } from "@/lib/services/sales";
import { can } from "@/lib/rbac";
import { LEAD_LISTS } from "@/lib/leadLists";
import { LeadLists } from "@/components/field/LeadLists";
import { fmtDate, TZ_DEFAULT } from "@/lib/time";
import { STAGES } from "@/components/field/gps";

export const metadata = { title: "Pipeline" };

export default async function Pipeline({ searchParams }: PageProps<"/field/pipeline">) {
  const { user } = await requireAuth({ permission: "sales.field" });
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const clients = await listClients(user, { q });
  const tz = user.timeZone || TZ_DEFAULT;
  const now = new Date();
  const overdue = clients.filter((c) => c.followUpAt && c.followUpAt < now);
  const lists = can(user.role, "team.view")
    ? await Promise.all(LEAD_LISTS.map(async (l) => ({ id: l.id, title: l.title, total: l.rows.length, added: await countKnownLeads(l.rows) })))
    : [];
  return (
    <div className="space-y-4">
      <h1 className="text-[24px] font-bold">My pipeline</h1>
      <form><input name="q" defaultValue={q} className="input !min-h-[42px]" placeholder="Search clients" aria-label="Search clients" /></form>
      <div className="grid grid-cols-4 gap-2">
        {STAGES.map((s) => (
          <a key={s.v} href={`#${s.v}`} className="card p-2 text-center">
            <div className="text-[20px] font-bold" style={{ color: s.color }}>{clients.filter((c) => c.stage === s.v).length}</div>
            <div className="text-xs text-ink-2">{s.label}</div>
          </a>
        ))}
      </div>
      {overdue.length > 0 && (
        <section className="card !border-danger">
          <h2 className="px-4 pt-3 pb-1 font-bold text-danger">Follow-ups overdue ({overdue.length})</h2>
          <ul>{overdue.map((c) => <li key={c.id}><Link href={`/field/clients/${c.id}`} className="row"><span className="flex-1 truncate font-medium">{c.name}</span><span className="text-xs text-danger">{fmtDate(c.followUpAt!, tz)}</span></Link></li>)}</ul>
        </section>
      )}
      {lists.length > 0 && <LeadLists lists={lists} />}
      {STAGES.map((s) => {
        const list = clients.filter((c) => c.stage === s.v);
        return (
          <section key={s.v} id={s.v} className="card scroll-mt-16">
            <h2 className="px-4 pt-3 pb-1 font-bold flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />{s.label} <span className="text-muted font-normal">({list.length})</span></h2>
            {list.length === 0 ? <p className="empty">None.</p> : (
              <ul>
                {list.map((c) => {
                  const last = c.visits[0];
                  return (
                    <li key={c.id}>
                      <Link href={`/field/clients/${c.id}`} className="row">
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{c.name}</div>
                          <div className="text-xs text-muted truncate">{[c.placeType, last ? `Visited ${fmtDate(last.at, tz)}` : "Never visited"].filter(Boolean).join(" · ")}</div>
                        </div>
                        {c.followUpAt && <span className={`chip ${c.followUpAt < now ? "chip-danger" : "chip-teal"}`}>{fmtDate(c.followUpAt, tz)}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
