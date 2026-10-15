import { requireAuth } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { listContacts } from "@/lib/services/contacts";
import { ContactsView, type ContactRow } from "@/components/contacts/ContactsView";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: PageProps<"/contacts">) {
  const { user } = await requireAuth();
  const sp = await searchParams;
  const contacts = await listContacts(user);
  const rows: ContactRow[] = contacts.map((c) => ({ id: c.id, name: c.name, company: c.company, jobTitle: c.jobTitle, email: c.email, phone: c.phone, whatsapp: c.whatsapp, category: c.category, tags: c.tags, notes: c.notes, mine: c.ownerId === user.id }));
  return <ContactsView initial={rows} canDeleteAny={can(user.role, "data.delete")} openId={typeof sp.open === "string" ? sp.open : null} startNew={sp.new === "1"} />;
}
