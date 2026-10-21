import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { listProducts } from "@/lib/services/sales";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProductsEditor } from "@/components/sales/ProductsEditor";

export const metadata = { title: "Products and prices" };

export default async function ProductsPage() {
  await requireAuth({ permission: "sales.review" });
  const products = await listProducts(false);
  return (
    <div className="max-w-4xl">
      <Link href="/sales/orders" className="text-sm text-ink-2 hover:underline">← Orders</Link>
      <PageHeader title="Products and prices" sub="What reps can pick when they take an order. Prices here are the starting price; you can still change them on each order." />
      <ProductsEditor initial={products.map((p) => ({ id: p.id, sku: p.sku, name: p.name, unit: p.unit, price: Number(p.price), active: p.active, stock: p.stock, minStock: p.minStock }))} />
    </div>
  );
}
