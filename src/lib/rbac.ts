import type { Role } from "@prisma/client";

export type Permission =
  | "workspace.use" // own tasks, events, contacts, reminders, chat
  | "team.view" // see other people's tasks
  | "team.assign" // assign tasks to others
  | "approvals.decide"
  | "users.manage"
  | "audit.view"
  | "data.export"
  | "data.delete"
  | "settings.company"
  | "sales.field" // field app: own clients, visits, orders
  | "sales.review" // approve, edit or reject orders and proformas; manage products
  | "sales.deliver"; // driver app: deliver the approved orders assigned to them

const GRANTS: Record<Role, Permission[]> = {
  OWNER: ["workspace.use", "team.view", "team.assign", "approvals.decide", "users.manage", "audit.view", "data.export", "data.delete", "settings.company", "sales.field", "sales.review"],
  ADMIN: ["workspace.use", "team.view", "team.assign", "users.manage", "audit.view", "data.export", "settings.company"],
  MANAGER: ["workspace.use", "team.view", "team.assign", "approvals.decide", "sales.field"],
  ACCOUNTANT: ["workspace.use", "sales.review"],
  STAFF: ["workspace.use", "sales.field"],
  SALESPERSON: ["workspace.use", "sales.field"],
  DRIVER: ["workspace.use", "sales.deliver"],
  VIEWER: [],
};

export const can = (role: Role, p: Permission) => GRANTS[role].includes(p);

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", ACCOUNTANT: "Accountant", STAFF: "Staff", SALESPERSON: "Salesperson", DRIVER: "Driver", VIEWER: "Viewer",
};

// Roles that must use an authenticator app.
export const mfaRequired = (role: Role) => role === "OWNER" || role === "ADMIN" || role === "ACCOUNTANT";

// People who work only from the phone app: they open straight into it and never see the Command Center.
export const fieldHome = (role: Role): string | null => (role === "SALESPERSON" ? "/field" : role === "DRIVER" ? "/field/deliveries" : null);

// Roles that can be given to people from Settings → Team, in the order the picker lists them.
export const ASSIGNABLE_ROLES: Role[] = ["ADMIN", "MANAGER", "ACCOUNTANT", "SALESPERSON", "DRIVER", "STAFF", "VIEWER"];
