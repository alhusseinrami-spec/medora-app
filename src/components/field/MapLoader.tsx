"use client";
import dynamic from "next/dynamic";
import type { MapClient } from "./FieldMap";

// Leaflet needs the browser's window, so the map only renders on the client.
const FieldMap = dynamic(() => import("./FieldMap").then((m) => m.FieldMap), { ssr: false, loading: () => <div className="flex-1 skel !rounded-none" /> });

export function MapLoader({ clients }: { clients: MapClient[] }) {
  return <FieldMap clients={clients} />;
}
