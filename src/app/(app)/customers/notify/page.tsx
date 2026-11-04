import { requireAuth } from "@/lib/auth";
import { PageHeader } from "@/components/ui/PageHeader";
import { recentCampaigns, shopPageInfo, subscriberCount } from "@/lib/services/push";
import { AlertComposer, ShopUpload } from "@/components/customers/CustomerAlerts";

export const metadata = { title: "Customer alerts" };
// Sending to many phones can take a while.
export const maxDuration = 60;

export default async function CustomerAlertsPage() {
  const { user } = await requireAuth({ permission: "customers.notify" });
  const [count, campaigns, shop] = await Promise.all([subscriberCount(), recentCampaigns(), shopPageInfo()]);
  const fmt = (d: Date) => d.toLocaleString("en-GB", { timeZone: user.timeZone, dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="max-w-3xl grid gap-6">
      <PageHeader title="Customer alerts" sub="Send a notification to the phones of customers who turned them on in the online shop. Tapping it opens the shop." />

      <section className="card p-4 grid gap-1">
        <p className="text-3xl font-bold">{count}</p>
        <p className="text-sm text-ink-2">{count === 1 ? "phone has" : "phones have"} notifications turned on. Customers turn them on with the 🔔 button in the shop at <a className="underline" href="/shop" target="_blank">/shop</a>. On iPhone they first add the shop to their home screen.</p>
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">New notification</h2>
        <AlertComposer disabled={count === 0 || !shop} />
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-1">Shop page</h2>
        <p className="text-sm text-ink-2 mb-3">{shop ? `Last updated ${fmt(shop.updatedAt)}${shop.updatedBy ? ` by ${shop.updatedBy}` : ""}.` : "No shop page yet. Customers who open /shop see a short “being updated” page until you upload one."} After you change products or prices in the shop&apos;s ⚙ Admin, use “Download site file” there and upload that index.html here.</p>
        <ShopUpload />
      </section>

      <section className="card p-4">
        <h2 className="font-semibold mb-3">Sent</h2>
        {campaigns.length === 0 ? <p className="text-sm text-ink-2">Nothing sent yet.</p> : (
          <ul className="grid gap-3">
            {campaigns.map((c) => (
              <li key={c.id} className="border-b border-line pb-3 last:border-0">
                <p className="font-semibold">{c.title}</p>
                <p className="text-sm">{c.body}</p>
                <p className="text-xs text-ink-2 mt-1">{fmt(c.createdAt)} · {c.sentBy.name} · reached {c.delivered} of {c.total}{c.removed ? ` · ${c.removed} removed` : ""}{c.failed ? ` · ${c.failed} failed` : ""}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
