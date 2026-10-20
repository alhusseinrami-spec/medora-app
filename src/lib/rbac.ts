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
  | "sales.review"; // approve, edit or reject orders and proformas; manage products

const GRANTS: Record<Role, Permission[]> = {
  OWNER: ["workspace.use", "team.view", "team.assign", "approvals.decide", "users.manage", "audit.view", "data.export", "data.delete", "settings.company", "sales.field", "sales.review"],
  ADMIN: ["workspace.use", "team.view", "team.assign", "users.manage", "audit.view", "data.export", "settings.company"],
  MANAGER: ["workspace.use", "team.view", "team.assign", "approvals.decide", "sales.field"],
  ACCOUNTANT: ["workspace.use", "sales.review"],
  STAFF: ["workspace.use", "sales.field"],
  VIEWER: [],
};

export const can = (role: Role, p: Permission) => GRANTS[role].includes(p);

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", ACCOUNTANT: "Accountant", STAFF: "Staff", VIEWER: "Viewer",
};

// Roles that must use an authenticator app.
export const mfaRequired = (role: Role) => role === "OWNER" || role === "ADMIN" || role === "ACCOUNTANT";
