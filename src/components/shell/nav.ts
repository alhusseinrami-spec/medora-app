import type { Permission } from "@/lib/rbac";

type NavItem = { href: string; label: string; icon: string; key: string; perm?: Permission };

export const NAV: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "home", key: "g d" },
  { href: "/tasks", label: "Tasks", icon: "tasks", key: "g t" },
  { href: "/calendar", label: "Calendar", icon: "calendar", key: "g c" },
  { href: "/contacts", label: "Contacts", icon: "contacts", key: "g p" },
  { href: "/reminders", label: "Reminders", icon: "clock", key: "g r" },
  { href: "/approvals", label: "Approvals", icon: "shield", key: "g a" },
  { href: "/sales/orders", label: "Orders", icon: "cart", key: "g o", perm: "sales.review" },
  { href: "/sales/visits", label: "Field visits", icon: "pin", key: "g v", perm: "team.view" },
  { href: "/field", label: "Field app", icon: "phone", key: "g f", perm: "sales.field" },
  { href: "/chat", label: "Assistant", icon: "chat", key: "g k" },
  { href: "/settings", label: "Settings", icon: "settings", key: "g s" },
];
