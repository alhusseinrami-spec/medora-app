import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { can, fieldHome } from "@/lib/rbac";
import { FieldShell } from "@/components/field/FieldShell";

export const metadata = { title: { default: "Field", template: "%s · Medora Field" } };

export default async function FieldLayout({ children }: LayoutProps<"/field">) {
  const { user } = await requireAuth();
  const sells = can(user.role, "sales.field"), delivers = can(user.role, "sales.deliver");
  if (!sells && !delivers) redirect("/?denied=1");
  // Salespeople and drivers live in this app; everyone else can hop back to the Command Center.
  return <FieldShell mode={sells ? "sales" : "driver"} phoneOnly={!!fieldHome(user.role)}>{children}</FieldShell>;
}
