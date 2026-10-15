import { describe, expect, it } from "vitest";
import { addDaysKey, dayKey, zonedToUtc } from "@/lib/time";
import { ContactPatch, EventInput, TaskInput, TaskPatch } from "@/lib/validation";

describe("time zones", () => {
  it("converts Beirut wall time to UTC across daylight saving", () => {
    expect(zonedToUtc("2026-01-15", "09:00", "Asia/Beirut").toISOString()).toBe("2026-01-15T07:00:00.000Z"); // UTC+2
    expect(zonedToUtc("2026-07-15", "09:00", "Asia/Beirut").toISOString()).toBe("2026-07-15T06:00:00.000Z"); // UTC+3
  });
  it("finds the local day, including just after midnight", () => {
    expect(dayKey(new Date("2026-07-14T21:30:00Z"), "Asia/Beirut")).toBe("2026-07-15");
  });
  it("adds days across month ends", () => {
    expect(addDaysKey("2026-02-28", 1)).toBe("2026-03-01");
  });
});

describe("validation", () => {
  it("applies defaults when creating", () => {
    expect(TaskInput.parse({ title: "Call lab" })).toMatchObject({ status: "TODO", priority: "P3", notes: "" });
  });
  it("never resets fields on a partial update", () => {
    expect(TaskPatch.parse({ title: "Renamed" })).toEqual({ title: "Renamed" });
    expect(ContactPatch.parse({ phone: "+961 1 000000" })).toEqual({ phone: "+961 1 000000" });
  });
  it("rejects an event that ends before it starts", () => {
    expect(EventInput.safeParse({ title: "x", date: "2026-10-16", start: "10:00", end: "09:00" }).success).toBe(false);
    expect(EventInput.safeParse({ title: "x", date: "2026-10-16", start: "10:00", end: "10:30" }).success).toBe(true);
  });
  it("rejects bad dates and emails", () => {
    expect(TaskInput.safeParse({ title: "x", due: "16/10/2026" }).success).toBe(false);
    expect(ContactPatch.safeParse({ email: "not-an-email" }).success).toBe(false);
  });
});
