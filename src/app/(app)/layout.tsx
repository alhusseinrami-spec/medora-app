import { requireAuth } from "@/lib/auth";
import { aiConfigured } from "@/lib/ai/chat";
import { approvalCounts } from "@/lib/services/approvals";
import { pendingOrderCount } from "@/lib/services/sales";
import { can, ROLE_LABEL, type Permission } from "@/lib/rbac";
import { db } from "@/lib/db";
import { AppShell } from "@/components/shell/AppShell";
import { NAV } from "@/components/shell/nav";

// Every permission a menu item needs, so a new item shows for everyone allowed to use it.
const NAV_PERMS = [...new Set(NAV.flatMap((n) => (n.perm ? [n.perm] : [])))] as Permission[];

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { user } = await requireAuth();
  const [c, orders, shopOrders] = await Promise.all([
    approvalCounts(user.id), pendingOrderCount(user),
    can(user.role, "shop.orders") ? db.shopOrder.count({ where: { status: "PLACED" } }) : 0,
  ]);
  return (
    <AppShell user={{ name: user.name, email: user.email, role: ROLE_LABEL[user.role] }} approvals={c.DRAFT + c.SUGGESTION} orders={orders} shopOrders={shopOrders}
      perms={NAV_PERMS.filter((p) => can(user.role, p))} aiReady={aiConfigured()}>
      {children}
    </AppShell>
  );
}
