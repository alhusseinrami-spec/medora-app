import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { getClient, listProducts, recentVisitId } from "@/lib/services/sales";
import { UserError } from "@/lib/services/errors";
import { BackLink } from "@/components/field/BackLink";
import { OrderForm } from "@/components/field/OrderForm";

export const metadata = { title: "New order" };

export default async function NewOrderPage({ params, searchParams }: PageProps<"/field/clients/[id]/order">) {
  const { user } = await requireAuth({ permission: "sales.field" });
  const { id } = await params;
  const sp = await searchParams;
  const c = await getClient(user, id).catch((e) => { if (e instanceof UserError) notFound(); throw e; });
  const [products, visitId] = await Promise.all([listProducts(), recentVisitId(user, id)]);
  return (
    <div className="space-y-3">
      <BackLink href={`/field/clients/${id}`} label={c.name} />
      <OrderForm
        clientId={id} clientName={c.name} visitId={visitId}
        initialKind={sp.kind === "proforma" ? "PROFORMA" : "ORDER"}
        products={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: Number(p.price) }))}
      />
    </div>
  );
}
