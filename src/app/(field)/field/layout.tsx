import { requireAuth } from "@/lib/auth";
import { FieldShell } from "@/components/field/FieldShell";

export const metadata = { title: { default: "Field", template: "%s · Medora Field" } };

export default async function FieldLayout({ children }: LayoutProps<"/field">) {
  await requireAuth({ permission: "sales.field" });
  return <FieldShell>{children}</FieldShell>;
}
