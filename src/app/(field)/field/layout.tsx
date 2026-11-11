import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { can, fieldHome } from "@/lib/rbac";
import { FieldShell } from "@/components/field/FieldShell";
import { FieldAppSetup } from "@/components/field/FieldAppSetup";
import type { Metadata, Viewport } from "next";

// Installable as the "Medora Field" phone app: full screen with its own icon (Android and iPhone home screen).
export const metadata: Metadata = {
  title: { default: "Field", template: "%s · Medora Field" },
  manifest: "/field.webmanifest",
  appleWebApp: { capable: true, title: "Medora Field", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/shop-icon-192.png" },
};
export const viewport: Viewport = { themeColor: "#0f5f66" };

export default async function FieldLayout({ children }: LayoutProps<"/field">) {
  const { user } = await requireAuth();
  const sells = can(user.role, "sales.field"), delivers = can(user.role, "sales.deliver");
  if (!sells && !delivers) redirect("/?denied=1");
  // Salespeople and drivers live in this app; everyone else can hop back to the Command Center.
  return <><FieldAppSetup /><FieldShell mode={sells ? "sales" : "driver"} phoneOnly={!!fieldHome(user.role)}>{children}</FieldShell></>;
}
