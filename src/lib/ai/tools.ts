import type Anthropic from "@anthropic-ai/sdk";
import type { User } from "@prisma/client";
import { z } from "zod";
import { db } from "../db";
import { can } from "../rbac";
import { addDaysKey, dayKey, fmtDateTime, startOfDayUtc, TZ_DEFAULT } from "../time";
import { createTask, listTasks, updateTask } from "../services/tasks";
import { createEvent, listEvents } from "../services/events";
import { createContact, listContacts } from "../services/contacts";
import { createReminder, listReminders } from "../services/reminders";
import { APPROVAL_KINDS, approvalCounts, proposeApproval } from "../services/approvals";

type Ctx = { user: User };
type ToolDef = { tool: Anthropic.Beta.BetaTool; input: z.ZodType; run: (ctx: Ctx, input: never) => Promise<unknown> };

const obj = (properties: Record<string, unknown>, required: string[] = []) =>
  ({ type: "object" as const, properties, required, additionalProperties: false });
const s = (description: string) => ({ type: "string", description });

const shortTask = (t: Awaited<ReturnType<typeof listTasks>>[number], tz: string) => ({
  id: t.id, title: t.title, status: t.status, priority: t.priority, due: t.due ? dayKey(t.due, tz) : null,
  assignee: t.assignee?.name ?? null, project: t.project?.name ?? null,
});

