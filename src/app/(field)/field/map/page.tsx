import { requireAuth } from "@/lib/auth";
import { listClients } from "@/lib/services/sales";
import { MapLoader } from "@/components/field/MapLoader";

export const metadata = { title: "Map" };

export default async function FieldMapPage() {
  const { user } = await requireAuth({ permission: "sales.field" });
  const clients = await listClients(user);
  return (
    <MapLoader clients={clients.filter((c) => c.lat != null && c.lng != null).map((c) => ({ id: c.id, name: c.name, stage: c.stage!, placeType: c.placeType, lat: c.lat!, lng: c.lng! }))} />
  );
}
