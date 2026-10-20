import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getClient } from "@/lib/services/sales";
import { UserError } from "@/lib/services/errors";
import { ClientForm } from "@/components/field/ClientForm";
import { BackLink } from "@/components/field/BackLink";

export const metadata = { title: "Edit client" };

export default async function EditClientPage({ params }: PageProps<"/field/clients/[id]/edit">) {
  const { user } = await requireAuth({ permission: "sales.field" });
  const { id } = await params;
  const c = await getClient(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  return (
    <div className="space-y-3">
      <BackLink href={`/field/clients/${id}`} />
      <h1 className="text-[22px] font-bold">Edit {c.name}</h1>
      <ClientForm id={id} initial={{ name: c.name, placeType: c.placeType || "Other", phone: c.phone, whatsapp: c.whatsapp, email: c.email, address: c.address, stage: c.stage!, notes: c.notes }} />
    </div>
  );
}