// The complete list of what the assistant can do. Nothing here sends, pays or deletes:
// those can only be proposed for approval (propose_approval).
export const TOOLS: Record<string, ToolDef> = {
  get_overview: {
    tool: { name: "get_overview", description: "Today's schedule, open tasks due by today, upcoming reminders and approvals waiting. Call this first for any 'what's on today' or 'what needs me' question.", input_schema: obj({}) },
    input: z.object({}),
    run: async ({ user }) => {
      const tz = user.timeZone || TZ_DEFAULT, today = dayKey(new Date(), tz);
      const [events, tasks, reminders, approvals] = await Promise.all([
        listEvents(user, startOfDayUtc(today, tz), startOfDayUtc(addDaysKey(today, 1), tz)),
        listTasks(user, { status: ["TODO", "DOING", "WAITING"], dueBefore: startOfDayUtc(addDaysKey(today, 1), tz) }),
        listReminders(user), approvalCounts(user.id),
      ]);
      return {
        today, timeZone: tz,
        events: events.map((e) => ({ id: e.id, title: e.title, when: e.allDay ? "all day" : fmtDateTime(e.start, tz), location: e.location })),
        tasksDueOrOverdue: tasks.map((t) => shortTask(t, tz)),
        reminders: reminders.slice(0, 10).map((r) => ({ title: r.title, at: fmtDateTime(r.dueAt, tz), status: r.status })),
        approvalsWaiting: approvals.DRAFT + approvals.SUGGESTION,
      };
    },
  },
  list_tasks: {
    tool: { name: "list_tasks", description: "List tasks the user can see. Optional filters: status list and a text search.", input_schema: obj({ status: { type: "array", items: { type: "string", enum: ["TODO", "DOING", "WAITING", "DONE"] } }, query: s("Words to search in title or notes") }) },
    input: z.object({ status: z.array(z.enum(["TODO", "DOING", "WAITING", "DONE"])).optional(), query: z.string().optional() }),
    run: async ({ user }, i: { status?: ("TODO" | "DOING" | "WAITING" | "DONE")[]; query?: string }) =>
      (await listTasks(user, { status: i.status, q: i.query, take: 50 })).map((t) => shortTask(t, user.timeZone)),
  },
  create_task: {
    tool: { name: "create_task", description: "Add a task to the user's own task list (inside this app only). Only when the user asked for it.", input_schema: obj({ title: s("Short task title"), notes: s("Optional details"), due: s("Due date YYYY-MM-DD, optional"), priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] } }, ["title"]) },
    input: z.object({ title: z.string(), notes: z.string().optional(), due: z.string().optional(), priority: z.enum(["P1", "P2", "P3", "P4"]).optional() }),
    run: async ({ user }, i: { title: string; notes?: string; due?: string; priority?: string }) => {
      const t = await createTask(user, { ...i, due: i.due || null }, "ai");
      return { created: true, id: t.id, title: t.title, link: "/tasks" };
    },
  },
  update_task: {
    tool: { name: "update_task", description: "Change a task's status, due date, priority or title. Use list_tasks to get the id.", input_schema: obj({ taskId: s("Task id"), status: { type: "string", enum: ["TODO", "DOING", "WAITING", "DONE"] }, due: s("YYYY-MM-DD or empty to clear"), priority: { type: "string", enum: ["P1", "P2", "P3", "P4"] }, title: s("New title") }, ["taskId"]) },
    input: z.object({ taskId: z.string(), status: z.enum(["TODO", "DOING", "WAITING", "DONE"]).optional(), due: z.string().optional(), priority: z.enum(["P1", "P2", "P3", "P4"]).optional(), title: z.string().optional() }),
    run: async ({ user }, i: { taskId: string; status?: string; due?: string; priority?: string; title?: string }) => {
      const { taskId, due, ...rest } = i;
      const t = await updateTask(user, taskId, { ...rest, ...(due !== undefined ? { due: due || null } : {}) }, "ai");
      return { updated: true, id: t.id, title: t.title, status: t.status };
    },
  },
  list_events: {
    tool: { name: "list_events", description: "Calendar entries between two dates (inclusive), in the user's time zone.", input_schema: obj({ from: s("YYYY-MM-DD"), to: s("YYYY-MM-DD") }, ["from", "to"]) },
    input: z.object({ from: z.string(), to: z.string() }),
    run: async ({ user }, i: { from: string; to: string }) => {
      const tz = user.timeZone || TZ_DEFAULT;
      const evs = await listEvents(user, startOfDayUtc(i.from, tz), startOfDayUtc(addDaysKey(i.to, 1), tz));
      return evs.map((e) => ({ id: e.id, title: e.title, when: e.allDay ? `${dayKey(e.start, tz)} all day` : fmtDateTime(e.start, tz), ends: fmtDateTime(e.end, tz), location: e.location, contact: e.contact?.name ?? null }));
    },
  },
  create_event: {
    tool: { name: "create_event", description: "Add an entry to the user's own calendar in this app. Nobody is invited. Only when the user asked for it.", input_schema: obj({ title: s("Title"), date: s("YYYY-MM-DD"), start: s("HH:MM 24h"), end: s("HH:MM 24h"), location: s("Optional"), notes: s("Optional") }, ["title", "date", "start", "end"]) },
    input: z.object({ title: z.string(), date: z.string(), start: z.string(), end: z.string(), location: z.string().optional(), notes: z.string().optional() }),
    run: async ({ user }, i: Record<string, string>) => {
      const e = await createEvent(user, { ...i, allDay: false }, "ai");
      return { created: true, id: e.id, title: e.title, when: fmtDateTime(e.start, user.timeZone), link: "/calendar" };
    },
  },
  search_contacts: {
    tool: { name: "search_contacts", description: "Find contacts by name, company, email or phone.", input_schema: obj({ query: s("Search words") }, ["query"]) },
    input: z.object({ query: z.string() }),
    run: async ({ user }, i: { query: string }) =>
      (await listContacts(user, i.query, 15)).map((c) => ({ id: c.id, name: c.name, company: c.company, jobTitle: c.jobTitle, email: c.email, phone: c.phone, category: c.category, notes: c.notes.slice(0, 300) })),
  },
  create_contact: {
    tool: { name: "create_contact", description: "Save a new contact. Only when the user gave the details and asked to save them.", input_schema: obj({ name: s("Full name"), company: s("Company"), jobTitle: s("Role"), email: s("Email"), phone: s("Phone"), category: { type: "string", enum: ["CUSTOMER", "SUPPLIER", "STAFF", "PARTNER", "OTHER"] }, notes: s("Notes") }, ["name"]) },
    input: z.object({ name: z.string(), company: z.string().optional(), jobTitle: z.string().optional(), email: z.string().optional(), phone: z.string().optional(), category: z.enum(["CUSTOMER", "SUPPLIER", "STAFF", "PARTNER", "OTHER"]).optional(), notes: z.string().optional() }),
    run: async ({ user }, i: Record<string, string>) => {
      const c = await createContact(user, i, "ai");
      return { created: true, id: c.id, name: c.name, link: "/contacts" };
    },
  },
  create_reminder: {
    tool: { name: "create_reminder", description: "Set a reminder for the user at a date and time in their time zone. It appears in their notifications when due.", input_schema: obj({ title: s("What to remind about"), date: s("YYYY-MM-DD"), time: s("HH:MM 24h") }, ["title", "date", "time"]) },
    input: z.object({ title: z.string(), date: z.string(), time: z.string() }),
    run: async ({ user }, i: { title: string; date: string; time: string }) => {
      const r = await createReminder(user, i, "ai");
      return { created: true, id: r.id, title: r.title, at: fmtDateTime(r.dueAt, user.timeZone), link: "/reminders" };
    },
  },
  propose_approval: {
    tool: {
      name: "propose_approval",
      description: `Prepare an action that needs the user's approval in the Approval Center. Use for anything consequential: deleting, assigning work to someone else, or remembering a preference. Kinds: ${Object.entries(APPROVAL_KINDS).map(([k, v]) => `${k} (${v.label})`).join("; ")}. Payloads: task.create {title, notes?, due?, priority?}; task.assign {taskId, assigneeId}; task.delete {taskId}; event.delete {eventId}; contact.delete {contactId}; memory.save {content, kind: preference|fact}.`,
      input_schema: obj({ kind: { type: "string", enum: Object.keys(APPROVAL_KINDS) }, title: s("One line the user will read in the Approval Center"), detail: s("Why, in a sentence"), payload: { type: "object", description: "Fields for this kind" } }, ["kind", "title", "payload"]),
    },
    input: z.object({ kind: z.string(), title: z.string(), detail: z.string().optional(), payload: z.record(z.string(), z.unknown()) }),
    run: async ({ user }, i: { kind: string; title: string; detail?: string; payload: Record<string, unknown> }) => {
      const ap = await proposeApproval(user, { ...i, requestedBy: "ai" });
      return { proposed: true, id: ap.id, stage: "waiting for approval", link: "/approvals" };
    },
  },
  list_team: {
    tool: { name: "list_team", description: "People with accounts in the app (for assigning work). Ids are needed for task.assign.", input_schema: obj({}) },
    input: z.object({}),
    run: async ({ user }) => {
      if (!can(user.role, "team.view")) return { error: "Your role can't see the team list." };
      return db.user.findMany({ where: { disabledAt: null }, select: { id: true, name: true, role: true } });
    },
  },
};

export const toolList = (): Anthropic.Beta.BetaTool[] => Object.values(TOOLS).map((t) => t.tool);
