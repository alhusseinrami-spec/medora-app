import { apiAuth } from "@/lib/auth";
import { json } from "@/lib/http";
import { search } from "@/lib/services/search";

export async function GET(req: Request) {
  const auth = await apiAuth();
  if (!auth) return json({ error: "Sign in required" }, 401);
  const q = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 100);
  return json({ hits: await search(auth.user, q) });
}
