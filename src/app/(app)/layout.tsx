import { requireAuth } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/chat";
import { approvalCounts } from "@/lib/services/approvals";
import { ROLE_LABEL } from "@/lib/rbac";
import { AppShell } from "@/components/shell/AppShell";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAuth();
  const c = await approvalCounts(user.id);
  return (
    <AppShell user={{ name: user.name, email: user.email, role: ROLE_LABEL[user.role] }} approvals={c.DRAFT + c.SUGGESTION} aiReady={aiConfigured()}>
      {children}
    </AppShell>
  );
}
