// All dates are stored in UTC and shown in the user's time zone (Beirut by default).
export const TZ_DEFAULT = "Asia/Beirut";

export function dayKey(d: Date, tz = TZ_DEFAULT): string {
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value;
  return `${g("year")}-${g("month")}-${g("day")}`;
}

export const fmtDate = (d: Date, tz = TZ_DEFAULT) =>
  d.toLocaleDateString("en-GB", { timeZone: tz, weekday: "short", day: "numeric", month: "short" });

export const fmtTime = (d: Date, tz = TZ_DEFAULT) =>
  d.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });

export const fmtDateTime = (d: Date, tz = TZ_DEFAULT) => `${fmtDate(d, tz)}, ${fmtTime(d, tz)}`;

// Offset in minutes of a time zone at a given instant (positive east of UTC).
export function tzOffset(tz: string, at: Date): number {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(at);
  const g = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - at.getTime()) / 60000);
}

// "2026-10-16" + "09:00" in Beirut -> the UTC instant.
export function zonedToUtc(date: string, time: string, tz = TZ_DEFAULT): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new Error("Use YYYY-MM-DD and HH:MM.");
  const guess = new Date(`${date}T${time}:00Z`);
  const off = tzOffset(tz, guess);
  const first = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffset(tz, first);
  return off2 === off ? first : new Date(guess.getTime() - off2 * 60000);
}

export function startOfDayUtc(key: string, tz = TZ_DEFAULT) { return zonedToUtc(key, "00:00", tz); }

export function addDaysKey(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function timeKey(d: Date, tz = TZ_DEFAULT): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
}

export function ago(d: Date): string {
  const m = Math.round((Date.now() - d.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  return `${Math.round(m / 1440)} d ago`;
}
