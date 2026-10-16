import { json } from "@/lib/http";
import { audit } from "@/lib/audit";
import { nourAuth } from "@/lib/nour";
import { listContacts } from "@/lib/services/contacts";
import { search } from "@/lib/services/search";

export const dynamic = "force-dynamic";

// Look up a person, company, task, meeting or reminder by name. Read only.
export async function GET(req: Request) {
  const auth = await nourAuth(req);
  if ("error" in auth) return auth.error;
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 100);
  if (q.length < 2) return json({ error: "Say at least two letters of what to look up." }, 400);
  const [hits, contacts] = await Promise.all([search(auth.owner, q), listContacts(auth.owner, q, 5)]);
  await audit({ actorKind: "ai", actorId: auth.owner.id, action: "nour.lookup", entity: "system", meta: { q } });
  return json({
    contacts: contacts.map((c) => ({ name: c.name, company: c.company || null, role: c.jobTitle || null, phone: c.phone || null, email: c.email || null, notes: c.notes.slice(0, 300) || null })),
    other_matches: hits.filter((h) => h.kind !== "contact").map((h) => ({ type: h.kind, title: h.title, detail: h.sub })),
  });
}
