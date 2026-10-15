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
  | "settings.company";

const GRANTS: Record<Role, Permission[]> = {
  OWNER: ["workspace.use", "team.view", "team.assign", "approvals.decide", "users.manage", "audit.view", "data.export", "data.delete", "settings.company"],
  ADMIN: ["workspace.use", "team.view", "team.assign", "users.manage", "audit.view", "data.export", "settings.company"],
  MANAGER: ["workspace.use", "team.view", "team.assign", "approvals.decide"],
  STAFF: ["workspace.use"],
  VIEWER: [],
};

export const can = (role: Role, p: Permission) => GRANTS[role].includes(p);

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner", ADMIN: "Admin", MANAGER: "Manager", STAFF: "Staff", VIEWER: "Viewer",
};

// Roles that must use an authenticator app.
export const mfaRequired = (role: Role) => role === "OWNER" || role === "ADMIN";
