import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/time";
import { APPROVAL_KINDS, isApprovalKind, listApprovals } from "@/lib/services/approvals";
import { PageHeader } from "@/components/ui/PageHeader";
import { ApprovalCard, type ApprovalView } from "@/components/approvals/ApprovalCard";

export const metadata = { title: "Approvals" };

const TABS = [["waiting", "Waiting"], ["COMPLETED", "Done"], ["REJECTED", "Rejected"], ["all", "All"]] as const;
const STAGE_INFO = "Suggestion → Draft → Approved → Completed (or Rejected). Nothing the assistant prepares runs until you approve it here.";

const decidedToday = <T extends { decidedAt: Date | null }>(rows: T[]) => rows.filter((a) => a.decidedAt && Date.now() - a.decidedAt.getTime() < 864e5);

export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const { user } = await requireAuth();
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === sp.tab) ? (sp.tab as string) : "waiting";
  const all = await listApprovals(user);
  const shown = all.filter((a) => (tab === "all" ? true : tab === "waiting" ? a.stage === "DRAFT" || a.stage === "SUGGESTION" : a.stage === tab));
  // On the Waiting tab, keep the last day's decisions in view so the outcome of an approval stays visible.
  const recent = tab === "waiting" ? decidedToday(all).slice(0, 10) : [];
  const count = (k: string) => all.filter((a) => (k === "all" ? true : k === "waiting" ? a.stage === "DRAFT" || a.stage === "SUGGESTION" : a.stage === k)).length;

  // Resolve ids in payloads to names so the person approving sees what they're approving.
  const ids = new Set<string>();
  for (const a of [...shown, ...recent]) for (const v of Object.values((a.payload ?? {}) as Record<string, unknown>)) if (typeof v === "string" && /^c[a-z0-9]{20,}$/.test(v)) ids.add(v);
  const [tasks, events, contacts, users] = ids.size ? await Promise.all([
    db.task.findMany({ where: { id: { in: [...ids] } }, select: { id: true, title: true } }),
    db.event.findMany({ where: { id: { in: [...ids] } }, select: { id: true, title: true } }),
    db.contact.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }),
    db.user.findMany({ where: { id: { in: [...ids] } }, select: { id: true, name: true } }),
  ]) : [[], [], [], []];
  const names: Record<string, string> = Object.fromEntries([...tasks.map((t) => [t.id, `task “${t.title}”`]), ...events.map((e) => [e.id, `entry “${e.title}”`]), ...contacts.map((c) => [c.id, c.name]), ...users.map((u) => [u.id, u.name])]);

  const toView = (a: (typeof all)[number]): ApprovalView => ({
    id: a.id, kind: a.kind, kindLabel: isApprovalKind(a.kind) ? APPROVAL_KINDS[a.kind].label : a.kind, title: a.title, detail: a.detail, stage: a.stage,
    payload: a.payload as Record<string, unknown>, requestedBy: a.requestedBy, owner: a.user.name, mine: a.userId === user.id,
    created: fmtDateTime(a.createdAt, user.timeZone), decided: a.decidedAt ? `${a.decidedBy?.name ?? "Someone"} · ${fmtDateTime(a.decidedAt, user.timeZone)}` : null,
    result: a.result, resultLink: a.resultLink, names,
  });
  const views = shown.map(toView), recentViews = recent.map(toView);

  return (
    <>
      <PageHeader title="Approval Center" sub={STAGE_INFO} />
      <nav className="flex gap-1 mb-4 overflow-x-auto" aria-label="Approval stages">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/approvals?tab=${k}`} aria-current={tab === k ? "page" : undefined} className={`btn btn-sm ${tab === k ? "btn-primary" : ""}`}>{l} <span className="opacity-75">{count(k)}</span></Link>
        ))}
      </nav>
      <div className="space-y-3">
        {views.map((v) => <ApprovalCard key={v.id} a={v} />)}
        {!views.length && <div className="card empty">{tab === "waiting" ? "Nothing is waiting for you. When the assistant prepares something consequential, such as deleting a record or assigning work, it appears here first." : "Nothing here yet."}</div>}
      </div>
      {recentViews.length > 0 && (
        <section className="mt-6" aria-labelledby="recent-h">
          <h2 id="recent-h" className="card-t mb-2">Decided in the last 24 hours</h2>
          <div className="space-y-3">{recentViews.map((v) => <ApprovalCard key={v.id} a={v} />)}</div>
        </section>
      )}
    </>
  );
}
