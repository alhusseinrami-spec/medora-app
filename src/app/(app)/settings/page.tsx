import { requireAuth } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, ROLE_LABEL } from "@/lib/rbac";
import { ago, fmtDateTime } from "@/lib/time";
import { aiConfigured, MODEL } from "@/lib/ai/chat";
import { PageHeader } from "@/components/ui/PageHeader";
import { ChangePassword, DeleteMyData, MemoryList, ProfileForm, Retention, RevokeButton, TeamManager } from "@/components/settings/SettingsForms";

export const metadata = { title: "Settings" };

const Section = ({ id, title, sub, children }: { id: string; title: string; sub?: string; children: React.ReactNode }) => (
  <section id={id} className="card p-5 scroll-mt-20" aria-labelledby={`${id}-h`}>
    <h2 id={`${id}-h`} className="font-bold text-lg">{title}</h2>
    {sub && <p className="text-sm text-ink-2 mb-4">{sub}</p>}
    {!sub && <div className="mb-3" />}
    {children}
  </section>
);

// Later-phase services are listed honestly: they aren't connectable until their phase ships.
const CONNECTIONS = [
  { name: "Gmail", phase: "Phase 2", what: "Read and summarise mail, prepare drafts you approve before sending." },
  { name: "Google Calendar", phase: "Phase 2", what: "Two-way sync with this calendar and meeting preparation." },
  { name: "Medora CRM and accounting", phase: "Phase 3", what: "Customer intelligence, financial summaries and stock alerts (read-only)." },
  { name: "WhatsApp Business", phase: "Phase 4", what: "Drafted replies that wait in the Approval Center before sending." },
];

export default async function SettingsPage() {
  const { user, session } = await requireAuth();
  const [sessions, memories, users, auditRows, retention] = await Promise.all([
    db.session.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastSeenAt: "desc" } }),
    db.memory.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    can(user.role, "users.manage") ? db.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, email: true, role: true, disabledAt: true, mfaEnabled: true, createdAt: true } }) : Promise.resolve([]),
    can(user.role, "audit.view") ? db.auditLog.findMany({ orderBy: { at: "desc" }, take: 100, include: { actor: { select: { name: true } } } }) : Promise.resolve([]),
    db.setting.findFirst({ where: { userId: null, key: "retention.days" } }),
  ]);
  const zones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title="Settings" sub="Your profile, security, what the assistant remembers, and company controls." />
      <nav className="flex flex-wrap gap-1.5 mb-4 text-sm" aria-label="Settings sections">
        {["profile", "security", "memory", "connections", ...(users.length ? ["team"] : []), ...(auditRows.length ? ["audit"] : []), "data"].map((s) => <a key={s} href={`#${s}`} className="chip hover:bg-teal-soft capitalize">{s}</a>)}
      </nav>
      <div className="space-y-4 max-w-4xl">
        <Section id="profile" title="Profile">
          <ProfileForm name={user.name} timeZone={user.timeZone} zones={zones} />
          <p className="text-sm text-muted mt-3">{user.email} · {ROLE_LABEL[user.role]}</p>
        </Section>

        <Section id="security" title="Security" sub="Passwords are stored as Argon2id hashes. Sessions last 7 days from your last visit.">
          <p className="text-sm mb-3">Two-step sign-in: <strong className={user.mfaEnabled ? "text-ok" : "text-warn"}>{user.mfaEnabled ? "On" : "Off"}</strong>{!user.mfaEnabled && <> · <a className="text-teal font-semibold" href="/setup/mfa">Turn on</a></>}</p>
          <ChangePassword />
          <h3 className="font-semibold mt-5 mb-2">Signed-in devices</h3>
          <ul className="border border-line rounded-xl">
            {sessions.map((s) => (
              <li key={s.id} className="row">
                <div className="flex-1 min-w-0 text-sm"><div className="truncate">{s.userAgent ?? "Unknown device"}</div><div className="text-xs text-muted">{s.ip ?? "Unknown IP"} · active {ago(s.lastSeenAt)}</div></div>
                {s.id === session.id ? <span className="chip chip-teal">This device</span> : <RevokeButton id={s.id} />}
              </li>
            ))}
          </ul>
        </Section>

        <Section id="memory" title="Assistant memory" sub="The assistant only uses what's listed here: things you add, or suggestions you approved in the Approval Center. Delete anything at any time.">
          <MemoryList items={memories.map((m) => ({ id: m.id, content: m.content, source: m.source, approved: !!m.approvedAt }))} />
        </Section>

        <Section id="connections" title="Connections">
          <ul className="border border-line rounded-xl">
            <li className="row">
              <div className="flex-1"><div className="font-medium">Claude AI assistant</div><div className="text-xs text-muted">Powers chat and drafting. Model: {MODEL}.</div></div>
              {aiConfigured() ? <span className="chip chip-ok">Connected</span> : <span className="chip chip-warn">Needs ANTHROPIC_API_KEY on the server</span>}
            </li>
            {CONNECTIONS.map((c) => (
              <li key={c.name} className="row">
                <div className="flex-1"><div className="font-medium">{c.name}</div><div className="text-xs text-muted">{c.what}</div></div>
                <span className="chip">Arrives in {c.phase}</span>
              </li>
            ))}
          </ul>
        </Section>

        {users.length > 0 && (
          <Section id="team" title="Team and roles" sub="Owner: everything. Admin: users, audit and settings. Manager: team tasks and approvals. Staff: own workspace. Viewer: read only.">
            <TeamManager me={user.id} isOwner={user.role === "OWNER"} users={users.map((u) => ({ ...u, disabled: !!u.disabledAt, createdAt: u.createdAt.toISOString(), disabledAt: undefined }))} />
          </Section>
        )}

        {auditRows.length > 0 && (
          <Section id="audit" title="Audit log" sub="Every sign-in, change and approval, newest first. Showing the last 100.">
            <div className="overflow-x-auto border border-line rounded-xl">
              <table className="w-full text-sm min-w-[620px]">
                <thead><tr className="text-left text-muted"><th className="p-2.5 font-medium">When</th><th className="p-2.5 font-medium">Who</th><th className="p-2.5 font-medium">Action</th><th className="p-2.5 font-medium">Record</th></tr></thead>
                <tbody>{auditRows.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="p-2.5 whitespace-nowrap">{fmtDateTime(r.at, user.timeZone)}</td>
                    <td className="p-2.5">{r.actor?.name ?? (r.actorKind === "worker" ? "Background worker" : "System")}{r.actorKind === "ai" && <span className="chip chip-teal ms-1">via assistant</span>}</td>
                    <td className="p-2.5 font-mono text-xs">{r.action}</td>
                    <td className="p-2.5 text-xs text-muted">{r.entity}{r.ip ? ` · ${r.ip}` : ""}</td>
                  </tr>))}
                </tbody>
              </table>
            </div>
          </Section>
        )}

        <Section id="data" title="Your data">
          <div className="space-y-4">
            <div><a className="btn" href="/api/export" download>Download my data (JSON)</a><p className="text-xs text-muted mt-1">Tasks, calendar, contacts, reminders, approvals, conversations and memory.</p></div>
            {can(user.role, "settings.company") && <Retention days={Number(retention?.value ?? 180)} />}
            <DeleteMyData />
          </div>
        </Section>
      </div>
    </>
  );
}
