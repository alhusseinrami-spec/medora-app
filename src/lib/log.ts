// Structured JSON logs: one line per event, easy to ship to any log service.
type Level = "info" | "warn" | "error";
function emit(level: Level, event: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && level === "info") return;
  const line = JSON.stringify({ t: new Date().toISOString(), level, event, ...data });
  (level === "error" ? console.error : console.log)(line);
}
export const log = {
  info: (e: string, d?: Record<string, unknown>) => emit("info", e, d),
  warn: (e: string, d?: Record<string, unknown>) => emit("warn", e, d),
  error: (e: string, d?: Record<string, unknown>) => emit("error", e, d),
};
