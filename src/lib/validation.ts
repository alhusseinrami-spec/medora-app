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

// ---- Field sales ----

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
export const GpsFix = z.object({ lat, lng, accuracy: z.number().min(0).max(100000) });
export type GpsFix = z.infer<typeof GpsFix>;

const clientFields = {
  name: text(200).min(1, "Add the client's name."),
  placeType: text(60),
  phone: text(50),
  whatsapp: text(50),
  email: contactFields.email,
  address: text(300),
  notes: text(5000),
  stage: z.enum(["LEAD", "PROSPECT", "CUSTOMER", "CHURNED"]),
};
export const ClientInput = z.object({
  ...clientFields,
  placeType: clientFields.placeType.default(""), phone: clientFields.phone.default(""), whatsapp: clientFields.whatsapp.default(""),
  email: clientFields.email.default(""), address: clientFields.address.default(""), notes: clientFields.notes.default(""),
  stage: clientFields.stage.default("LEAD"),
  // Where the rep is standing when they add the client. Optional so a client can be added from the office.
  location: GpsFix.nullable().optional(),
});
export const ClientPatch = z.object(clientFields).partial();

// A ready-made list of places for reps to call on, added in one go as leads.
export const LeadImport = z.object({
  rows: z.array(z.object({
    name: clientFields.name, placeType: clientFields.placeType.default(""), phone: clientFields.phone.default(""),
    address: clientFields.address.default(""), notes: clientFields.notes.default(""),
  })).min(1, "The list has no places.").max(5_000, "That list has more than 5,000 places. Split it."),
  tag: text(60).default(""),
});

export const OrderInput = z.object({
  contactId: z.string().min(1),
  kind: z.enum(["ORDER", "PROFORMA"]).default("ORDER"),
  notes: text(2000).default(""),
  visitId: z.string().nullable().optional(),
  lines: z.array(z.object({
    productId: z.string().nullable().optional(),
    description: text(200).default(""),
    quantity: z.number().int("Quantities are whole numbers.").min(1, "Quantities start at 1.").max(1_000_000),
    // Price the rep proposes; left out means the catalogue price.
    unitPrice: z.number().min(0).max(10_000_000).nullable().optional(),
  })).min(1, "Add at least one item.").max(100),
});
export type OrderInput = z.infer<typeof OrderInput>;

export const OrderReview = z.object({
  decision: z.enum(["APPROVE", "REJECT", "SAVE"]),
  note: text(2000).default(""),
  lines: z.array(z.object({
    id: z.string().min(1),
    quantity: z.number().int("Quantities are whole numbers.").min(0).max(1_000_000), // 0 removes the line
    unitPrice: z.number().min(0).max(10_000_000),
  })).max(100).default([]),
});

export const ProductInput = z.object({
  sku: text(60).min(1, "Add a product code."),
  name: text(200).min(1, "Add a product name."),
  unit: text(30).default("unit"),
  price: z.number().min(0, "Prices can't be negative.").max(10_000_000),
  active: z.boolean().default(true),
  stock: z.number().int("Stock must be a whole number.").min(-1_000_000).max(100_000_000).nullable().optional(),
  minStock: z.number().int("Low-stock level must be a whole number.").min(0, "Low-stock level can't be negative.").max(100_000_000).nullable().optional(),
});

// Rows read from an accounting export. Cells arrive as text or numbers; the service cleans them up.
const cell = z.union([z.string(), z.number()]).nullable().optional();
export const ProductImport = z.object({
  rows: z.array(z.object({ sku: cell, name: cell, unit: cell, price: cell, stock: cell, minStock: cell })).min(1, "The file has no item rows.").max(10_000, "That file has more than 10,000 items. Split it into smaller files."),
  hideMissing: z.boolean().default(false),
});
