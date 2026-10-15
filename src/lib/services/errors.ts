export class UserError extends Error {
  constructor(message: string, public code: "invalid" | "not_found" | "forbidden" = "invalid") { super(message); }
}
