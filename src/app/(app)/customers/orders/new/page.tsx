import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { NewShopOrderForm } from "@/components/shopOrders/ShopOrderAdmin";

export const metadata = { title: "New shop order" };

export default async function NewShopOrderPage() {
  await requireAuth({ permission: "shop.orders" });
  return (
    <div className="max-w-3xl">
      <Link href="/customers/orders" className="text-sm text-ink-2 hover:underline">← All shop orders</Link>
      <PageHeader title="New shop order" sub="For an order that came in by phone or WhatsApp. It is saved as confirmed and shows in the customer's My orders, with its pro forma and invoice once you attach them." />
      <NewShopOrderForm />
    </div>
  );
}
