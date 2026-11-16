import Link from "next/link";
import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { shopPageInfo, shopVersion } from "@/lib/services/push";

export const metadata = { title: "Shop products" };

// The shop's own ⚙ Admin (products, prices, offers), opened inside the Command Center.
// It edits the live shop page itself, so there is one copy of the catalogue, never a second one to keep in step.
export default async function ShopProductsPage() {
  const { user } = await requireAuth({ permission: "customers.notify" });
  const shop = await shopPageInfo();
  if (!shop) {
    return (
      <div className="max-w-3xl grid gap-6">
        <PageHeader title="Shop products" sub="Edit the products, prices and offers of the online shop." />
        <section className="card p-4 text-sm">
          There is no shop page yet. Upload the shop&apos;s index.html once under <Link className="underline" href="/customers/notify">Customer alerts</Link>, then edit its products here.
        </section>
      </div>
    );
  }
  // The version in the address makes sure the Admin opens on the page as it is now, not a copy the network kept.
  const src = `/shop?admin=1&v=${shopVersion(shop.updatedAt)}`;
  const at = shop.updatedAt.toLocaleString("en-GB", { timeZone: user.timeZone, dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="grid gap-3">
      <PageHeader title="Shop products" sub="Edit products, prices and offers, then press Save & publish. Customers see the changes within a minute."
        actions={<a className="btn btn-sm" href={src} target="_blank" rel="noopener">Open full screen</a>} />
      <p className="hidden sm:block text-xs text-ink-2 -mt-3">Live shop last saved {at}{shop.updatedBy ? ` by ${shop.updatedBy}` : ""}. If the shop changes somewhere else while this is open, Save &amp; publish stops and asks you to load the latest version, so nothing newer is overwritten.</p>
      <iframe src={src} title="Shop Admin" className="w-full rounded-xl border border-line bg-white h-[calc(100dvh-170px)] sm:h-[calc(100dvh-220px)] min-h-[480px]" />
    </div>
  );
}
