import { requireAuth } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/chat";
import { approvalCounts } from "@/lib/services/approvals";
import { pendingOrderCount } from "@/lib/services/sales";
import { can, ROLE_LABEL, type Permission } from "@/lib/rbac";
import { AppShell } from "@/components/shell/AppShell";

const NAV_PERMS: Permission[] = ["sales.review", "sales.field", "team.view"];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAuth();
  const [c, orders] = await Promise.all([approvalCounts(user.id), pendingOrderCount(user)]);
  return (
    <AppShell user={{ name: user.name, email: user.email, role: ROLE_LABEL[user.role] }} approvals={c.DRAFT + c.SUGGESTION} orders={orders}
      perms={NAV_PERMS.filter((p) => can(user.role, p))} aiReady={aiConfigured()}>
      {children}
    </AppShell>
  );
}
