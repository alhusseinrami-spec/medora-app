import { requireAuth } from "@/lib/auth";
import { todayFor } from "@/lib/services/sales";
import { timeKey, TZ_DEFAULT } from "@/lib/time";
import { TodayView } from "@/components/field/TodayView";

export const metadata = { title: "Today" };

export default async function FieldToday() {
  const { user } = await requireAuth({ permission: "sales.field" });
  const t = await todayFor(user);
  const hour = Number(timeKey(new Date(), user.timeZone || TZ_DEFAULT).slice(0, 2));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <TodayView
      greeting={`${greeting}, ${user.name.split(" ")[0]}`}
      verifiedToday={t.verifiedToday} salesMonth={t.salesMonth} ordersMonth={t.ordersMonth}
      route={t.route.map((r) => ({ id: r.id, name: r.name, stage: r.stage!, placeType: r.placeType, lat: r.lat, lng: r.lng, due: r.due, visitedToday: r.visitedToday }))}
    />
  );
}
