import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a date like 2026-10-16.");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 09:30.");
const text = (max: number) => z.string().trim().max(max);

// Fields without defaults, so a partial update never resets fields it didn't mention.
const taskFields = {
  title: text(200).min(1, "Give the task a title."),
  notes: text(5000),
  priority: z.enum(["P1", "P2", "P3", "P4"]),
  status: z.enum(["TODO", "DOING", "WAITING", "DONE"]),
  due: dateKey.nullable(),
  assigneeId: z.string().nullable(),
  projectId: z.string().nullable(),
  contactId: z.string().nullable(),
};
export const TaskInput = z.object({
  ...taskFields,
  notes: taskFields.notes.default(""),
  priority: taskFields.priority.default("P3"),
  status: taskFields.status.default("TODO"),
  due: taskFields.due.optional(),
  assigneeId: taskFields.assigneeId.optional(),
  projectId: taskFields.projectId.optional(),
  contactId: taskFields.contactId.optional(),
});
export const TaskPatch = z.object(taskFields).partial();
export type TaskInput = z.infer<typeof TaskInput>;

export const EventInput = z.object({
  title: text(200).min(1, "Give the event a title."),
  date: dateKey,
  start: hhmm,
  end: hhmm,
  allDay: z.boolean().default(false),
  location: text(300).default(""),
  notes: text(5000).default(""),
  contactId: z.string().nullable().optional(),
}).refine((e) => e.allDay || e.end > e.start, { message: "End must be after start.", path: ["end"] });
export type EventInput = z.infer<typeof EventInput>;

const contactFields = {
  name: text(200).min(1, "Add a name."),
  company: text(200),
  jobTitle: text(200),
  email: z.union([z.literal(""), z.string().trim().email("That email address doesn't look right.")]),
  phone: text(50),
  whatsapp: text(50),
  category: z.enum(["CUSTOMER", "SUPPLIER", "STAFF", "PARTNER", "OTHER"]),
  tags: z.array(text(40)).max(20),
  notes: text(5000),
};
export const ContactInput = z.object({
  ...contactFields,
  company: contactFields.company.default(""), jobTitle: contactFields.jobTitle.default(""), email: contactFields.email.default(""),
  phone: contactFields.phone.default(""), whatsapp: contactFields.whatsapp.default(""), category: contactFields.category.default("OTHER"),
  tags: contactFields.tags.default([]), notes: contactFields.notes.default(""),
});
export const ContactPatch = z.object(contactFields).partial();
export type ContactInput = z.infer<typeof ContactInput>;

export const ReminderInput = z.object({
  title: text(200).min(1, "Say what to remind you about."),
  date: dateKey,
  time: hhmm,
  taskId: z.string().nullable().optional(),
  eventId: z.string().nullable().optional(),
});
export type ReminderInput = z.infer<typeof ReminderInput>;

export function firstError(e: z.ZodError): string {
  return e.issues[0]?.message ?? "Some fields are not valid.";
}
