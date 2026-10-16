import "server-only";
import type { User } from "@prisma/client";
import { db } from "./db";
import { safeEqual } from "./crypto";
import { json, rateLimited } from "./http";

// Nour (the ElevenLabs voice assistant) calls /api/nour/* as server tools.
// She authenticates with NOUR_API_KEY in an "Authorization: Bearer" header and acts as the workspace owner.
// She can read, and she can propose actions into the Approval Center. She can never approve, send or delete.
export async function nourAuth(req: Request): Promise<{ owner: User } | { error: Response }> {
  const key = process.env.NOUR_API_KEY;
  if (!key || key.length < 32) return { error: json({ error: "Nour is not set up on this server." }, 503) };
  const got = req.headers.get("authorization") ?? "";
  if (!safeEqual(got, `Bearer ${key}`)) return { error: json({ error: "Not allowed" }, 401) };
  if (rateLimited("nour", 120, 60_000)) return { error: json({ error: "Too many requests, try again in a minute." }, 429) };
  const owner = await db.user.findFirst({ where: { role: "OWNER", disabledAt: null }, orderBy: { createdAt: "asc" } });
  if (!owner) return { error: json({ error: "No owner account exists yet." }, 503) };
  return { owner };
}
